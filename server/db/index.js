import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DB_PATH = path.join(__dirname, 'database.sqlite');

let dbInstance = null;

export function getDatabase(dbPath = process.env.DB_PATH || DEFAULT_DB_PATH) {
  if (dbInstance) {
    return dbInstance;
  }

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbInstance = new Database(dbPath);
  dbInstance.pragma('foreign_keys = ON');

  initSchema(dbInstance);

  return dbInstance;
}

function initSchema(db) {
  db.exec(`
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
  `);

  // Migration check: ensure is_trainee and allowed_shift columns exist on existing DB
  try {
    const assignmentsInfo = db.prepare(`PRAGMA table_info(assignments)`).all();
    const hasIsTrainee = assignmentsInfo.some(col => col.name === 'is_trainee');
    if (!hasIsTrainee) {
      db.exec(`ALTER TABLE assignments ADD COLUMN is_trainee INTEGER DEFAULT 0 CHECK (is_trainee IN (0, 1))`);
    }

    const volInfo = db.prepare(`PRAGMA table_info(volunteers)`).all();
    const hasAllowedShift = volInfo.some(col => col.name === 'allowed_shift');
    if (!hasAllowedShift) {
      db.exec(`ALTER TABLE volunteers ADD COLUMN allowed_shift TEXT DEFAULT 'ALL'`);
    }

    const scheduleInfo = db.prepare(`PRAGMA table_info(schedules)`).all();
    const scheduleColumns = new Set(scheduleInfo.map(column => column.name));
    if (!scheduleColumns.has('locked_slots')) {
      db.exec(`ALTER TABLE schedules ADD COLUMN locked_slots TEXT NOT NULL DEFAULT '[]'`);
    }
    if (!scheduleColumns.has('warnings')) {
      db.exec(`ALTER TABLE schedules ADD COLUMN warnings TEXT NOT NULL DEFAULT '[]'`);
    }
    if (!scheduleColumns.has('published_version')) {
      db.exec(`ALTER TABLE schedules ADD COLUMN published_version INTEGER NOT NULL DEFAULT 0`);
    }
  } catch (err) {
    console.error('Migration error:', err);
  }
}

export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
