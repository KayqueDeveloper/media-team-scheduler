// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import { getDatabase } from './index.js';
import {
  normalizeBrazilianPhone,
  normalizeRegistrationEmail,
  validatePendingRegistrationChanges
} from '../registration.js';

function publicUser(user) {
  if (!user) return null;
  const scopes = [];
  if (user.role === 'LEADER') scopes.push('LEADER');
  if (Number(user.coordinator_level) >= 1) scopes.push('COORDINATOR');
  return {
    id: user.id,
    volunteerId: user.volunteer_id ?? null,
    name: user.name,
    email: user.email,
    role: user.role,
    scopes,
    approvalStatus: user.approval_status || 'APPROVED',
    emailConfirmedAt: user.email_confirmed_at || null,
    active: Boolean(user.active)
  };
}

const USER_WITH_SCOPES_SELECT = `
  SELECT u.*,
    COALESCE((
      SELECT MAX(p.level)
      FROM proficiencies p
      JOIN volunteers scoped_volunteer ON scoped_volunteer.id = p.volunteer_id
      WHERE p.volunteer_id = u.volunteer_id AND p.role = 'COORDINATOR'
        AND scoped_volunteer.active = 1
    ), 0) AS coordinator_level
  FROM users u
`;

function pendingRegistration(row) {
  if (!row) return null;
  return {
    id: row.id,
    volunteerId: row.volunteer_id,
    authUserId: row.auth_user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    approvalStatus: row.approval_status,
    emailConfirmedAt: row.email_confirmed_at || null,
    createdAt: row.created_at
  };
}

const REGISTRATION_SELECT = `
  SELECT u.*, v.phone
  FROM users u
  JOIN volunteers v ON v.id = u.volunteer_id
`;

export async function createUser({
  name,
  email,
  role = 'VOLUNTEER',
  volunteerId = null,
  active = 1,
  authUserId = null,
  approvalStatus = 'APPROVED',
  emailConfirmedAt = null
}) {
  if (!name?.trim() || !email?.trim()) {
    throw new Error('Name and email are required.');
  }
  if (!['LEADER', 'VOLUNTEER'].includes(role)) throw new Error('Invalid user role.');
  if (!['PENDING', 'APPROVED'].includes(approvalStatus)) throw new Error('Invalid approval status.');
  if (role === 'VOLUNTEER' && !volunteerId) throw new Error('Volunteer accounts require a volunteerId.');

  const db = getDatabase();
  if (volunteerId) {
    const volunteer = await db.one('SELECT id, active FROM volunteers WHERE id = ?', [volunteerId]);
    if (!volunteer) throw new Error('Volunteer not found.');
    if (!volunteer.active && active) throw new Error('Inactive volunteers cannot receive an active account.');
  }
  const result = await db.run(
    `
    INSERT INTO users (volunteer_id, auth_user_id, name, email, role, approval_status, email_confirmed_at, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `,
    [
      volunteerId || null,
      authUserId || null,
      name.trim(),
      normalizeRegistrationEmail(email),
      role,
      approvalStatus,
      emailConfirmedAt,
      active ? 1 : 0
    ]
  );
  return getUserById(result.lastInsertRowid);
}

export async function registrationEmailExists(email) {
  const normalized = normalizeRegistrationEmail(email);
  const row = await getDatabase().one(
    `
    SELECT email FROM users WHERE LOWER(email) = LOWER(?)
    UNION ALL
    SELECT email FROM volunteers WHERE email IS NOT NULL AND LOWER(email) = LOWER(?)
    LIMIT 1
  `,
    [normalized, normalized]
  );
  return Boolean(row);
}

export async function createPendingRegistration({ authUserId, name, email, phone }) {
  if (!authUserId) throw new Error('Supabase user id is required.');
  const normalizedEmail = normalizeRegistrationEmail(email);
  const normalizedPhone = normalizeBrazilianPhone(phone);
  const normalizedName = String(name || '').trim();
  if (normalizedName.length < 3) throw new Error('Informe o nome completo.');

  const db = getDatabase();
  const userId = await db.transaction(async (tx) => {
    const volunteerResult = await tx.run(
      `
      INSERT INTO volunteers (
        name, email, phone, max_monthly_frequency, max_consecutive_sundays, allowed_shift, active
      ) VALUES (?, ?, ?, 2, 2, 'ALL', 0)
      RETURNING id
    `,
      [normalizedName, normalizedEmail, normalizedPhone]
    );
    const userResult = await tx.run(
      `
      INSERT INTO users (
        volunteer_id, auth_user_id, name, email, role, approval_status, email_confirmed_at, active
      ) VALUES (?, ?, ?, ?, 'VOLUNTEER', 'PENDING', NULL, 0)
      RETURNING id
    `,
      [volunteerResult.lastInsertRowid, authUserId, normalizedName, normalizedEmail]
    );
    return userResult.lastInsertRowid;
  });
  return getPendingRegistrationById(userId);
}

export async function getUserById(id) {
  return publicUser(await getDatabase().one(`${USER_WITH_SCOPES_SELECT} WHERE u.id = ?`, [id]));
}

export async function getAuthUserByEmail(email) {
  const row = await getDatabase().one(`${USER_WITH_SCOPES_SELECT} WHERE LOWER(u.email) = LOWER(?)`, [
    normalizeRegistrationEmail(email)
  ]);
  if (!row) return null;
  return {
    ...publicUser(row),
    authUserId: row.auth_user_id || null
  };
}

export async function setUserAuthIdentity(id, authUserId) {
  if (!authUserId) return false;
  const result = await getDatabase().run(
    `
    UPDATE users SET auth_user_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND (auth_user_id IS NULL OR auth_user_id = ?)
  `,
    [authUserId, id, authUserId]
  );
  return result.changes > 0;
}

export async function markUserEmailConfirmed(id, confirmedAt) {
  if (!confirmedAt) return false;
  const result = await getDatabase().run(
    `
    UPDATE users SET email_confirmed_at = COALESCE(email_confirmed_at, ?), updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND approval_status = 'PENDING'
  `,
    [confirmedAt, id]
  );
  return result.changes > 0;
}

export async function getPendingRegistrations({ confirmedOnly = true } = {}) {
  const rows = await getDatabase().all(`
    ${REGISTRATION_SELECT}
    WHERE u.role = 'VOLUNTEER'
      AND u.approval_status = 'PENDING'
      ${confirmedOnly ? 'AND u.email_confirmed_at IS NOT NULL' : ''}
    ORDER BY COALESCE(u.email_confirmed_at, u.created_at) DESC, u.id DESC
  `);
  return rows.map(pendingRegistration);
}

export async function getPendingRegistrationById(id) {
  return pendingRegistration(
    await getDatabase().one(
      `
    ${REGISTRATION_SELECT}
    WHERE u.id = ? AND u.role = 'VOLUNTEER' AND u.approval_status = 'PENDING'
  `,
      [id]
    )
  );
}

export async function updatePendingRegistration(id, input) {
  const changes = validatePendingRegistrationChanges(input);
  const current = await getPendingRegistrationById(id);
  if (!current) return null;
  const name = changes.name ?? current.name;
  const phone = changes.phone ?? current.phone;
  const db = getDatabase();
  await db.transaction(async (tx) => {
    await tx.run('UPDATE volunteers SET name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      name,
      phone,
      current.volunteerId
    ]);
    await tx.run('UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [name, id]);
  });
  return getPendingRegistrationById(id);
}

export async function approvePendingRegistration(id) {
  const current = await getPendingRegistrationById(id);
  if (!current) return null;
  if (!current.emailConfirmedAt) throw new Error('O e-mail precisa ser confirmado antes da aprovação.');
  const db = getDatabase();
  await db.transaction(async (tx) => {
    await tx.run('UPDATE volunteers SET active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      current.volunteerId
    ]);
    await tx.run(
      `
      UPDATE users
      SET approval_status = 'APPROVED', active = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND approval_status = 'PENDING'
    `,
      [id]
    );
  });
  return getUserById(id);
}

export async function deletePendingRegistration(id) {
  const current = await getPendingRegistrationById(id);
  if (!current) return null;
  const db = getDatabase();
  await db.transaction(async (tx) => {
    await tx.run("DELETE FROM users WHERE id = ? AND approval_status = 'PENDING'", [id]);
    await tx.run('DELETE FROM volunteers WHERE id = ?', [current.volunteerId]);
  });
  return current;
}

export async function deleteUserById(id) {
  const result = await getDatabase().run('DELETE FROM users WHERE id = ?', [id]);
  return result.changes > 0;
}

export async function getUserIdByVolunteerId(volunteerId) {
  return (
    (await getDatabase().one('SELECT id FROM users WHERE volunteer_id = ? AND active = 1', [volunteerId]))
      ?.id || null
  );
}

export async function getLeaderUserIds() {
  const rows = await getDatabase().all("SELECT id FROM users WHERE role = 'LEADER' AND active = 1");
  return rows.map((user) => user.id);
}

export async function getPublicUserByEmail(email) {
  const user = await getDatabase().one(
    `${USER_WITH_SCOPES_SELECT}
     WHERE LOWER(u.email) = LOWER(?) AND u.active = 1 AND u.approval_status = 'APPROVED'`,
    [email?.trim()]
  );
  return publicUser(user);
}

export async function ensureBootstrapProfile({ email, name = 'Líder' } = {}) {
  if (!email) return null;
  const existing = await getDatabase().one('SELECT id, role FROM users WHERE LOWER(email) = LOWER(?)', [
    email.trim()
  ]);
  if (existing) return null;
  return createUser({ name, email, role: 'LEADER' });
}
