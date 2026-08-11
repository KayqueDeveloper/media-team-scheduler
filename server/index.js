import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import {
  getAllVolunteers,
  createVolunteer,
  updateVolunteer,
  deleteVolunteer,
  getVolunteerById,
  setVolunteerProficiencies,
  replaceVolunteerProficiencies,
  deleteProficiency,
  getProficienciesByVolunteerId,
  getAllUnavailabilities,
  getUnavailabilitiesByVolunteerId,
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
  getScheduleVersions,
  getPublishedAssignmentsByVolunteerId,
  getExchangesByVolunteerId,
  getAllScheduleExchanges,
  createScheduleExchange,
  getExchangeById,
  createNotification,
  getNotificationsByUserId,
  markNotificationRead,
  markAllNotificationsRead,
  acceptScheduleExchange,
  rejectScheduleExchange,
  cancelScheduleExchange
} from './db/repository.js';
import { closeDatabase, getDatabase } from './db/index.js';
import { ROLE_LIST, SHIFT_LIST } from './db/constants.js';
import { generateSchedule, getSundaysInMonth } from './solver/scheduler.js';
import {
  authenticateUser,
  cleanupExpiredSessions,
  createSession,
  createUser,
  resetBootstrapLeader,
  getUserById,
  getUserIdByVolunteerId,
  revokeSession,
  deleteUserById
} from './db/authRepository.js';
import { clearSessionCookie, parseCookies, rateLimitLogin, requireAuth, requireRole, setSessionCookie } from './auth.js';
import {
  ensureSupabaseUser,
  isSupabaseAdminConfigured,
  isSupabaseAuthConfigured
} from './supabase.js';

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

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return ['true', '1', 'yes', 'sim'].includes(value.trim().toLowerCase());
  return Boolean(value);
}

function validateUnavailabilityInput(input = {}, current = null) {
  const date = input.date || current?.date;
  const shift = String(input.shift || current?.shift || 'ALL').toUpperCase();
  const volunteerId = Number(input.volunteerId ?? input.volunteer_id ?? current?.volunteer_id);

  if (!Number.isInteger(volunteerId) || volunteerId <= 0) throw new Error('A valid volunteerId is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Date must use YYYY-MM-DD format.');
  if (!['MORNING', 'NIGHT', 'ALL'].includes(shift)) throw new Error('Invalid unavailability shift.');
  const [year, month] = date.split('-').map(Number);
  if (month < 1 || month > 12 || !getSundaysInMonth(year, month).includes(date)) {
    throw new Error('Unavailability date must be a Sunday in the selected month.');
  }
  const volunteer = getVolunteerById(volunteerId);
  if (!volunteer || !volunteer.active) throw new Error('Volunteer not found or inactive.');

  return {
    volunteerId,
    date,
    shift,
    reason: input.reason !== undefined ? String(input.reason || '').trim() || null : current?.reason || null
  };
}

function parseYearMonth(input = {}, { defaultYear = 2026, defaultMonth = 9 } = {}) {
  const year = input.year === undefined ? defaultYear : Number(input.year);
  const month = input.month === undefined ? defaultMonth : Number(input.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error('Invalid year.');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Invalid month.');
  return { year, month };
}

function getBootstrapAdminFromEnv() {
  const email = process.env.AUTH_BOOTSTRAP_EMAIL?.trim() || '';
  const password = process.env.AUTH_BOOTSTRAP_PASSWORD || '';
  const name = process.env.AUTH_BOOTSTRAP_NAME || 'Líder';
  if (!email && !password) return undefined;
  if (!email || !password) {
    throw new Error('AUTH_BOOTSTRAP_EMAIL and AUTH_BOOTSTRAP_PASSWORD must be provided together.');
  }
  if (password.length < 8) {
    throw new Error('AUTH_BOOTSTRAP_PASSWORD must contain at least 8 characters.');
  }
  return {
    email,
    password,
    name,
    resetExisting: process.env.AUTH_BOOTSTRAP_RESET === 'true'
  };
}

function normalizeAssignment(assignment) {
  return {
    date: String(assignment.date || ''),
    shift: String(assignment.shift || '').toUpperCase(),
    role: String(assignment.role || '').toUpperCase(),
    volunteerId: Number(assignment.volunteerId ?? assignment.volunteer_id),
    isTrainee: parseBoolean(assignment.isTrainee ?? assignment.is_trainee)
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
  timeZone = 'America/Sao_Paulo',
  bootstrapAdmin,
  supabaseAuthClient = null
} = {}) {
  const app = express();
  app.locals.db = getDatabase(dbPath);
  app.locals.closeDatabase = closeDatabase;
  app.locals.now = now;
  app.locals.supabaseAuthClient = supabaseAuthClient;

  if (bootstrapAdmin) resetBootstrapLeader(bootstrapAdmin);
  cleanupExpiredSessions(now());

  app.locals.supabaseBootstrapReady = Promise.resolve(null);
  if (bootstrapAdmin && isSupabaseAuthConfigured() && isSupabaseAdminConfigured()) {
    app.locals.supabaseBootstrapReady = ensureSupabaseUser(bootstrapAdmin).catch(error => {
      console.warn(`Could not provision Supabase bootstrap user: ${error.message}`);
      return null;
    });
  }

  const allowedCorsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedCorsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS.'));
    },
    credentials: true
  }));
  app.use(express.json({ limit: '100kb' }));

  app.post('/api/auth/login', rateLimitLogin, (req, res) => {
    if (isSupabaseAuthConfigured()) {
      return res.status(410).json({
        error: 'Use Supabase Auth signInWithPassword from the client.',
        code: 'SUPABASE_AUTH_ENABLED'
      });
    }
    try {
      const user = authenticateUser(req.body?.email, req.body?.password);
      if (!user) return res.status(401).json({ error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
      const currentTime = now();
      const session = createSession(user.id, currentTime);
      setSessionCookie(res, session.token, session.expiresAt, currentTime);
      return res.json({ user, expiresAt: session.expiresAt });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    revokeSession(parseCookies(req.headers.cookie).session);
    clearSessionCookie(res);
    res.status(204).end();
  });

  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

  app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.user }));

  app.get('/api/me/directory', requireAuth, (req, res) => {
    res.json({ volunteers: getAllVolunteers({ activeOnly: true }).map(volunteer => ({
      id: volunteer.id,
      name: volunteer.name,
      proficiencies: volunteer.proficiencies || {}
    })) });
  });

  app.get('/api/me/schedule', requireAuth, (req, res) => {
    try {
      if (!req.user.volunteerId) return res.status(403).json({ error: 'Authenticated user is not linked to a volunteer.', code: 'VOLUNTEER_LINK_REQUIRED' });
      const year = req.query.year === undefined ? undefined : Number(req.query.year);
      const month = req.query.month === undefined ? undefined : Number(req.query.month);
      if (year !== undefined && (!Number.isInteger(year) || year < 2000 || year > 2200)) return res.status(400).json({ error: 'Invalid year.' });
      if (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) return res.status(400).json({ error: 'Invalid month.' });
      res.json({ assignments: getPublishedAssignmentsByVolunteerId(req.user.volunteerId, { year, month }) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/me/unavailabilities', requireAuth, (req, res) => {
    if (!req.user.volunteerId) return res.status(403).json({ error: 'Authenticated user is not linked to a volunteer.', code: 'VOLUNTEER_LINK_REQUIRED' });
    res.json(getUnavailabilitiesByVolunteerId(req.user.volunteerId));
  });

  function validateSelfUnavailability(input, current = null, volunteerId) {
    return validateUnavailabilityInput({ ...input, volunteerId: volunteerId ?? current?.volunteer_id }, current);
  }

  app.post('/api/me/unavailabilities', requireAuth, (req, res) => {
    try {
      if (!req.user.volunteerId) return res.status(403).json({ error: 'Authenticated user is not linked to a volunteer.', code: 'VOLUNTEER_LINK_REQUIRED' });
      const input = validateSelfUnavailability(req.body || {}, null, req.user.volunteerId);
      const cutoffDate = getUnavailabilityCutoff(input.date);
      if (getCalendarDate(now(), timeZone) > cutoffDate) {
        return res.status(422).json({ error: `Unavailability cutoff passed on ${cutoffDate}.`, code: 'UNAVAILABILITY_CUTOFF_PASSED', details: { cutoffDate } });
      }
      res.status(201).json(addUnavailability({ ...input, volunteerId: req.user.volunteerId }));
    } catch (error) {
      res.status(422).json({ error: error.message });
    }
  });

  app.patch('/api/me/unavailabilities/:id', requireAuth, (req, res) => {
    try {
      if (!req.user.volunteerId) return res.status(403).json({ error: 'Authenticated user is not linked to a volunteer.', code: 'VOLUNTEER_LINK_REQUIRED' });
      const current = getUnavailabilityById(Number(req.params.id));
      if (!current || current.volunteer_id !== req.user.volunteerId) return res.status(404).json({ error: 'Unavailability not found.' });
      const input = validateSelfUnavailability(req.body || {}, current, req.user.volunteerId);
      const cutoffDate = getUnavailabilityCutoff(input.date);
      if (getCalendarDate(now(), timeZone) > cutoffDate) {
        return res.status(422).json({ error: `Unavailability cutoff passed on ${cutoffDate}.`, code: 'UNAVAILABILITY_CUTOFF_PASSED', details: { cutoffDate } });
      }
      res.json(updateUnavailability(current.id, input));
    } catch (error) {
      res.status(422).json({ error: error.message });
    }
  });

  app.delete('/api/me/unavailabilities/:id', requireAuth, (req, res) => {
    const current = getUnavailabilityById(Number(req.params.id));
    if (!current || current.volunteer_id !== req.user.volunteerId) return res.status(404).json({ error: 'Unavailability not found.' });
    try {
      const cutoffDate = getUnavailabilityCutoff(current.date);
      if (getCalendarDate(now(), timeZone) > cutoffDate) return res.status(422).json({ error: `Unavailability cutoff passed on ${cutoffDate}.`, code: 'UNAVAILABILITY_CUTOFF_PASSED', details: { cutoffDate } });
      deleteUnavailability(current.id);
      res.status(204).end();
    } catch (error) {
      res.status(422).json({ error: error.message });
    }
  });

  app.get('/api/me/exchanges', requireAuth, (req, res) => {
    if (!req.user.volunteerId) return res.status(403).json({ error: 'Authenticated user is not linked to a volunteer.', code: 'VOLUNTEER_LINK_REQUIRED' });
    res.json({ exchanges: getExchangesByVolunteerId(req.user.volunteerId) });
  });

  app.get('/api/me/notifications', requireAuth, (req, res) => {
    res.json({ notifications: getNotificationsByUserId(req.user.id) });
  });

  app.post('/api/me/notifications/:id/read', requireAuth, (req, res) => {
    const notification = markNotificationRead(Number(req.params.id), req.user.id);
    if (!notification) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ notification });
  });

  app.post('/api/me/notifications/read-all', requireAuth, (req, res) => {
    res.json({ updated: markAllNotificationsRead(req.user.id) });
  });

  app.get('/api/admin/exchanges', requireAuth, requireRole('LEADER'), (req, res) => {
    res.json({ exchanges: getAllScheduleExchanges() });
  });

  function requireVolunteerIdentity(req, res) {
    if (!req.user.volunteerId) {
      res.status(403).json({ error: 'Authenticated user is not linked to a volunteer.', code: 'VOLUNTEER_LINK_REQUIRED' });
      return null;
    }
    return req.user.volunteerId;
  }

  app.post('/api/exchanges', requireAuth, requireRole('VOLUNTEER'), (req, res) => {
    try {
      const volunteerId = requireVolunteerIdentity(req, res);
      if (!volunteerId) return;
      const assignmentId = Number(req.body?.assignmentId);
      const targetVolunteerId = Number(req.body?.targetVolunteerId);
      if (!Number.isInteger(assignmentId) || !Number.isInteger(targetVolunteerId)) return res.status(400).json({ error: 'assignmentId and targetVolunteerId are required.' });
      const exchange = createScheduleExchange({ assignmentId, requesterId: volunteerId, targetVolunteerId, reason: req.body.reason || null });
      const targetUserId = getUserIdByVolunteerId(targetVolunteerId);
      if (targetUserId) createNotification({
        userId: targetUserId,
        type: 'EXCHANGE_REQUESTED',
        exchangeId: exchange.id,
        message: `${exchange.requesterName} solicitou uma troca para ${exchange.date} (${exchange.shift}).`
      });
      res.status(201).json({ exchange });
    } catch (error) {
      res.status(422).json({ error: error.message });
    }
  });

  app.post('/api/exchanges/:id/accept', requireAuth, requireRole('VOLUNTEER'), (req, res) => {
    try {
      const volunteerId = requireVolunteerIdentity(req, res);
      if (!volunteerId) return;
      res.json({ exchange: acceptScheduleExchange(Number(req.params.id), volunteerId, req.user.id) });
    } catch (error) {
      res.status(422).json({ error: error.message });
    }
  });

  app.post('/api/exchanges/:id/reject', requireAuth, requireRole('VOLUNTEER'), (req, res) => {
    try {
      const volunteerId = requireVolunteerIdentity(req, res);
      if (!volunteerId) return;
      const exchange = rejectScheduleExchange(Number(req.params.id), volunteerId, req.body?.rejectionReason || null);
      const requesterUserId = getUserIdByVolunteerId(exchange.requesterId);
      if (requesterUserId) createNotification({ userId: requesterUserId, type: 'EXCHANGE_REJECTED', exchangeId: exchange.id, message: 'Sua solicitação de troca foi rejeitada.' });
      res.json({ exchange });
    } catch (error) {
      res.status(422).json({ error: error.message });
    }
  });

  app.post('/api/exchanges/:id/cancel', requireAuth, requireRole('VOLUNTEER'), (req, res) => {
    try {
      const volunteerId = requireVolunteerIdentity(req, res);
      if (!volunteerId) return;
      const exchange = cancelScheduleExchange(Number(req.params.id), volunteerId);
      const targetUserId = getUserIdByVolunteerId(exchange.targetVolunteerId);
      if (targetUserId) createNotification({ userId: targetUserId, type: 'EXCHANGE_CANCELLED', exchangeId: exchange.id, message: 'Uma solicitação de troca foi cancelada.' });
      res.json({ exchange });
    } catch (error) {
      res.status(422).json({ error: error.message });
    }
  });

  app.use('/api/volunteers', requireAuth, requireRole('LEADER'));
  app.use('/api/unavailabilities', requireAuth, requireRole('LEADER'));
  app.use('/api/schedule', requireAuth, requireRole('LEADER'));

  app.post('/api/admin/users', requireAuth, requireRole('LEADER'), async (req, res) => {
    try {
      const input = req.body || {};
      const user = createUser(input);
      if (isSupabaseAuthConfigured()) {
        if (!isSupabaseAdminConfigured()) {
          deleteUserById(user.id);
          return res.status(503).json({
            error: 'Configure SUPABASE_SECRET_KEY before provisioning users from the API.',
            code: 'SUPABASE_ADMIN_NOT_CONFIGURED'
          });
        }
        try {
          await ensureSupabaseUser(input);
        } catch (error) {
          deleteUserById(user.id);
          throw error;
        }
      }
      res.status(201).json({ user });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/admin/users/:id', requireAuth, requireRole('LEADER'), (req, res) => {
    const user = getUserById(Number(req.params.id));
    if (!user) return res.status(404).json({ error: 'User not found.' });
    return res.json({ user });
  });

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
    const input = validateUnavailabilityInput(req.body || {});
    const cutoffDate = getUnavailabilityCutoff(input.date);
    if (getCalendarDate(now(), timeZone) > cutoffDate) {
      return res.status(422).json({
        error: `Unavailability cutoff passed on ${cutoffDate}.`,
        code: 'UNAVAILABILITY_CUTOFF_PASSED',
        details: { cutoffDate }
      });
    }
    const record = addUnavailability(input);
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
      const input = validateUnavailabilityInput(req.body || {}, current);
      const cutoffDate = getUnavailabilityCutoff(input.date);
      if (getCalendarDate(now(), timeZone) > cutoffDate) {
        return res.status(422).json({
          error: `Unavailability cutoff passed on ${cutoffDate}.`,
          code: 'UNAVAILABILITY_CUTOFF_PASSED',
          details: { cutoffDate }
        });
      }
      res.json(updateUnavailability(id, input));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/unavailabilities/:id', (req, res) => {
  try {
    const success = deleteUnavailability(parseInt(req.params.id));
    if (!success) return res.status(404).json({ error: 'Unavailability not found.' });
    res.json({ success });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- Schedule & Solver API ---

  app.get('/api/schedule', (req, res) => {
  try {
    const { year, month } = parseYearMonth(req.query);
    const schedule = getScheduleByMonthYear(year, month);
    res.json(schedule || { year, month, status: 'DRAFT', assignments: [] });
  } catch (error) {
    res.status(error.message.startsWith('Invalid ') ? 400 : 500).json({ error: error.message });
  }
});

  app.post('/api/schedule/generate', (req, res) => {
  try {
    const { year, month } = parseYearMonth(req.body || {});

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
    res.status(error.message.startsWith('Invalid ') ? 400 : 500).json({ error: error.message });
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
  const app = createApp({
    bootstrapAdmin: getBootstrapAdminFromEnv()
  });
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}
