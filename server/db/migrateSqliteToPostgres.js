import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase, closeDatabase } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = process.argv[2] || process.env.SQLITE_PATH || path.join(__dirname, 'database.sqlite');

const TABLES = [
  { name: 'volunteers', columns: ['id', 'name', 'email', 'phone', 'max_monthly_frequency', 'max_consecutive_sundays', 'allowed_shift', 'active', 'created_at', 'updated_at'] },
  { name: 'proficiencies', columns: ['id', 'volunteer_id', 'role', 'level', 'created_at'] },
  { name: 'unavailabilities', columns: ['id', 'volunteer_id', 'date', 'shift', 'reason', 'created_at'] },
  { name: 'schedules', columns: ['id', 'year', 'month', 'status', 'locked_slots', 'warnings', 'published_version', 'created_at', 'updated_at'] },
  { name: 'assignments', columns: ['id', 'schedule_id', 'volunteer_id', 'date', 'shift', 'role', 'is_trainee', 'created_at'] },
  { name: 'schedule_versions', columns: ['id', 'schedule_id', 'version', 'assignments', 'warnings', 'published_at'] },
  { name: 'users', columns: ['id', 'volunteer_id', 'name', 'email', 'password_hash', 'role', 'active', 'created_at', 'updated_at'] },
  { name: 'sessions', columns: ['id', 'user_id', 'token_hash', 'expires_at', 'created_at', 'revoked_at'] },
  { name: 'schedule_exchanges', columns: ['id', 'schedule_id', 'assignment_id', 'requester_id', 'target_volunteer_id', 'status', 'reason', 'rejection_reason', 'created_at', 'responded_at', 'completed_at'] },
  { name: 'schedule_change_events', columns: ['id', 'schedule_id', 'from_version', 'to_version', 'exchange_id', 'assignment_id', 'previous_volunteer_id', 'new_volunteer_id', 'changed_by_user_id', 'created_at'] },
  { name: 'notifications', columns: ['id', 'user_id', 'type', 'exchange_id', 'message', 'read_at', 'created_at'] }
];

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const source = new Database(sourcePath, { readonly: true });
  const target = getDatabase();
  await target.ready;

  if (process.env.MIGRATION_REPLACE === 'true') {
    await target.transaction(async tx => {
      for (const table of [...TABLES].reverse()) await tx.run(`DELETE FROM ${table.name}`);
    });
  }

  await target.transaction(async tx => {
    for (const table of TABLES) {
      const rows = source.prepare(`SELECT ${table.columns.join(', ')} FROM ${table.name}`).all();
      for (const row of rows) {
        const placeholders = table.columns.map(() => '?').join(', ');
        await tx.run(`
          INSERT INTO ${table.name} (${table.columns.join(', ')})
          VALUES (${placeholders})
          ON CONFLICT (id) DO NOTHING
        `, table.columns.map(column => row[column] ?? null));
      }
      console.log(`Migrated ${table.name}: ${rows.length} row(s)`);
    }
  });

  await target.transaction(async tx => {
    for (const table of TABLES) {
      await tx.one(`
        SELECT setval(
          pg_get_serial_sequence('${table.name}', 'id'),
          COALESCE((SELECT MAX(id) FROM ${table.name}), 1),
          (SELECT COUNT(*) > 0 FROM ${table.name})
        )
      `);
    }
  });

  source.close();
  await closeDatabase();
  console.log('SQLite → PostgreSQL migration completed.');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().catch(async error => {
    console.error(`Migration failed: ${error.message}`);
    await closeDatabase();
    process.exitCode = 1;
  });
}
