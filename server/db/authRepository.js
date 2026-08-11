import { getDatabase } from './index.js';

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    volunteerId: user.volunteer_id ?? null,
    name: user.name,
    email: user.email,
    role: user.role,
    active: Boolean(user.active)
  };
}

export async function createUser({ name, email, role = 'VOLUNTEER', volunteerId = null, active = 1 }) {
  if (!name?.trim() || !email?.trim()) {
    throw new Error('Name and email are required.');
  }
  if (!['LEADER', 'VOLUNTEER'].includes(role)) throw new Error('Invalid user role.');
  if (role === 'VOLUNTEER' && !volunteerId) throw new Error('Volunteer accounts require a volunteerId.');

  const db = getDatabase();
  if (volunteerId) {
    const volunteer = await db.one('SELECT id, active FROM volunteers WHERE id = ?', [volunteerId]);
    if (!volunteer) throw new Error('Volunteer not found.');
    if (!volunteer.active && active) throw new Error('Inactive volunteers cannot receive an active account.');
  }
  const result = await db.run(`
    INSERT INTO users (volunteer_id, name, email, role, active)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id
  `, [volunteerId || null, name.trim(), email.trim().toLowerCase(), role, active ? 1 : 0]);
  return getUserById(result.lastInsertRowid);
}

export async function getUserById(id) {
  return publicUser(await getDatabase().one('SELECT * FROM users WHERE id = ?', [id]));
}

export async function deleteUserById(id) {
  const result = await getDatabase().run('DELETE FROM users WHERE id = ?', [id]);
  return result.changes > 0;
}

export async function getUserIdByVolunteerId(volunteerId) {
  return (await getDatabase().one('SELECT id FROM users WHERE volunteer_id = ? AND active = 1', [volunteerId]))?.id || null;
}

export async function getLeaderUserIds() {
  const rows = await getDatabase().all("SELECT id FROM users WHERE role = 'LEADER' AND active = 1");
  return rows.map(user => user.id);
}

export async function getPublicUserByEmail(email) {
  const user = await getDatabase().one(
    'SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND active = 1',
    [email?.trim()]
  );
  return publicUser(user);
}

export async function ensureBootstrapProfile({ email, name = 'Líder' } = {}) {
  if (!email) return null;
  const existing = await getDatabase().one('SELECT id, role FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()]);
  if (existing) return null;
  return createUser({ name, email, role: 'LEADER' });
}
