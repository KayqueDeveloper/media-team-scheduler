import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import {
  getAllVolunteers,
  createVolunteer,
  updateVolunteer,
  deleteVolunteer,
  setVolunteerProficiencies,
  replaceVolunteerProficiencies,
  deleteProficiency,
  getProficienciesByVolunteerId,
  getAllUnavailabilities,
  addUnavailability,
  getUnavailabilityById,
  updateUnavailability,
  deleteUnavailability,
  getScheduleById,
  getScheduleByMonthYear,
  createSchedule,
  updateScheduleStatus,
  getAssignmentsByDateRange,
  saveScheduleDraft,
  publishSchedule as publishScheduleRecord,
  reopenSchedule as reopenScheduleRecord,
  getScheduleVersions
} from './db/repository.js';
import { closeDatabase, getDatabase } from './db/index.js';
import { ROLE_LIST, SHIFT_LIST } from './db/constants.js';
import { generateSchedule, getSundaysInMonth } from './solver/scheduler.js';

const PORT = process.env.PORT || 3001;

function getCalendarDate(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getUnavailabilityCutoff(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error('Date must use YYYY-MM-DD format.');
  }
  const [year, month] = dateString.split('-').map(Number);
  const cutoff = new Date(Date.UTC(year, month - 2, 25));
  return cutoff.toISOString().slice(0, 10);
}

function normalizeAssignment(assignment) {
  return {
    date: String(assignment.date || ''),
    shift: String(assignment.shift || '').toUpperCase(),
    role: String(assignment.role || '').toUpperCase(),
    volunteerId: Number(assignment.volunteerId ?? assignment.volunteer_id),
    isTrainee: Boolean(assignment.isTrainee ?? assignment.is_trainee)
  };
}

function validateDraftAssignments(schedule, rawAssignments = [], lockedSlots = []) {
  const assignments = rawAssignments.map(normalizeAssignment);
  const errors = [];
  const sundays = new Set(getSundaysInMonth(schedule.year, schedule.month));
  const monthlyLimit = sundays.size === 5 ? 3 : 2;
  const volunteers = new Map(getAllVolunteers({ activeOnly: false }).map(volunteer => [volunteer.id, volunteer]));
  const unavailabilities = getAllUnavailabilities();
  const occupiedSlots = new Set();
  const participantDates = new Set();
  const participantCounts = new Map();
  const principals = new Map();

  for (const assignment of assignments) {
    const slotKey = `${assignment.date}:${assignment.shift}:${assignment.role}`;
    const assignmentKey = `${slotKey}:${assignment.isTrainee ? 'trainee' : 'main'}`;
    const volunteer = volunteers.get(assignment.volunteerId);
    const level = volunteer?.proficiencies?.[assignment.role] || 0;

    if (!sundays.has(assignment.date)) errors.push(`${assignmentKey}: data não pertence aos domingos do mês.`);
    if (!SHIFT_LIST.includes(assignment.shift)) errors.push(`${assignmentKey}: turno inválido.`);
    if (!ROLE_LIST.includes(assignment.role)) errors.push(`${assignmentKey}: função inválida.`);
    if (!volunteer || !volunteer.active) errors.push(`${assignmentKey}: voluntário inexistente ou inativo.`);
    if (occupiedSlots.has(assignmentKey)) errors.push(`${assignmentKey}: alocação duplicada.`);
    occupiedSlots.add(assignmentKey);

    if (!volunteer) continue;
    if (volunteer.allowedShift !== 'ALL' && volunteer.allowedShift !== assignment.shift) {
      errors.push(`${assignmentKey}: turno não permitido para o voluntário.`);
    }
    const unavailable = unavailabilities.some(item =>
      item.volunteer_id === assignment.volunteerId &&
      item.date === assignment.date &&
      (item.shift === 'ALL' || item.shift === assignment.shift)
    );
    if (unavailable) errors.push(`${assignmentKey}: voluntário indisponível.`);

    const participantDate = `${assignment.volunteerId}:${assignment.date}`;
    if (participantDates.has(participantDate)) {
      errors.push(`${assignmentKey}: voluntário já participa de outro turno ou função nesse domingo.`);
    }
    participantDates.add(participantDate);
    participantCounts.set(assignment.volunteerId, (participantCounts.get(assignment.volunteerId) || 0) + 1);

    if (assignment.isTrainee) {
      if (level !== 1) errors.push(`${assignmentKey}: treinando deve possuir proficiência N1.`);
    } else {
      if (level < 2) errors.push(`${assignmentKey}: alocação principal exige proficiência N2 ou N3.`);
      principals.set(slotKey, { assignment, level });
    }
  }

  for (const [volunteerId, count] of participantCounts) {
    if (count > monthlyLimit) errors.push(`Voluntário ${volunteerId}: limite mensal de ${monthlyLimit} participações excedido.`);
  }

  for (const trainee of assignments.filter(assignment => assignment.isTrainee)) {
    const slotKey = `${trainee.date}:${trainee.shift}:${trainee.role}`;
    if (principals.get(slotKey)?.level !== 3) {
      errors.push(`${slotKey}: treinando N1 exige mentor principal N3.`);
    }
  }

  const normalizedLocks = [...new Set(lockedSlots.map(String))];
  for (const slotKey of normalizedLocks) {
    if (!principals.has(slotKey)) errors.push(`${slotKey}: vaga travada exige uma alocação principal válida.`);
  }

  return { assignments, lockedSlots: normalizedLocks, errors };
}

function withCoverageWarnings(schedule, assignments, suppliedWarnings = []) {
  const totalSlots = getSundaysInMonth(schedule.year, schedule.month).length * SHIFT_LIST.length * ROLE_LIST.length;
  const assignedMainSlots = assignments.filter(assignment => !assignment.isTrainee).length;
  const warnings = [...suppliedWarnings];
  if (assignedMainSlots < totalSlots) {
    warnings.push(`${totalSlots - assignedMainSlots} vaga(s) permaneceram sem alocação principal N2/N3.`);
  }
  return [...new Set(warnings.filter(Boolean).map(String))];
}

export function createApp({
  dbPath,
  now = () => new Date(),
  timeZone = 'America/Sao_Paulo'
} = {}) {
  const app = express();
  app.locals.db = getDatabase(dbPath);
  app.locals.closeDatabase = closeDatabase;

  app.use(cors());
  app.use(express.json());

// --- Volunteers API ---

  app.get('/api/volunteers', (req, res) => {
  try {
    const activeOnly = req.query.active === 'true';
    const volunteers = getAllVolunteers({ activeOnly, includeProficiencies: true });
    res.json(volunteers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

  app.post('/api/volunteers', (req, res) => {
  try {
    const volunteer = createVolunteer(req.body);
    if (req.body.proficiencies) {
      setVolunteerProficiencies(volunteer.id, req.body.proficiencies);
    }
    res.status(201).json(getAllVolunteers({ activeOnly: false }).find(v => v.id === volunteer.id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

  const handleUpdateVolunteer = (req, res) => {
    try {
      const updated = updateVolunteer(Number(req.params.id), req.body);
      if (!updated) return res.status(404).json({ error: 'Volunteer not found.' });
      if (req.body.proficiencies) {
        setVolunteerProficiencies(updated.id, req.body.proficiencies);
      }
      res.json(getAllVolunteers({ activeOnly: false }).find(volunteer => volunteer.id === updated.id));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };

  app.patch('/api/volunteers/:id', handleUpdateVolunteer);
  app.put('/api/volunteers/:id', handleUpdateVolunteer);

  app.delete('/api/volunteers/:id', (req, res) => {
    try {
      const archived = deleteVolunteer(Number(req.params.id));
      if (!archived) return res.status(404).json({ error: 'Volunteer not found.' });
      res.json(archived);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put('/api/volunteers/:id/proficiencies', (req, res) => {
    try {
      const volunteerId = Number(req.params.id);
      const volunteer = getAllVolunteers({ activeOnly: false }).find(item => item.id === volunteerId);
      if (!volunteer) return res.status(404).json({ error: 'Volunteer not found.' });
      if (!req.body.proficiencies || typeof req.body.proficiencies !== 'object') {
        return res.status(400).json({ error: 'proficiencies must be an object.' });
      }
      res.json(replaceVolunteerProficiencies(volunteerId, req.body.proficiencies));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/volunteers/:id/proficiencies/:role', (req, res) => {
    try {
      const volunteerId = Number(req.params.id);
      deleteProficiency(volunteerId, req.params.role.toUpperCase());
      res.json(getProficienciesByVolunteerId(volunteerId));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/volunteers/:id/proficiency', (req, res) => {
  try {
    const { proficiencies } = req.body;
    const updated = setVolunteerProficiencies(parseInt(req.params.id), proficiencies);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- Unavailabilities API ---

  app.get('/api/unavailabilities', (req, res) => {
  try {
    let list = getAllUnavailabilities();
    if (req.query.volunteerId) {
      list = list.filter(item => item.volunteer_id === Number(req.query.volunteerId));
    }
    if (req.query.year && req.query.month) {
      const prefix = `${String(req.query.year).padStart(4, '0')}-${String(req.query.month).padStart(2, '0')}-`;
      list = list.filter(item => item.date.startsWith(prefix));
    }
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

  app.post('/api/unavailabilities', (req, res) => {
  try {
    const cutoffDate = getUnavailabilityCutoff(req.body.date);
    if (getCalendarDate(now(), timeZone) > cutoffDate) {
      return res.status(422).json({
        error: `Unavailability cutoff passed on ${cutoffDate}.`,
        code: 'UNAVAILABILITY_CUTOFF_PASSED',
        details: { cutoffDate }
      });
    }
    const record = addUnavailability(req.body);
    res.status(201).json(record);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
  });

  app.patch('/api/unavailabilities/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const current = getUnavailabilityById(id);
      if (!current) return res.status(404).json({ error: 'Unavailability not found.' });
      const cutoffDate = getUnavailabilityCutoff(req.body.date || current.date);
      if (getCalendarDate(now(), timeZone) > cutoffDate) {
        return res.status(422).json({
          error: `Unavailability cutoff passed on ${cutoffDate}.`,
          code: 'UNAVAILABILITY_CUTOFF_PASSED',
          details: { cutoffDate }
        });
      }
      res.json(updateUnavailability(id, req.body));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/unavailabilities/:id', (req, res) => {
  try {
    const success = deleteUnavailability(parseInt(req.params.id));
    res.json({ success });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- Schedule & Solver API ---

  app.get('/api/schedule', (req, res) => {
  try {
    const year = parseInt(req.query.year) || 2026;
    const month = parseInt(req.query.month) || 9;
    const schedule = getScheduleByMonthYear(year, month);
    res.json(schedule || { year, month, status: 'DRAFT', assignments: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

  app.post('/api/schedule/generate', (req, res) => {
  try {
    const year = parseInt(req.body.year) || 2026;
    const month = parseInt(req.body.month) || 9;

    const volunteers = getAllVolunteers({ activeOnly: true, includeProficiencies: true });
    const unavailabilities = getAllUnavailabilities();

    // Query past 90 days assignments for equity scoring
    const pastStartDate = new Date(year, month - 3, 1).toISOString().split('T')[0];
    const currentMonthStart = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const pastAssignments = getAssignmentsByDateRange(pastStartDate, currentMonthStart);

    const proficiencies = [];
    volunteers.forEach(v => {
      if (v.proficiencies) {
        Object.entries(v.proficiencies).forEach(([role, level]) => {
          if (level > 0) proficiencies.push({ volunteerId: v.id, role, level });
        });
      }
    });

    let schedule = getScheduleByMonthYear(year, month);
    if (schedule?.status === 'PUBLISHED') {
      return res.status(409).json({ error: 'Reopen the published schedule before generating a new draft.' });
    }

    const result = generateSchedule({
      year,
      month,
      volunteers,
      proficiencies,
      unavailabilities,
      pastAssignments,
      lockedAssignments: req.body.lockedAssignments || []
    });

    if (!result.success || !result.schedule) {
      return res.status(422).json({ error: result.errors?.[0] || 'Could not generate schedule matching constraints.' });
    }

    if (!schedule) {
      schedule = createSchedule({ year, month, status: 'DRAFT' });
    }

    const assignmentsToInsert = [];
    result.schedule.forEach(a => {
      assignmentsToInsert.push({
        scheduleId: schedule.id,
        volunteerId: a.volunteerId,
        date: a.date,
        shift: a.shift,
        role: a.role,
        isTrainee: 0
      });
    });
    if (result.trainees) {
      result.trainees.forEach(t => {
        assignmentsToInsert.push({
          scheduleId: schedule.id,
          volunteerId: t.volunteerId,
          date: t.date,
          shift: t.shift,
          role: t.role,
          isTrainee: 1
        });
      });
    }

    const lockedSlots = result.schedule
      .filter(assignment => assignment.isLocked)
      .map(assignment => `${assignment.date}:${assignment.shift}:${assignment.role}`);
    const updatedSchedule = saveScheduleDraft(schedule.id, {
      assignments: assignmentsToInsert,
      lockedSlots,
      warnings: result.warnings || []
    });
    res.json({
      schedule: updatedSchedule,
      bySunday: result.bySunday,
      warnings: result.warnings || [],
      vacancies: result.vacancies || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

  app.put('/api/schedule/:id', (req, res) => {
    try {
      const schedule = getScheduleById(Number(req.params.id));
      if (!schedule) return res.status(404).json({ error: 'Schedule not found.' });
      if (schedule.status === 'PUBLISHED') {
        return res.status(409).json({ error: 'Reopen the published schedule before editing it.' });
      }
      const validation = validateDraftAssignments(schedule, req.body.assignments || [], req.body.lockedSlots || []);
      if (validation.errors.length) {
        return res.status(422).json({
          error: validation.errors[0],
          code: 'INVALID_ASSIGNMENTS',
          details: { errors: validation.errors }
        });
      }
      const warnings = withCoverageWarnings(schedule, validation.assignments, req.body.warnings || []);
      res.json(saveScheduleDraft(schedule.id, {
        assignments: validation.assignments,
        lockedSlots: validation.lockedSlots,
        warnings
      }));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/schedule/:id/publish', (req, res) => {
    try {
      const schedule = getScheduleById(Number(req.params.id));
      if (!schedule) return res.status(404).json({ error: 'Schedule not found.' });
      const validation = validateDraftAssignments(schedule, schedule.assignments, schedule.lockedSlots);
      if (validation.errors.length) {
        return res.status(422).json({
          error: validation.errors[0],
          code: 'INVALID_ASSIGNMENTS',
          details: { errors: validation.errors }
        });
      }
      const warnings = [...new Set([
        ...(schedule.warnings || []),
        ...(Array.isArray(req.body.warnings) ? req.body.warnings : [])
      ].map(String))];
      if (warnings.length && req.body.confirmedWarnings !== true) {
        return res.status(422).json({
          error: 'Publication warnings require explicit confirmation.',
          code: 'WARNINGS_REQUIRE_CONFIRMATION',
          details: { warnings }
        });
      }
      const published = publishScheduleRecord(schedule.id, { warnings });
      if (!published) return res.status(404).json({ error: 'Schedule not found.' });
      res.json(published);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/schedule/:id/reopen', (req, res) => {
    try {
      const reopened = reopenScheduleRecord(Number(req.params.id));
      if (!reopened) return res.status(404).json({ error: 'Schedule not found.' });
      res.json(reopened);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/schedule/:id/versions', (req, res) => {
    try {
      const schedule = getScheduleById(Number(req.params.id));
      if (!schedule) return res.status(404).json({ error: 'Schedule not found.' });
      res.json(getScheduleVersions(schedule.id));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put('/api/schedule/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const scheduleId = parseInt(req.params.id);
    const schedule = getScheduleById(scheduleId);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found.' });
    if (status === 'PUBLISHED') {
      const validation = validateDraftAssignments(schedule, schedule.assignments, schedule.lockedSlots);
      if (validation.errors.length) {
        return res.status(422).json({
          error: validation.errors[0],
          code: 'INVALID_ASSIGNMENTS',
          details: { errors: validation.errors }
        });
      }
    }
    const warnings = [...new Set([
      ...(schedule.warnings || []),
      ...(Array.isArray(req.body.warnings) ? req.body.warnings : [])
    ].map(String))];
    if (status === 'PUBLISHED' && warnings.length && req.body.confirmedWarnings !== true) {
      return res.status(422).json({
        error: 'Publication warnings require explicit confirmation.',
        code: 'WARNINGS_REQUIRE_CONFIRMATION',
        details: { warnings }
      });
    }
    const updated = status === 'PUBLISHED'
      ? publishScheduleRecord(scheduleId, { warnings })
      : status === 'DRAFT'
        ? reopenScheduleRecord(scheduleId)
        : updateScheduleStatus(scheduleId, status);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}
