import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getDatabase } from './index.js';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, salt, expectedHex] = String(storedHash || '').split(':');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

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

export function createUser({ name, email, password, role = 'VOLUNTEER', volunteerId = null, active = 1, allowWeakPassword = false }) {
  const minimumPasswordLength = allowWeakPassword ? 6 : 8;
  if (!name?.trim() || !email?.trim() || !password || password.length < minimumPasswordLength) {
    throw new Error(`Name, email and a password with at least ${minimumPasswordLength} characters are required.`);
  }
  if (!['LEADER', 'VOLUNTEER'].includes(role)) throw new Error('Invalid user role.');
  if (role === 'VOLUNTEER' && !volunteerId) throw new Error('Volunteer accounts require a volunteerId.');

  const db = getDatabase();
  if (volunteerId) {
    const volunteer = db.prepare(`SELECT id, active FROM volunteers WHERE id = ?`).get(volunteerId);
    if (!volunteer) throw new Error('Volunteer not found.');
    if (!volunteer.active && active) throw new Error('Inactive volunteers cannot receive an active account.');
  }
  const info = db.prepare(`
    INSERT INTO users (volunteer_id, name, email, password_hash, role, active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(volunteerId || null, name.trim(), email.trim().toLowerCase(), hashPassword(password), role, active ? 1 : 0);
  return getUserById(info.lastInsertRowid);
}

export function getUserById(id) {
  return publicUser(getDatabase().prepare(`SELECT * FROM users WHERE id = ?`).get(id));
}

export function deleteUserById(id) {
  return getDatabase().prepare(`DELETE FROM users WHERE id = ?`).run(id).changes > 0;
}

export function getUserIdByVolunteerId(volunteerId) {
  return getDatabase().prepare(`SELECT id FROM users WHERE volunteer_id = ? AND active = 1`).get(volunteerId)?.id || null;
}

export function getLeaderUserIds() {
  return getDatabase().prepare(`SELECT id FROM users WHERE role = 'LEADER' AND active = 1`).all().map(user => user.id);
}

export function getUserByEmail(email) {
  return getDatabase().prepare(`SELECT * FROM users WHERE email = ? COLLATE NOCASE`).get(email?.trim()) || null;
}

export function getPublicUserByEmail(email) {
  return publicUser(getUserByEmail(email));
}

export function authenticateUser(email, password) {
  const user = getUserByEmail(email);
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) return null;
  return publicUser(user);
}

export function createSession(userId, now = new Date()) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS).toISOString();
  getDatabase().prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(userId, hashToken(token), expiresAt);
  return { token, expiresAt };
}

export function getUserBySessionToken(token, now = new Date()) {
  if (!token) return null;
  const row = getDatabase().prepare(`
    SELECT u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > ?
      AND u.active = 1
  `).get(hashToken(token), now.toISOString());
  return publicUser(row);
}

export function revokeSession(token) {
  if (!token) return false;
  const result = getDatabase().prepare(`
    UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP
    WHERE token_hash = ? AND revoked_at IS NULL
  `).run(hashToken(token));
  return result.changes > 0;
}

export function cleanupExpiredSessions(now = new Date()) {
  return getDatabase().prepare(`DELETE FROM sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL`).run(now.toISOString()).changes;
}

export function ensureBootstrapLeader({ email, password, name = 'Líder' } = {}) {
  const db = getDatabase();
  if (!email || !password) return null;
  const existing = db.prepare(`SELECT id, role FROM users WHERE email = ? COLLATE NOCASE`).get(email.trim());
  if (existing) {
    return null;
  }
  return createUser({ name, email, password, role: 'LEADER' });
}

export function resetBootstrapLeader({ email, password, name = 'Líder', resetExisting = false } = {}) {
  if (!email || !password || !resetExisting) return ensureBootstrapLeader({ email, password, name });
  const db = getDatabase();
  const existing = db.prepare(`SELECT id FROM users WHERE email = ? COLLATE NOCASE`).get(email.trim());
  if (!existing) return createUser({ name, email, password, role: 'LEADER' });
  db.prepare(`
    UPDATE users
    SET name = ?, password_hash = ?, role = 'LEADER', active = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name.trim(), hashPassword(password), existing.id);
  return getUserById(existing.id);
}
