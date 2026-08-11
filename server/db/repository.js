import { getDatabase } from './index.js';
import { ROLE_LIST, SHIFT_LIST, SCHEDULE_STATUS } from './constants.js';

function database(value) {
  return value || getDatabase();
}

function formatVolunteer(volunteer) {
  if (!volunteer) return null;
  return {
    ...volunteer,
    maxMonthlyFrequency: volunteer.max_monthly_frequency,
    maxShiftsPerMonth: volunteer.max_monthly_frequency,
    maxConsecutiveSundays: volunteer.max_consecutive_sundays,
    allowedShift: volunteer.allowed_shift || 'ALL',
    active: Boolean(volunteer.active)
  };
}

async function getProficiencies(databaseRef, volunteerId) {
  const proficiencies = await databaseRef.all('SELECT * FROM proficiencies WHERE volunteer_id = ?', [volunteerId]);
  return Object.fromEntries(proficiencies.map(item => [item.role, item.level]));
}

export async function createVolunteer(volunteerData) {
  const db = database();
  const {
    name,
    email = null,
    phone = null,
    maxMonthlyFrequency = volunteerData.maxShiftsPerMonth || 2,
    maxConsecutiveSundays = 2,
    allowedShift = 'ALL',
    active = 1
  } = volunteerData;
  const result = await db.run(`
    INSERT INTO volunteers (name, email, phone, max_monthly_frequency, max_consecutive_sundays, allowed_shift, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `, [name, email, phone, maxMonthlyFrequency, maxConsecutiveSundays, allowedShift, active ? 1 : 0]);
  return getVolunteerById(result.lastInsertRowid);
}

export async function getAllVolunteers({ activeOnly = false, includeProficiencies = true } = {}) {
  const db = database();
  const filters = ["NOT EXISTS (SELECT 1 FROM users u WHERE u.volunteer_id = volunteers.id AND u.approval_status = 'PENDING')"];
  if (activeOnly) filters.push('active = 1');
  const query = `SELECT * FROM volunteers WHERE ${filters.join(' AND ')} ORDER BY name ASC`;
  const volunteers = (await db.all(query)).map(formatVolunteer);
  if (includeProficiencies) {
    for (const volunteer of volunteers) volunteer.proficiencies = await getProficiencies(db, volunteer.id);
  }
  return volunteers;
}

export async function getVolunteerById(id) {
  const db = database();
  const volunteer = formatVolunteer(await db.one('SELECT * FROM volunteers WHERE id = ?', [id]));
  if (!volunteer) return null;
  volunteer.proficiencies = await getProficiencies(db, id);
  return volunteer;
}

export async function updateVolunteer(id, volunteerData) {
  const db = database();
  const current = await getVolunteerById(id);
  if (!current) return null;

  const name = volunteerData.name !== undefined ? volunteerData.name : current.name;
  const email = volunteerData.email !== undefined ? volunteerData.email : current.email;
  const phone = volunteerData.phone !== undefined ? volunteerData.phone : current.phone;
  const maxMonthlyFrequency = volunteerData.maxMonthlyFrequency !== undefined
    ? volunteerData.maxMonthlyFrequency
    : volunteerData.maxShiftsPerMonth !== undefined
      ? volunteerData.maxShiftsPerMonth
      : current.max_monthly_frequency;
  const maxConsecutiveSundays = volunteerData.maxConsecutiveSundays !== undefined
    ? volunteerData.maxConsecutiveSundays
    : current.max_consecutive_sundays;
  const allowedShift = volunteerData.allowedShift !== undefined ? volunteerData.allowedShift : (current.allowed_shift || 'ALL');
  const active = volunteerData.active !== undefined ? (volunteerData.active ? 1 : 0) : (current.active ? 1 : 0);

  await db.run(`
    UPDATE volunteers
    SET name = ?, email = ?, phone = ?, max_monthly_frequency = ?, max_consecutive_sundays = ?, allowed_shift = ?, active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [name, email, phone, maxMonthlyFrequency, maxConsecutiveSundays, allowedShift, active, id]);
  return getVolunteerById(id);
}

export function deleteVolunteer(id) {
  return updateVolunteer(id, { active: false });
}

async function setProficiencyOn(db, volunteerId, role, level) {
  if (!ROLE_LIST.includes(role)) throw new Error(`Invalid role: ${role}`);
  if (level < 1 || level > 3) throw new Error(`Invalid proficiency level: ${level}. Must be between 1 and 3.`);
  await db.run(`
    INSERT INTO proficiencies (volunteer_id, role, level)
    VALUES (?, ?, ?)
    ON CONFLICT(volunteer_id, role) DO UPDATE SET level = excluded.level
  `, [volunteerId, role, level]);
}

export async function setProficiency(volunteerId, role, level) {
  const db = database();
  await setProficiencyOn(db, volunteerId, role, level);
  return getProficiencies(db, volunteerId);
}

export async function setVolunteerProficiencies(volunteerId, proficienciesMap) {
  const db = database();
  await db.transaction(async tx => {
    for (const [role, level] of Object.entries(proficienciesMap)) {
      if (level > 0) await setProficiencyOn(tx, volunteerId, role, level);
      else await tx.run('DELETE FROM proficiencies WHERE volunteer_id = ? AND role = ?', [volunteerId, role]);
    }
  });
  return getProficiencies(db, volunteerId);
}

export async function replaceVolunteerProficiencies(volunteerId, proficienciesMap) {
  const db = database();
  await db.transaction(async tx => {
    await tx.run('DELETE FROM proficiencies WHERE volunteer_id = ?', [volunteerId]);
    for (const [role, level] of Object.entries(proficienciesMap)) {
      if (level > 0) await setProficiencyOn(tx, volunteerId, role, level);
    }
  });
  return getProficiencies(db, volunteerId);
}

export async function getProficienciesByVolunteerId(volunteerId) {
  return getProficiencies(database(), volunteerId);
}

export async function deleteProficiency(volunteerId, role) {
  const result = await database().run('DELETE FROM proficiencies WHERE volunteer_id = ? AND role = ?', [volunteerId, role]);
  return result.changes > 0;
}

export async function getAllProficiencies() {
  return database().all('SELECT * FROM proficiencies');
}

export async function addUnavailability({ volunteerId, date, shift = 'ALL', reason = null }) {
  const db = database();
  const result = await db.run(`
    INSERT INTO unavailabilities (volunteer_id, date, shift, reason)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(volunteer_id, date, shift) DO UPDATE SET reason = excluded.reason
    RETURNING id
  `, [volunteerId, date, shift, reason]);
  return getUnavailabilityById(result.lastInsertRowid);
}

export async function getUnavailabilityById(id) {
  return database().one('SELECT * FROM unavailabilities WHERE id = ?', [id]);
}

export async function updateUnavailability(id, changes) {
  const db = database();
  const current = await getUnavailabilityById(id);
  if (!current) return null;
  const volunteerId = changes.volunteerId ?? current.volunteer_id;
  const date = changes.date ?? current.date;
  const shift = changes.shift ?? current.shift ?? 'ALL';
  const reason = changes.reason !== undefined ? changes.reason : current.reason;
  await db.run(`
    UPDATE unavailabilities SET volunteer_id = ?, date = ?, shift = ?, reason = ? WHERE id = ?
  `, [volunteerId, date, shift, reason, id]);
  return getUnavailabilityById(id);
}

export async function getUnavailabilitiesByVolunteerId(volunteerId) {
  return database().all('SELECT * FROM unavailabilities WHERE volunteer_id = ? ORDER BY date ASC', [volunteerId]);
}

export async function getUnavailabilitiesByDateRange(startDate, endDate) {
  return database().all(`
    SELECT u.*, v.name as volunteer_name
    FROM unavailabilities u
    JOIN volunteers v ON u.volunteer_id = v.id
    WHERE u.date >= ? AND u.date <= ?
    ORDER BY u.date ASC
  `, [startDate, endDate]);
}

export async function getAllUnavailabilities() {
  return database().all(`
    SELECT u.*, v.name as volunteer_name
    FROM unavailabilities u
    JOIN volunteers v ON u.volunteer_id = v.id
    ORDER BY u.date ASC
  `);
}

export async function deleteUnavailability(id) {
  const result = await database().run('DELETE FROM unavailabilities WHERE id = ?', [id]);
  return result.changes > 0;
}

export async function getPublishedAssignmentsByVolunteerId(volunteerId, { year, month } = {}) {
  const conditions = ['a.volunteer_id = ?', "s.status = 'PUBLISHED'"];
  const params = [volunteerId];
  if (year !== undefined) { conditions.push('s.year = ?'); params.push(year); }
  if (month !== undefined) { conditions.push('s.month = ?'); params.push(month); }
  return database().all(`
    SELECT a.*, s.year, s.month, s.published_version, v.name as volunteer_name
    FROM assignments a
    JOIN schedules s ON s.id = a.schedule_id
    JOIN volunteers v ON v.id = a.volunteer_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY a.date ASC, a.shift ASC, a.role ASC
  `, params);
}

function formatExchange(exchange) {
  if (!exchange) return null;
  return {
    ...exchange,
    requesterId: exchange.requester_id,
    targetVolunteerId: exchange.target_volunteer_id,
    scheduleId: exchange.schedule_id,
    assignmentId: exchange.assignment_id,
    requesterName: exchange.requester_name,
    targetVolunteerName: exchange.target_volunteer_name,
    previousVolunteerId: exchange.assignment_volunteer_id,
    date: exchange.assignment_date,
    shift: exchange.assignment_shift,
    role: exchange.assignment_role,
    isTrainee: Boolean(exchange.assignment_is_trainee)
  };
}

const exchangeSelect = `
  SELECT e.*, a.volunteer_id as assignment_volunteer_id, a.date as assignment_date,
    a.shift as assignment_shift, a.role as assignment_role, a.is_trainee as assignment_is_trainee,
    requester.name as requester_name, target.name as target_volunteer_name
  FROM schedule_exchanges e
  JOIN assignments a ON a.id = e.assignment_id
  JOIN volunteers requester ON requester.id = e.requester_id
  JOIN volunteers target ON target.id = e.target_volunteer_id
`;

async function validateExchangeTarget(db, assignment, targetVolunteerId) {
  const target = await db.one('SELECT id, active, allowed_shift FROM volunteers WHERE id = ?', [targetVolunteerId]);
  if (!target || !target.active) throw new Error('Target volunteer not found or inactive.');

  const requiredLevel = assignment.is_trainee ? 1 : 2;
  const proficiency = await db.one('SELECT level FROM proficiencies WHERE volunteer_id = ? AND role = ?', [targetVolunteerId, assignment.role]);
  if (!proficiency || (assignment.is_trainee ? proficiency.level !== requiredLevel : proficiency.level < requiredLevel)) {
    throw new Error(assignment.is_trainee ? 'Target volunteer must have N1 proficiency for a trainee assignment.' : 'Target volunteer lacks the required proficiency.');
  }
  if (target.allowed_shift !== 'ALL' && target.allowed_shift !== assignment.shift) throw new Error('Target volunteer is not allowed to serve in this shift.');

  const unavailable = await db.one(`
    SELECT 1 FROM unavailabilities WHERE volunteer_id = ? AND date = ? AND (shift = 'ALL' OR shift = ?)
  `, [targetVolunteerId, assignment.date, assignment.shift]);
  if (unavailable) throw new Error('Target volunteer is unavailable for this assignment.');

  const sameSunday = await db.one(`
    SELECT 1 FROM assignments WHERE schedule_id = ? AND date = ? AND volunteer_id = ? AND id != ?
  `, [assignment.schedule_id, assignment.date, targetVolunteerId, assignment.id]);
  if (sameSunday) throw new Error('Target volunteer is already assigned on this Sunday.');
}

export async function getExchangeById(id) {
  return formatExchange(await database().one(`${exchangeSelect} WHERE e.id = ?`, [id]));
}

export async function getExchangesByVolunteerId(volunteerId) {
  const rows = await database().all(`${exchangeSelect}
    WHERE e.requester_id = ? OR e.target_volunteer_id = ?
    ORDER BY e.created_at DESC
  `, [volunteerId, volunteerId]);
  return rows.map(formatExchange);
}

export async function getAllScheduleExchanges() {
  const rows = await database().all(`${exchangeSelect} ORDER BY e.created_at DESC`);
  return rows.map(formatExchange);
}

export async function createNotification({ userId, type, exchangeId = null, message }) {
  const db = database();
  const result = await db.run(`
    INSERT INTO notifications (user_id, type, exchange_id, message)
    VALUES (?, ?, ?, ?)
    RETURNING id
  `, [userId, type, exchangeId, message]);
  return getNotificationById(result.lastInsertRowid);
}

export async function getNotificationById(id) {
  return database().one('SELECT * FROM notifications WHERE id = ?', [id]);
}

export async function getNotificationsByUserId(userId) {
  return database().all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC', [userId]);
}

export async function markNotificationRead(id, userId) {
  const result = await database().run(`
    UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?
  `, [id, userId]);
  return result.changes ? getNotificationById(id) : null;
}

export async function markAllNotificationsRead(userId) {
  const result = await database().run(`
    UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL
  `, [userId]);
  return result.changes;
}

export async function createScheduleExchange({ assignmentId, requesterId, targetVolunteerId, reason = null }) {
  const db = database();
  const assignment = await db.one(`
    SELECT a.*, s.status as schedule_status, s.id as schedule_id
    FROM assignments a JOIN schedules s ON s.id = a.schedule_id WHERE a.id = ?
  `, [assignmentId]);
  if (!assignment) throw new Error('Assignment not found.');
  if (assignment.schedule_status !== SCHEDULE_STATUS.PUBLISHED) throw new Error('Only published assignments can be exchanged.');
  if (assignment.volunteer_id !== requesterId) throw new Error('Only the assigned volunteer can request this exchange.');
  if (requesterId === targetVolunteerId) throw new Error('The target volunteer must be different.');
  if (!await db.one('SELECT id FROM users WHERE volunteer_id = ? AND active = 1', [targetVolunteerId])) throw new Error('Target volunteer does not have an active account.');
  await validateExchangeTarget(db, assignment, targetVolunteerId);
  if (await db.one("SELECT 1 FROM schedule_exchanges WHERE assignment_id = ? AND status = 'PENDING'", [assignmentId])) throw new Error('This assignment already has a pending exchange.');

  const result = await db.run(`
    INSERT INTO schedule_exchanges (schedule_id, assignment_id, requester_id, target_volunteer_id, reason)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id
  `, [assignment.schedule_id, assignmentId, requesterId, targetVolunteerId, reason]);
  return getExchangeById(result.lastInsertRowid);
}

export async function rejectScheduleExchange(id, targetVolunteerId, rejectionReason = null) {
  const result = await database().run(`
    UPDATE schedule_exchanges
    SET status = 'REJECTED', rejection_reason = ?, responded_at = CURRENT_TIMESTAMP
    WHERE id = ? AND target_volunteer_id = ? AND status = 'PENDING'
  `, [rejectionReason, id, targetVolunteerId]);
  if (!result.changes) throw new Error('Exchange not found, already closed, or not addressed to you.');
  return getExchangeById(id);
}

export async function cancelScheduleExchange(id, requesterId) {
  const result = await database().run(`
    UPDATE schedule_exchanges
    SET status = 'CANCELLED', responded_at = CURRENT_TIMESTAMP
    WHERE id = ? AND requester_id = ? AND status = 'PENDING'
  `, [id, requesterId]);
  if (!result.changes) throw new Error('Exchange not found, already closed, or not owned by you.');
  return getExchangeById(id);
}

export async function acceptScheduleExchange(id, targetVolunteerId, changedByUserId) {
  const db = database();
  await db.transaction(async tx => {
    const exchange = await tx.one(`
      SELECT e.*, a.volunteer_id as current_volunteer_id, a.date, a.shift, a.role,
        a.is_trainee, s.status as schedule_status, s.published_version
      FROM schedule_exchanges e
      JOIN assignments a ON a.id = e.assignment_id
      JOIN schedules s ON s.id = e.schedule_id
      WHERE e.id = ?
    `, [id]);
    if (!exchange || exchange.status !== 'PENDING' || exchange.target_volunteer_id !== targetVolunteerId) throw new Error('Exchange not found, already closed, or not addressed to you.');
    if (exchange.schedule_status !== SCHEDULE_STATUS.PUBLISHED) throw new Error('The schedule is no longer published.');
    if (exchange.current_volunteer_id !== exchange.requester_id) throw new Error('The assignment has changed since the request.');
    await validateExchangeTarget(tx, { ...exchange, id: exchange.assignment_id, schedule_id: exchange.schedule_id }, targetVolunteerId);

    const nextVersion = Number(exchange.published_version) + 1;
    await tx.run('UPDATE assignments SET volunteer_id = ? WHERE id = ?', [targetVolunteerId, exchange.assignment_id]);
    const assignments = await getAssignmentsByScheduleId(exchange.schedule_id, tx);
    const schedule = await tx.one('SELECT warnings FROM schedules WHERE id = ?', [exchange.schedule_id]);
    await tx.run(`
      INSERT INTO schedule_versions (schedule_id, version, assignments, warnings)
      VALUES (?, ?, ?, ?)
    `, [exchange.schedule_id, nextVersion, JSON.stringify(assignments), schedule.warnings || '[]']);
    await tx.run('UPDATE schedules SET published_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nextVersion, exchange.schedule_id]);
    await tx.run(`
      INSERT INTO schedule_change_events
        (schedule_id, from_version, to_version, exchange_id, assignment_id, previous_volunteer_id, new_volunteer_id, changed_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [exchange.schedule_id, exchange.published_version, nextVersion, id, exchange.assignment_id, exchange.requester_id, targetVolunteerId, changedByUserId]);
    await tx.run(`
      UPDATE schedule_exchanges
      SET status = 'ACCEPTED', responded_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [id]);

    const requesterUser = await tx.one('SELECT id FROM users WHERE volunteer_id = ? AND active = 1', [exchange.requester_id]);
    if (requesterUser) {
      await tx.run(`
        INSERT INTO notifications (user_id, type, exchange_id, message)
        VALUES (?, 'EXCHANGE_ACCEPTED', ?, ?)
      `, [requesterUser.id, id, `Sua troca foi aceita e a escala foi atualizada para a versão ${nextVersion}.`]);
    }
    await tx.run(`
      INSERT INTO notifications (user_id, type, exchange_id, message)
      SELECT id, 'EXCHANGE_UPDATED', ?, ? FROM users WHERE role = 'LEADER' AND active = 1
    `, [id, `Uma troca foi aceita e gerou a versão ${nextVersion} da escala.`]);
  });
  return getExchangeById(id);
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
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

export async function createSchedule({ year, month, status = SCHEDULE_STATUS.DRAFT }) {
  const result = await database().run('INSERT INTO schedules (year, month, status) VALUES (?, ?, ?) RETURNING id', [year, month, status]);
  return getScheduleById(result.lastInsertRowid);
}

export async function getScheduleById(id, databaseRef) {
  const db = database(databaseRef);
  const schedule = formatSchedule(await db.one('SELECT * FROM schedules WHERE id = ?', [id]));
  if (!schedule) return null;
  schedule.assignments = await getAssignmentsByScheduleId(id, db);
  return schedule;
}

export async function getScheduleByMonthYear(year, month) {
  const db = database();
  const schedule = formatSchedule(await db.one('SELECT * FROM schedules WHERE year = ? AND month = ?', [year, month]));
  if (!schedule) return null;
  schedule.assignments = await getAssignmentsByScheduleId(schedule.id, db);
  return schedule;
}

export async function getAllSchedules() {
  const db = database();
  const schedules = (await db.all('SELECT * FROM schedules ORDER BY year DESC, month DESC')).map(formatSchedule);
  for (const schedule of schedules) schedule.assignments = await getAssignmentsByScheduleId(schedule.id, db);
  return schedules;
}

export async function updateScheduleStatus(id, status) {
  if (!Object.values(SCHEDULE_STATUS).includes(status)) throw new Error(`Invalid status: ${status}`);
  await database().run('UPDATE schedules SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
  return getScheduleById(id);
}

export async function saveScheduleDraft(id, { assignments = [], lockedSlots = [], warnings = [] }) {
  const db = database();
  const schedule = await getScheduleById(id);
  if (!schedule) return null;
  if (schedule.status !== SCHEDULE_STATUS.DRAFT) throw new Error('Published schedules must be reopened before editing.');

  await db.transaction(async tx => {
    await tx.run('DELETE FROM assignments WHERE schedule_id = ?', [id]);
    for (const assignment of assignments) {
      await tx.run(`
        INSERT INTO assignments (schedule_id, volunteer_id, date, shift, role, is_trainee)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, assignment.volunteerId, assignment.date, assignment.shift, assignment.role, assignment.isTrainee ? 1 : 0]);
    }
    await tx.run(`
      UPDATE schedules SET locked_slots = ?, warnings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [JSON.stringify(lockedSlots), JSON.stringify(warnings), id]);
  });
  return getScheduleById(id);
}

export async function publishSchedule(id, { warnings = [] } = {}) {
  const db = database();
  const published = await db.transaction(async tx => {
    const rawSchedule = await tx.one('SELECT * FROM schedules WHERE id = ?', [id]);
    if (!rawSchedule) return null;
    if (rawSchedule.status !== SCHEDULE_STATUS.DRAFT) throw new Error('Only draft schedules can be published.');
    const version = (Number(rawSchedule.published_version) || 0) + 1;
    const assignments = await getAssignmentsByScheduleId(id, tx);
    await tx.run(`
      INSERT INTO schedule_versions (schedule_id, version, assignments, warnings)
      VALUES (?, ?, ?, ?)
    `, [id, version, JSON.stringify(assignments), JSON.stringify(warnings)]);
    await tx.run(`
      UPDATE schedules SET status = ?, warnings = ?, published_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [SCHEDULE_STATUS.PUBLISHED, JSON.stringify(warnings), version, id]);
    return true;
  });
  return published === null ? null : getScheduleById(id);
}

export async function reopenSchedule(id) {
  const schedule = await getScheduleById(id);
  if (!schedule) return null;
  if (schedule.status !== SCHEDULE_STATUS.PUBLISHED) throw new Error('Only published schedules can be reopened.');
  return updateScheduleStatus(id, SCHEDULE_STATUS.DRAFT);
}

export async function getScheduleVersions(id) {
  const rows = await database().all(`
    SELECT id, schedule_id, version, assignments, warnings, published_at
    FROM schedule_versions WHERE schedule_id = ? ORDER BY version ASC
  `, [id]);
  return rows.map(version => ({
    ...version,
    assignments: parseJsonArray(version.assignments),
    warnings: parseJsonArray(version.warnings)
  }));
}

export async function deleteSchedule(id) {
  const result = await database().run('DELETE FROM schedules WHERE id = ?', [id]);
  return result.changes > 0;
}

export async function createAssignment({ scheduleId, volunteerId, date, shift, role, isTrainee = 0 }, databaseRef) {
  if (!SHIFT_LIST.includes(shift)) throw new Error(`Invalid shift: ${shift}`);
  if (!ROLE_LIST.includes(role)) throw new Error(`Invalid role: ${role}`);
  const result = await database(databaseRef).run(`
    INSERT INTO assignments (schedule_id, volunteer_id, date, shift, role, is_trainee)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, shift, role, is_trainee) DO UPDATE SET volunteer_id = excluded.volunteer_id, schedule_id = excluded.schedule_id
    RETURNING id
  `, [scheduleId, volunteerId, date, shift, role, isTrainee ? 1 : 0]);
  return database(databaseRef).one('SELECT * FROM assignments WHERE id = ?', [result.lastInsertRowid]);
}

export async function bulkCreateAssignments(assignmentsArray) {
  const db = database();
  return db.transaction(async tx => {
    const results = [];
    for (const assignment of assignmentsArray) results.push(await createAssignment(assignment, tx));
    return results;
  });
}

export async function getAssignmentsByScheduleId(scheduleId, databaseRef) {
  return database(databaseRef).all(`
    SELECT a.*, v.name as volunteer_name
    FROM assignments a JOIN volunteers v ON a.volunteer_id = v.id
    WHERE a.schedule_id = ? ORDER BY a.date ASC, a.shift ASC, a.role ASC
  `, [scheduleId]);
}

export async function getAssignmentsByDateRange(startDate, endDate) {
  const db = database();
  const latestVersions = await db.all(`
    SELECT sv.schedule_id, sv.assignments
    FROM schedule_versions sv
    JOIN (
      SELECT schedule_id, MAX(version) AS version FROM schedule_versions GROUP BY schedule_id
    ) latest ON latest.schedule_id = sv.schedule_id AND latest.version = sv.version
  `);
  const versionedScheduleIds = new Set(latestVersions.map(row => row.schedule_id));
  const versionAssignments = latestVersions.flatMap(row => parseJsonArray(row.assignments))
    .filter(assignment => assignment.date >= startDate && assignment.date < endDate);
  const currentPublishedAssignments = (await db.all(`
    SELECT a.*, v.name as volunteer_name
    FROM assignments a
    JOIN volunteers v ON a.volunteer_id = v.id
    JOIN schedules s ON a.schedule_id = s.id
    WHERE a.date >= ? AND a.date < ? AND s.status = 'PUBLISHED'
    ORDER BY a.date ASC, a.shift ASC, a.role ASC
  `, [startDate, endDate])).filter(assignment => !versionedScheduleIds.has(assignment.schedule_id));
  return [...versionAssignments, ...currentPublishedAssignments].sort((left, right) =>
    left.date.localeCompare(right.date) || left.shift.localeCompare(right.shift) || left.role.localeCompare(right.role));
}

export async function getPastAssignmentsByVolunteerId(volunteerId, limit = 50) {
  return database().all(`
    SELECT a.*, s.year, s.month, s.status as schedule_status
    FROM assignments a JOIN schedules s ON a.schedule_id = s.id
    WHERE a.volunteer_id = ? ORDER BY a.date DESC LIMIT ?
  `, [volunteerId, limit]);
}

export async function deleteAssignment(id) {
  const result = await database().run('DELETE FROM assignments WHERE id = ?', [id]);
  return result.changes > 0;
}

export async function clearScheduleAssignments(scheduleId) {
  const result = await database().run('DELETE FROM assignments WHERE schedule_id = ?', [scheduleId]);
  return result.changes;
}
