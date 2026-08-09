import { getDatabase } from './index.js';
import { ROLE_LIST, SHIFT_LIST, SCHEDULE_STATUS } from './constants.js';

// --- Volunteer Repository ---

export function createVolunteer(volunteerData) {
  const db = getDatabase();
  const {
    name,
    email = null,
    phone = null,
    maxMonthlyFrequency = volunteerData.maxShiftsPerMonth || 2,
    maxConsecutiveSundays = 2,
    allowedShift = 'ALL',
    active = 1
  } = volunteerData;

  const stmt = db.prepare(`
    INSERT INTO volunteers (name, email, phone, max_monthly_frequency, max_consecutive_sundays, allowed_shift, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(name, email, phone, maxMonthlyFrequency, maxConsecutiveSundays, allowedShift, active ? 1 : 0);
  return getVolunteerById(info.lastInsertRowid);
}

function formatVolunteer(v) {
  if (!v) return null;
  return {
    ...v,
    maxMonthlyFrequency: v.max_monthly_frequency,
    maxShiftsPerMonth: v.max_monthly_frequency,
    maxConsecutiveSundays: v.max_consecutive_sundays,
    allowedShift: v.allowed_shift || 'ALL',
    active: Boolean(v.active)
  };
}

export function getAllVolunteers({ activeOnly = false, includeProficiencies = true } = {}) {
  const db = getDatabase();
  let query = `SELECT * FROM volunteers`;
  if (activeOnly) {
    query += ` WHERE active = 1`;
  }
  query += ` ORDER BY name ASC`;

  const rawVolunteers = db.prepare(query).all();
  const volunteers = rawVolunteers.map(formatVolunteer);

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
  const raw = db.prepare(`SELECT * FROM volunteers WHERE id = ?`).get(id);
  if (!raw) return null;

  const volunteer = formatVolunteer(raw);
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
  const maxMonthlyFrequency = volunteerData.maxMonthlyFrequency !== undefined ? volunteerData.maxMonthlyFrequency : (volunteerData.maxShiftsPerMonth !== undefined ? volunteerData.maxShiftsPerMonth : current.max_monthly_frequency);
  const maxConsecutiveSundays = volunteerData.maxConsecutiveSundays !== undefined ? volunteerData.maxConsecutiveSundays : current.max_consecutive_sundays;
  const allowedShift = volunteerData.allowedShift !== undefined ? volunteerData.allowedShift : (current.allowed_shift || 'ALL');
  const active = volunteerData.active !== undefined ? (volunteerData.active ? 1 : 0) : (current.active ? 1 : 0);

  const stmt = db.prepare(`
    UPDATE volunteers
    SET name = ?, email = ?, phone = ?, max_monthly_frequency = ?, max_consecutive_sundays = ?, allowed_shift = ?, active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  stmt.run(name, email, phone, maxMonthlyFrequency, maxConsecutiveSundays, allowedShift, active, id);
  return getVolunteerById(id);
}

export function deleteVolunteer(id) {
  return updateVolunteer(id, { active: false });
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

export function replaceVolunteerProficiencies(volunteerId, proficienciesMap) {
  const db = getDatabase();
  const transaction = db.transaction((vId, profsMap) => {
    db.prepare(`DELETE FROM proficiencies WHERE volunteer_id = ?`).run(vId);
    for (const [role, level] of Object.entries(profsMap)) {
      if (level > 0) setProficiency(vId, role, level);
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

  stmt.run(volunteerId, date, shift, reason);
  return db.prepare(`
    SELECT * FROM unavailabilities
    WHERE volunteer_id = ? AND date = ? AND shift = ?
  `).get(volunteerId, date, shift);
}

export function getUnavailabilityById(id) {
  return getDatabase().prepare(`SELECT * FROM unavailabilities WHERE id = ?`).get(id) || null;
}

export function updateUnavailability(id, changes) {
  const db = getDatabase();
  const current = getUnavailabilityById(id);
  if (!current) return null;

  const volunteerId = changes.volunteerId ?? current.volunteer_id;
  const date = changes.date ?? current.date;
  const shift = changes.shift ?? current.shift ?? 'ALL';
  const reason = changes.reason !== undefined ? changes.reason : current.reason;
  db.prepare(`
    UPDATE unavailabilities
    SET volunteer_id = ?, date = ?, shift = ?, reason = ?
    WHERE id = ?
  `).run(volunteerId, date, shift, reason, id);
  return getUnavailabilityById(id);
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

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatSchedule(schedule) {
  if (!schedule) return null;
  return {
    ...schedule,
    lockedSlots: parseJsonArray(schedule.locked_slots),
    warnings: parseJsonArray(schedule.warnings),
    publishedVersion: Number(schedule.published_version) || 0
  };
}

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
  const schedule = formatSchedule(db.prepare(`SELECT * FROM schedules WHERE id = ?`).get(id));
  if (!schedule) return null;
  schedule.assignments = getAssignmentsByScheduleId(id);
  return schedule;
}

export function getScheduleByMonthYear(year, month) {
  const db = getDatabase();
  const schedule = formatSchedule(db.prepare(`SELECT * FROM schedules WHERE year = ? AND month = ?`).get(year, month));
  if (!schedule) return null;
  schedule.assignments = getAssignmentsByScheduleId(schedule.id);
  return schedule;
}

export function getAllSchedules() {
  const db = getDatabase();
  const schedules = db.prepare(`SELECT * FROM schedules ORDER BY year DESC, month DESC`).all().map(formatSchedule);
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

export function saveScheduleDraft(id, { assignments = [], lockedSlots = [], warnings = [] }) {
  const db = getDatabase();
  const schedule = getScheduleById(id);
  if (!schedule) return null;
  if (schedule.status !== SCHEDULE_STATUS.DRAFT) {
    throw new Error('Published schedules must be reopened before editing.');
  }

  const insert = db.prepare(`
    INSERT INTO assignments (schedule_id, volunteer_id, date, shift, role, is_trainee)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const transaction = db.transaction(() => {
    db.prepare(`DELETE FROM assignments WHERE schedule_id = ?`).run(id);
    for (const assignment of assignments) {
      insert.run(
        id,
        assignment.volunteerId,
        assignment.date,
        assignment.shift,
        assignment.role,
        assignment.isTrainee ? 1 : 0
      );
    }
    db.prepare(`
      UPDATE schedules
      SET locked_slots = ?, warnings = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(lockedSlots), JSON.stringify(warnings), id);
  });
  transaction();
  return getScheduleById(id);
}

export function publishSchedule(id, { warnings = [] } = {}) {
  const db = getDatabase();
  const transaction = db.transaction(() => {
    const rawSchedule = db.prepare(`SELECT * FROM schedules WHERE id = ?`).get(id);
    if (!rawSchedule) return null;
    if (rawSchedule.status !== SCHEDULE_STATUS.DRAFT) {
      throw new Error('Only draft schedules can be published.');
    }

    const version = (Number(rawSchedule.published_version) || 0) + 1;
    const assignments = getAssignmentsByScheduleId(id);
    db.prepare(`
      INSERT INTO schedule_versions (schedule_id, version, assignments, warnings)
      VALUES (?, ?, ?, ?)
    `).run(id, version, JSON.stringify(assignments), JSON.stringify(warnings));
    db.prepare(`
      UPDATE schedules
      SET status = ?, warnings = ?, published_version = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(SCHEDULE_STATUS.PUBLISHED, JSON.stringify(warnings), version, id);
    return version;
  });
  const version = transaction();
  return version === null ? null : getScheduleById(id);
}

export function reopenSchedule(id) {
  const schedule = getScheduleById(id);
  if (!schedule) return null;
  if (schedule.status !== SCHEDULE_STATUS.PUBLISHED) {
    throw new Error('Only published schedules can be reopened.');
  }
  return updateScheduleStatus(id, SCHEDULE_STATUS.DRAFT);
}

export function getScheduleVersions(id) {
  return getDatabase().prepare(`
    SELECT id, schedule_id, version, assignments, warnings, published_at
    FROM schedule_versions
    WHERE schedule_id = ?
    ORDER BY version ASC
  `).all(id).map(version => ({
    ...version,
    assignments: parseJsonArray(version.assignments),
    warnings: parseJsonArray(version.warnings)
  }));
}

export function deleteSchedule(id) {
  const db = getDatabase();
  const stmt = db.prepare(`DELETE FROM schedules WHERE id = ?`);
  const info = stmt.run(id);
  return info.changes > 0;
}

// --- Assignment Repository ---

export function createAssignment({ scheduleId, volunteerId, date, shift, role, isTrainee = 0 }) {
  if (!SHIFT_LIST.includes(shift)) {
    throw new Error(`Invalid shift: ${shift}`);
  }
  if (!ROLE_LIST.includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }

  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO assignments (schedule_id, volunteer_id, date, shift, role, is_trainee)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, shift, role, is_trainee) DO UPDATE SET volunteer_id = excluded.volunteer_id, schedule_id = excluded.schedule_id
  `);

  const info = stmt.run(scheduleId, volunteerId, date, shift, role, isTrainee ? 1 : 0);
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
  const latestVersions = db.prepare(`
    SELECT sv.schedule_id, sv.assignments
    FROM schedule_versions sv
    JOIN (
      SELECT schedule_id, MAX(version) AS version
      FROM schedule_versions
      GROUP BY schedule_id
    ) latest ON latest.schedule_id = sv.schedule_id AND latest.version = sv.version
  `).all();
  const versionedScheduleIds = new Set(latestVersions.map(row => row.schedule_id));
  const versionAssignments = latestVersions.flatMap(row => parseJsonArray(row.assignments))
    .filter(assignment => assignment.date >= startDate && assignment.date < endDate);

  const currentPublishedAssignments = db.prepare(`
    SELECT a.*, v.name as volunteer_name
    FROM assignments a
    JOIN volunteers v ON a.volunteer_id = v.id
    JOIN schedules s ON a.schedule_id = s.id
    WHERE a.date >= ? AND a.date < ? AND s.status = 'PUBLISHED'
    ORDER BY a.date ASC, a.shift ASC, a.role ASC
  `).all(startDate, endDate)
    .filter(assignment => !versionedScheduleIds.has(assignment.schedule_id));

  return [...versionAssignments, ...currentPublishedAssignments]
    .sort((left, right) =>
      left.date.localeCompare(right.date) ||
      left.shift.localeCompare(right.shift) ||
      left.role.localeCompare(right.role)
    );
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
