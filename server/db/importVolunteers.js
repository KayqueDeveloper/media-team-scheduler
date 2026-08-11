import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { closeDatabase, getDatabase } from './index.js';
import { createVolunteer, replaceVolunteerProficiencies } from './repository.js';
import { createUser } from './authRepository.js';

const inputPath = process.argv[2] || process.env.IMPORT_FILE;
const createAccounts = process.env.IMPORT_CREATE_ACCOUNTS === 'true';
const defaultPassword = process.env.IMPORT_DEFAULT_PASSWORD || '123456';

function parseInput(contents) {
  const trimmed = contents.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return JSON.parse(`[${trimmed}]`);
  }
}

function uniqueEmail(db, email, name, index) {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const taken = db.prepare(`SELECT id FROM volunteers WHERE email = ? COLLATE NOCASE`).get(normalized);
  if (!taken) return normalized;

  const [local, domain] = normalized.split('@');
  const base = `${local}+import-${index}`;
  let candidate = `${base}@${domain || 'invalid.local'}`;
  let suffix = 2;
  while (db.prepare(`SELECT id FROM volunteers WHERE email = ? COLLATE NOCASE`).get(candidate)) {
    candidate = `${base}-${suffix}@${domain || 'invalid.local'}`;
    suffix += 1;
  }
  console.log(`⚠️ E-mail duplicado de ${name}: ${normalized} → ${candidate}`);
  return candidate;
}

function importVolunteers(records) {
  if (!Array.isArray(records) || records.length === 0) throw new Error('The import file does not contain a volunteer list.');
  const db = getDatabase();
  const imported = [];

  for (const [index, record] of records.entries()) {
    if (!record?.name?.trim()) throw new Error(`Record ${index + 1} has no name.`);
    const existing = db.prepare(`
      SELECT id, email, name, active FROM volunteers
      WHERE name = ? AND COALESCE(phone, '') = COALESCE(?, '')
      LIMIT 1
    `).get(record.name.trim(), record.phone || null);
    let volunteer;
    if (existing) {
      volunteer = existing;
    } else {
      volunteer = createVolunteer({
        name: record.name.trim(),
        email: uniqueEmail(db, record.email, record.name.trim(), index + 1),
        phone: record.phone || null,
        maxMonthlyFrequency: record.maxMonthlyFrequency ?? record.maxShiftsPerMonth ?? 2,
        allowedShift: record.allowedShift || 'ALL',
        active: record.active !== false
      });
      replaceVolunteerProficiencies(volunteer.id, record.proficiencies || {});
    }

    if (createAccounts && !db.prepare(`SELECT id FROM users WHERE volunteer_id = ?`).get(volunteer.id)) {
      createUser({
        name: record.name.trim(),
        email: volunteer.email,
        password: defaultPassword,
        role: 'VOLUNTEER',
        volunteerId: volunteer.id,
        active: record.active !== false,
        allowWeakPassword: true
      });
    }
    imported.push({ name: record.name, id: volunteer.id, action: existing ? 'existing' : 'created' });
  }

  return imported;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!inputPath) {
    console.error('Usage: node server/db/importVolunteers.js <path-to-json>');
    process.exitCode = 1;
  } else {
    try {
      const records = parseInput(fs.readFileSync(inputPath, 'utf8'));
      const result = importVolunteers(records);
      console.log(`✅ Voluntários processados: ${result.length}`);
      console.log(`✅ Criados: ${result.filter(item => item.action === 'created').length}`);
      console.log(`ℹ️ Já existentes: ${result.filter(item => item.action === 'existing').length}`);
    } catch (error) {
      console.error(`❌ Importação interrompida: ${error.message}`);
      process.exitCode = 1;
    } finally {
      closeDatabase();
    }
  }
}
