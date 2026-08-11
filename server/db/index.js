import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DB_PATH = path.join(__dirname, 'database.sqlite');

let dbInstance = null;
let dbKey = null;

const SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS volunteers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    max_monthly_frequency INTEGER DEFAULT 4,
    max_consecutive_sundays INTEGER DEFAULT 2,
    allowed_shift TEXT DEFAULT 'ALL' CHECK (allowed_shift IN ('MORNING', 'NIGHT', 'ALL')),
    active INTEGER DEFAULT 1 CHECK (active IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS proficiencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    volunteer_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('JIB', 'FIXED_CAM', 'SWITCHER', 'VMIX', 'COORDINATOR', 'FREEHAND')),
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (volunteer_id) REFERENCES volunteers(id) ON DELETE CASCADE,
    UNIQUE(volunteer_id, role)
  );

  CREATE TABLE IF NOT EXISTS unavailabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    volunteer_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    shift TEXT CHECK (shift IN ('MORNING', 'NIGHT', 'ALL') OR shift IS NULL),
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (volunteer_id) REFERENCES volunteers(id) ON DELETE CASCADE,
    UNIQUE(volunteer_id, date, shift)
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
    locked_slots TEXT NOT NULL DEFAULT '[]',
    warnings TEXT NOT NULL DEFAULT '[]',
    published_version INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(year, month)
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL,
    volunteer_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    shift TEXT NOT NULL CHECK (shift IN ('MORNING', 'NIGHT')),
    role TEXT NOT NULL CHECK (role IN ('JIB', 'FIXED_CAM', 'SWITCHER', 'VMIX', 'COORDINATOR', 'FREEHAND')),
    is_trainee INTEGER DEFAULT 0 CHECK (is_trainee IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
    FOREIGN KEY (volunteer_id) REFERENCES volunteers(id) ON DELETE CASCADE,
    UNIQUE(date, shift, role, is_trainee)
  );

  CREATE TABLE IF NOT EXISTS schedule_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    assignments TEXT NOT NULL,
    warnings TEXT NOT NULL DEFAULT '[]',
    published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
    UNIQUE(schedule_id, version)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    volunteer_id INTEGER UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL CHECK (role IN ('LEADER', 'VOLUNTEER')),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (volunteer_id) REFERENCES volunteers(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS schedule_exchanges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL,
    assignment_id INTEGER NOT NULL,
    requester_id INTEGER NOT NULL,
    target_volunteer_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED')),
    reason TEXT,
    rejection_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME,
    completed_at DATETIME,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (requester_id) REFERENCES volunteers(id) ON DELETE CASCADE,
    FOREIGN KEY (target_volunteer_id) REFERENCES volunteers(id) ON DELETE CASCADE,
    CHECK (requester_id != target_volunteer_id)
  );

  CREATE TABLE IF NOT EXISTS schedule_change_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL,
    from_version INTEGER NOT NULL,
    to_version INTEGER NOT NULL,
    exchange_id INTEGER,
    assignment_id INTEGER NOT NULL,
    previous_volunteer_id INTEGER NOT NULL,
    new_volunteer_id INTEGER NOT NULL,
    changed_by_user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
    FOREIGN KEY (exchange_id) REFERENCES schedule_exchanges(id) ON DELETE SET NULL,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (previous_volunteer_id) REFERENCES volunteers(id),
    FOREIGN KEY (new_volunteer_id) REFERENCES volunteers(id),
    FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    exchange_id INTEGER,
    message TEXT NOT NULL,
    read_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (exchange_id) REFERENCES schedule_exchanges(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_exchanges_requester ON schedule_exchanges(requester_id);
  CREATE INDEX IF NOT EXISTS idx_exchanges_target ON schedule_exchanges(target_volunteer_id);
  CREATE INDEX IF NOT EXISTS idx_exchanges_status ON schedule_exchanges(status);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_exchange_assignment
    ON schedule_exchanges(assignment_id) WHERE status = 'PENDING';
  CREATE INDEX IF NOT EXISTS idx_change_events_schedule ON schedule_change_events(schedule_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
`;

const POSTGRES_SCHEMA = `
  CREATE TABLE IF NOT EXISTS volunteers (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    max_monthly_frequency INTEGER DEFAULT 4,
    max_consecutive_sundays INTEGER DEFAULT 2,
    allowed_shift TEXT DEFAULT 'ALL' CHECK (allowed_shift IN ('MORNING', 'NIGHT', 'ALL')),
    active INTEGER DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS proficiencies (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('JIB', 'FIXED_CAM', 'SWITCHER', 'VMIX', 'COORDINATOR', 'FREEHAND')),
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(volunteer_id, role)
  );

  CREATE TABLE IF NOT EXISTS unavailabilities (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    shift TEXT CHECK (shift IN ('MORNING', 'NIGHT', 'ALL') OR shift IS NULL),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(volunteer_id, date, shift)
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
    locked_slots TEXT NOT NULL DEFAULT '[]',
    warnings TEXT NOT NULL DEFAULT '[]',
    published_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(year, month)
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    shift TEXT NOT NULL CHECK (shift IN ('MORNING', 'NIGHT')),
    role TEXT NOT NULL CHECK (role IN ('JIB', 'FIXED_CAM', 'SWITCHER', 'VMIX', 'COORDINATOR', 'FREEHAND')),
    is_trainee INTEGER DEFAULT 0 CHECK (is_trainee IN (0, 1)),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, shift, role, is_trainee)
  );

  CREATE TABLE IF NOT EXISTS schedule_versions (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    assignments TEXT NOT NULL,
    warnings TEXT NOT NULL DEFAULT '[]',
    published_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(schedule_id, version)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    volunteer_id INTEGER UNIQUE REFERENCES volunteers(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('LEADER', 'VOLUNTEER')),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS schedule_exchanges (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    requester_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    target_volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED')),
    reason TEXT,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CHECK (requester_id != target_volunteer_id)
  );

  CREATE TABLE IF NOT EXISTS schedule_change_events (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    from_version INTEGER NOT NULL,
    to_version INTEGER NOT NULL,
    exchange_id INTEGER REFERENCES schedule_exchanges(id) ON DELETE SET NULL,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    previous_volunteer_id INTEGER NOT NULL REFERENCES volunteers(id),
    new_volunteer_id INTEGER NOT NULL REFERENCES volunteers(id),
    changed_by_user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    exchange_id INTEGER REFERENCES schedule_exchanges(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_volunteers_email_ci ON volunteers (LOWER(email)) WHERE email IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_ci ON users (LOWER(email));
  CREATE INDEX IF NOT EXISTS idx_exchanges_requester ON schedule_exchanges(requester_id);
  CREATE INDEX IF NOT EXISTS idx_exchanges_target ON schedule_exchanges(target_volunteer_id);
  CREATE INDEX IF NOT EXISTS idx_exchanges_status ON schedule_exchanges(status);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_exchange_assignment
    ON schedule_exchanges(assignment_id) WHERE status = 'PENDING';
  CREATE INDEX IF NOT EXISTS idx_change_events_schedule ON schedule_change_events(schedule_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);

  ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
  DROP TABLE IF EXISTS sessions;
`;

function createSqliteAdapter(db) {
  const adapter = {
    dialect: 'sqlite',
    ready: Promise.resolve(),
    async one(sql, params = []) {
      return db.prepare(sql).get(...params) || null;
    },
    async all(sql, params = []) {
      return db.prepare(sql).all(...params);
    },
    async run(sql, params = []) {
      const statement = db.prepare(sql);
      if (/\bRETURNING\b/i.test(sql)) {
        const row = statement.get(...params);
        return { changes: row ? 1 : 0, lastInsertRowid: row?.id ?? null, lastID: row?.id ?? null, row };
      }
      return statement.run(...params);
    },
    async exec(sql) {
      db.exec(sql);
    },
    async transaction(callback) {
      db.exec('BEGIN');
      try {
        const result = await callback(adapter);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async close() {
      if (db.open) db.close();
    }
  };
  return adapter;
}

function replacePlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function createPostgresAdapter(connectionString) {
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
  });

  const schemaReady = pool.query(POSTGRES_SCHEMA);
  const adapterFor = client => ({
    dialect: 'postgres',
    ready: schemaReady,
    async one(sql, params = []) {
      await schemaReady;
      const result = await client.query(replacePlaceholders(sql), params);
      return result.rows[0] || null;
    },
    async all(sql, params = []) {
      await schemaReady;
      const result = await client.query(replacePlaceholders(sql), params);
      return result.rows;
    },
    async run(sql, params = []) {
      await schemaReady;
      const result = await client.query(replacePlaceholders(sql), params);
      const row = result.rows[0] || null;
      return { changes: result.rowCount, lastInsertRowid: row?.id ?? null, lastID: row?.id ?? null, row };
    },
    async exec(sql) {
      await schemaReady;
      await client.query(sql);
    }
  });

  const adapter = adapterFor(pool);
  adapter.transaction = async callback => {
    await schemaReady;
    const client = await pool.connect();
    const transactionAdapter = adapterFor(client);
    try {
      await client.query('BEGIN');
      const result = await callback(transactionAdapter);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
  adapter.close = () => pool.end();
  return adapter;
}

function initializeSqlite(db) {
  db.pragma('foreign_keys = ON');
  db.exec(SQLITE_SCHEMA);

  const assignmentsInfo = db.prepare('PRAGMA table_info(assignments)').all();
  if (!assignmentsInfo.some(column => column.name === 'is_trainee')) {
    db.exec('ALTER TABLE assignments ADD COLUMN is_trainee INTEGER DEFAULT 0 CHECK (is_trainee IN (0, 1))');
  }
  const volunteersInfo = db.prepare('PRAGMA table_info(volunteers)').all();
  if (!volunteersInfo.some(column => column.name === 'allowed_shift')) {
    db.exec("ALTER TABLE volunteers ADD COLUMN allowed_shift TEXT DEFAULT 'ALL'");
  }
  const scheduleInfo = db.prepare('PRAGMA table_info(schedules)').all();
  const scheduleColumns = new Set(scheduleInfo.map(column => column.name));
  if (!scheduleColumns.has('locked_slots')) db.exec("ALTER TABLE schedules ADD COLUMN locked_slots TEXT NOT NULL DEFAULT '[]'");
  if (!scheduleColumns.has('warnings')) db.exec("ALTER TABLE schedules ADD COLUMN warnings TEXT NOT NULL DEFAULT '[]'");
  if (!scheduleColumns.has('published_version')) db.exec('ALTER TABLE schedules ADD COLUMN published_version INTEGER NOT NULL DEFAULT 0');

  const usersInfo = db.prepare('PRAGMA table_info(users)').all();
  if (usersInfo.some(column => column.name === 'password_hash')) {
    db.exec('ALTER TABLE users DROP COLUMN password_hash');
  }
  db.exec('DROP TABLE IF EXISTS sessions');
}

export function getDatabase(dbPath) {
  if (dbInstance && dbPath === undefined) return dbInstance;
  const usePostgres = Boolean(process.env.DATABASE_URL && !dbPath);
  const resolvedPath = dbPath || process.env.DB_PATH || DEFAULT_DB_PATH;
  const nextKey = usePostgres ? `postgres:${process.env.DATABASE_URL}` : `sqlite:${resolvedPath}`;
  if (dbInstance && dbKey === nextKey) return dbInstance;
  if (dbInstance && dbKey !== nextKey) {
    throw new Error('A different database was requested while another database is still open. Close it first.');
  }

  if (usePostgres) {
    dbInstance = createPostgresAdapter(process.env.DATABASE_URL);
  } else {
    const dbDir = path.dirname(resolvedPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    const sqlite = new Database(resolvedPath);
    initializeSqlite(sqlite);
    dbInstance = createSqliteAdapter(sqlite);
  }
  dbKey = nextKey;
  return dbInstance;
}

export async function closeDatabase() {
  if (dbInstance) await dbInstance.close();
  dbInstance = null;
  dbKey = null;
}

export const POSTGRES_SCHEMA_SQL = POSTGRES_SCHEMA;
