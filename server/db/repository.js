import { getDatabase } from './index.js';
import { ROLE_LIST, SHIFT_LIST, SCHEDULE_STATUS } from './constants.js';

// --- Volunteer Repository ---

export function createVolunteer(volunteerData) {
  const db = getDatabase();
  const {
    name,
    email = null,
    phone = null,
    maxMonthlyFrequency = 4,
    maxConsecutiveSundays = 2,
    active = 1
  } = volunteerData;

  const stmt = db.prepare(`
    INSERT INTO volunteers (name, email, phone, max_monthly_frequency, max_consecutive_sundays, active)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(name, email, phone, maxMonthlyFrequency, maxConsecutiveSundays, active ? 1 : 0);
  return getVolunteerById(info.lastInsertRowid);
}

export function getAllVolunteers({ activeOnly = false, includeProficiencies = true } = {}) {
  const db = getDatabase();
  let query = `SELECT * FROM volunteers`;
  if (activeOnly) {
    query += ` WHERE active = 1`;
  }
  query += ` ORDER BY name ASC`;

  const volunteers = db.prepare(query).all();

  if (includeProficiencies && volunteers.length > 0) {
    const profStmt = db.prepare(`SELECT * FROM proficiencies WHERE volunteer_id = ?`);
    for (const v of volunteers) {
      const profs = profStmt.all(v.id);
      v.proficiencies = {};
      profs.forEach(p => {
        v.proficiencies[p.role] = p.level;
      });
    }
  }

  return volunteers;
}

export function getVolunteerById(id) {
  const db = getDatabase();
  const volunteer = db.prepare(`SELECT * FROM volunteers WHERE id = ?`).get(id);
  if (!volunteer) return null;

  const profs = db.prepare(`SELECT * FROM proficiencies WHERE volunteer_id = ?`).all(id);
  volunteer.proficiencies = {};
  profs.forEach(p => {
    volunteer.proficiencies[p.role] = p.level;
  });

  return volunteer;
}

export function updateVolunteer(id, volunteerData) {
  const db = getDatabase();
  const current = getVolunteerById(id);
  if (!current) return null;

  const name = volunteerData.name !== undefined ? volunteerData.name : current.name;
  const email = volunteerData.email !== undefined ? volunteerData.email : current.email;
  const phone = volunteerData.phone !== undefined ? volunteerData.phone : current.phone;
  const maxMonthlyFrequency = volunteerData.maxMonthlyFrequency !== undefined ? volunteerData.maxMonthlyFrequency : current.max_monthly_frequency;
  const maxConsecutiveSundays = volunteerData.maxConsecutiveSundays !== undefined ? volunteerData.maxConsecutiveSundays : current.max_consecutive_sundays;
  const active = volunteerData.active !== undefined ? (volunteerData.active ? 1 : 0) : current.active;

  const stmt = db.prepare(`
    UPDATE volunteers
    SET name = ?, email = ?, phone = ?, max_monthly_frequency = ?, max_consecutive_sundays = ?, active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  stmt.run(name, email, phone, maxMonthlyFrequency, maxConsecutiveSundays, active, id);
  return getVolunteerById(id);
}

export function deleteVolunteer(id) {
  const db = getDatabase();
  const stmt = db.prepare(`DELETE FROM volunteers WHERE id = ?`);
  const info = stmt.run(id);
  return info.changes > 0;
}

// --- Proficiency Repository ---

export function setProficiency(volunteerId, role, level) {
  if (!ROLE_LIST.includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }
  if (level < 1 || level > 3) {
    throw new Error(`Invalid proficiency level: ${level}. Must be between 1 and 3.`);
  }

  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO proficiencies (volunteer_id, role, level)
    VALUES (?, ?, ?)
    ON CONFLICT(volunteer_id, role) DO UPDATE SET level = excluded.level
  `);

  stmt.run(volunteerId, role, level);
  return getProficienciesByVolunteerId(volunteerId);
}

export function setVolunteerProficiencies(volunteerId, proficienciesMap) {
  const db = getDatabase();
  const transaction = db.transaction((vId, profsMap) => {
    for (const [role, level] of Object.entries(profsMap)) {
      if (level > 0) {
        setProficiency(vId, role, level);
      } else {
        deleteProficiency(vId, role);
      }
    }
  });

  transaction(volunteerId, proficienciesMap);
  return getProficienciesByVolunteerId(volunteerId);
}

export function getProficienciesByVolunteerId(volunteerId) {
  const db = getDatabase();
  const profs = db.prepare(`SELECT * FROM proficiencies WHERE volunteer_id = ?`).all(volunteerId);
  const result = {};
  profs.forEach(p => {
    result[p.role] = p.level;
  });
  return result;
}

export function deleteProficiency(volunteerId, role) {
  const db = getDatabase();
  const stmt = db.prepare(`DELETE FROM proficiencies WHERE volunteer_id = ? AND role = ?`);
  const info = stmt.run(volunteerId, role);
  return info.changes > 0;
}

export function getAllProficiencies() {
  const db = getDatabase();
  return db.prepare(`SELECT * FROM proficiencies`).all();
}

// --- Unavailability Repository ---

export function addUnavailability({ volunteerId, date, shift = 'ALL', reason = null }) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO unavailabilities (volunteer_id, date, shift, reason)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(volunteer_id, date, shift) DO UPDATE SET reason = excluded.reason
  `);

  const info = stmt.run(volunteerId, date, shift, reason);
  return db.prepare(`SELECT * FROM unavailabilities WHERE id = ?`).get(info.lastInsertRowid || info.lastID);
}

export function getUnavailabilitiesByVolunteerId(volunteerId) {
  const db = getDatabase();
  return db.prepare(`SELECT * FROM unavailabilities WHERE volunteer_id = ? ORDER BY date ASC`).all(volunteerId);
}

export function getUnavailabilitiesByDateRange(startDate, endDate) {
  const db = getDatabase();
  return db.prepare(`
    SELECT u.*, v.name as volunteer_name
    FROM unavailabilities u
    JOIN volunteers v ON u.volunteer_id = v.id
    WHERE u.date >= ? AND u.date <= ?
    ORDER BY u.date ASC
  `).all(startDate, endDate);
}

export function getAllUnavailabilities() {
  const db = getDatabase();
  return db.prepare(`
    SELECT u.*, v.name as volunteer_name
    FROM unavailabilities u
    JOIN volunteers v ON u.volunteer_id = v.id
    ORDER BY u.date ASC
  `).all();
}

export function deleteUnavailability(id) {
  const db = getDatabase();
  const stmt = db.prepare(`DELETE FROM unavailabilities WHERE id = ?`);
  const info = stmt.run(id);
  return info.changes > 0;
}

// --- Schedule Repository ---

export function createSchedule({ year, month, status = SCHEDULE_STATUS.DRAFT }) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO schedules (year, month, status)
    VALUES (?, ?, ?)
  `);

  const info = stmt.run(year, month, status);
  return getScheduleById(info.lastInsertRowid);
}

export function getScheduleById(id) {
  const db = getDatabase();
  const schedule = db.prepare(`SELECT * FROM schedules WHERE id = ?`).get(id);
  if (!schedule) return null;
  schedule.assignments = getAssignmentsByScheduleId(id);
  return schedule;
}

export function getScheduleByMonthYear(year, month) {
  const db = getDatabase();
  const schedule = db.prepare(`SELECT * FROM schedules WHERE year = ? AND month = ?`).get(year, month);
  if (!schedule) return null;
  schedule.assignments = getAssignmentsByScheduleId(schedule.id);
  return schedule;
}

export function getAllSchedules() {
  const db = getDatabase();
  const schedules = db.prepare(`SELECT * FROM schedules ORDER BY year DESC, month DESC`).all();
  for (const s of schedules) {
    s.assignments = getAssignmentsByScheduleId(s.id);
  }
  return schedules;
}

export function updateScheduleStatus(id, status) {
  if (!Object.values(SCHEDULE_STATUS).includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE schedules
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(status, id);
  return getScheduleById(id);
}

export function deleteSchedule(id) {
  const db = getDatabase();
  const stmt = db.prepare(`DELETE FROM schedules WHERE id = ?`);
  const info = stmt.run(id);
  return info.changes > 0;
}

// --- Assignment Repository ---

export function createAssignment({ scheduleId, volunteerId, date, shift, role }) {
  if (!SHIFT_LIST.includes(shift)) {
    throw new Error(`Invalid shift: ${shift}`);
  }
  if (!ROLE_LIST.includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }

  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO assignments (schedule_id, volunteer_id, date, shift, role)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date, shift, role) DO UPDATE SET volunteer_id = excluded.volunteer_id, schedule_id = excluded.schedule_id
  `);

  const info = stmt.run(scheduleId, volunteerId, date, shift, role);
  return db.prepare(`SELECT * FROM assignments WHERE id = ?`).get(info.lastInsertRowid || info.lastID);
}

export function bulkCreateAssignments(assignmentsArray) {
  const db = getDatabase();
  const transaction = db.transaction((assignments) => {
    const results = [];
    for (const a of assignments) {
      results.push(createAssignment(a));
    }
    return results;
  });

  return transaction(assignmentsArray);
}

export function getAssignmentsByScheduleId(scheduleId) {
  const db = getDatabase();
  return db.prepare(`
    SELECT a.*, v.name as volunteer_name
    FROM assignments a
    JOIN volunteers v ON a.volunteer_id = v.id
    WHERE a.schedule_id = ?
    ORDER BY a.date ASC, a.shift ASC, a.role ASC
  `).all(scheduleId);
}

export function getAssignmentsByDateRange(startDate, endDate) {
  const db = getDatabase();
  return db.prepare(`
    SELECT a.*, v.name as volunteer_name
    FROM assignments a
    JOIN volunteers v ON a.volunteer_id = v.id
    WHERE a.date >= ? AND a.date <= ?
    ORDER BY a.date ASC, a.shift ASC, a.role ASC
  `).all(startDate, endDate);
}

export function getPastAssignmentsByVolunteerId(volunteerId, limit = 50) {
  const db = getDatabase();
  return db.prepare(`
    SELECT a.*, s.year, s.month, s.status as schedule_status
    FROM assignments a
    JOIN schedules s ON a.schedule_id = s.id
    WHERE a.volunteer_id = ?
    ORDER BY a.date DESC
    LIMIT ?
  `).all(volunteerId, limit);
}

export function deleteAssignment(id) {
  const db = getDatabase();
  const stmt = db.prepare(`DELETE FROM assignments WHERE id = ?`);
  const info = stmt.run(id);
  return info.changes > 0;
}

export function clearScheduleAssignments(scheduleId) {
  const db = getDatabase();
  const stmt = db.prepare(`DELETE FROM assignments WHERE schedule_id = ?`);
  const info = stmt.run(scheduleId);
  return info.changes;
}
