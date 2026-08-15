// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
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
  getExchangeCandidates,
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
import {
  generateSchedule,
  getSundaysInMonth,
  summarizeCoverage,
  validateSchedule as validateScheduleDomain
} from './solver/scheduler.js';
import { getUnavailabilityCutoff } from '../apps/api/src/modules/availability/domain/policy.js';
import {
  approvePendingRegistration,
  createPendingRegistration,
  createUser,
  deletePendingRegistration,
  ensureBootstrapProfile,
  getPendingRegistrationById,
  getPendingRegistrations,
  getUserById,
  getUserIdByVolunteerId,
  deleteUserById,
  markUserEmailConfirmed,
  registrationEmailExists,
  updatePendingRegistration
} from './db/authRepository.js';
import { requireAuth, requireRole } from './auth.js';
import {
  deleteSupabaseUser,
  ensureSupabaseUser,
  findSupabaseUserByEmail,
  getSupabaseAdminClient,
  getSupabaseUserById,
  isSupabaseAdminConfigured,
  isSupabaseAuthConfigured,
  signUpSupabaseUser
} from './supabase.js';
import { validatePublicRegistration } from './registration.js';
import { createServiceConfirmationModule } from './serviceConfirmations.js';
import { createSmtpEmailSender } from './email.js';

const PORT = process.env.PORT || 3001;

function createLogger() {
  return pino({
    enabled: process.env.NODE_ENV === 'production',
    level: process.env.LOG_LEVEL || 'info',
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      remove: true
    }
  });
}

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

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return ['true', '1', 'yes', 'sim'].includes(value.trim().toLowerCase());
  return Boolean(value);
}

async function validateUnavailabilityInput(input = {}, current = null) {
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
  const volunteer = await getVolunteerById(volunteerId);
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
  if (!email) {
    if (password) throw new Error('AUTH_BOOTSTRAP_EMAIL is required when AUTH_BOOTSTRAP_PASSWORD is provided.');
    return undefined;
  }
  if (password && password.length < 8) {
    throw new Error('AUTH_BOOTSTRAP_PASSWORD must contain at least 8 characters.');
  }
  return {
    email,
    password,
    name
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

async function validateDraftAssignments(schedule, rawAssignments = [], lockedSlots = []) {
  const assignments = rawAssignments.map(normalizeAssignment);
  const errors = [];
  const volunteers = await getAllVolunteers({ activeOnly: false });
  const unavailabilities = await getAllUnavailabilities();
  const occupiedSlots = new Set();
  const qualifiedPrincipalSlots = new Set();

  for (const assignment of assignments) {
    const slotKey = `${assignment.date}:${assignment.shift}:${assignment.role}`;
    const assignmentKey = `${slotKey}:${assignment.isTrainee ? 'trainee' : 'main'}`;
    if (!SHIFT_LIST.includes(assignment.shift)) errors.push(`${assignmentKey}: turno inválido.`);
    if (!ROLE_LIST.includes(assignment.role)) errors.push(`${assignmentKey}: função inválida.`);
    if (occupiedSlots.has(assignmentKey)) errors.push(`${assignmentKey}: alocação duplicada.`);
    occupiedSlots.add(assignmentKey);
    if (!assignment.isTrainee) {
      const volunteer = volunteers.find(item => item.id === assignment.volunteerId);
      if (Number(volunteer?.proficiencies?.[assignment.role] || 0) >= 2) {
        qualifiedPrincipalSlots.add(slotKey);
      }
    }
  }

  const domainValidation = validateScheduleDomain({
    year: schedule.year,
    month: schedule.month,
    assignments,
    volunteers: volunteers.map(volunteer => ({
      id: volunteer.id,
      name: volunteer.name,
      active: Boolean(volunteer.active),
      allowedShift: volunteer.allowedShift || 'ALL',
      proficiencies: volunteer.proficiencies || {}
    })),
    unavailabilities: unavailabilities.map(item => ({
      id: item.id,
      volunteerId: item.volunteer_id,
      date: item.date,
      shift: item.shift || 'ALL',
      reason: item.reason || null
    }))
  });
  errors.push(...domainValidation.violations.map(violation => violation.message));

  const normalizedLocks = [...new Set(lockedSlots.map(String))];
  for (const slotKey of normalizedLocks) {
    if (!qualifiedPrincipalSlots.has(slotKey)) errors.push(`${slotKey}: vaga travada exige uma alocação principal válida.`);
  }

  return { assignments, lockedSlots: normalizedLocks, errors };
}

function withCoverageWarnings(schedule, assignments, suppliedWarnings = []) {
  const coverage = summarizeCoverage({
    year: schedule.year,
    month: schedule.month,
    assignments,
    roles: ROLE_LIST,
    shifts: SHIFT_LIST
  });
  const warnings = [...suppliedWarnings];
  if (coverage.vacantSlots > 0) {
    warnings.push(`${coverage.vacantSlots} vaga(s) permaneceram sem alocação principal N2/N3.`);
  }
  return [...new Set(warnings.filter(Boolean).map(String))];
}

export function createApp({
  dbPath,
  now = () => new Date(),
  timeZone = 'America/Sao_Paulo',
  bootstrapAdmin,
  supabaseAuthClient = null,
  supabaseAdminClient = null,
  emailSender = null,
  publicAppUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3000',
  confirmationTokenSecret = process.env.CONFIRMATION_TOKEN_SECRET
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  const db = getDatabase(dbPath);
  app.locals.db = db;
  app.locals.closeDatabase = closeDatabase;
  app.locals.now = now;
  app.locals.logger = createLogger();
  app.locals.supabaseAuthClient = supabaseAuthClient;
  app.locals.supabaseAdminClient = supabaseAdminClient;
  const configuredEmailSender = emailSender || createSmtpEmailSender({ publicAppUrl });
  app.locals.serviceConfirmations = createServiceConfirmationModule({
    db,
    now,
    timeZone,
    emailSender: configuredEmailSender,
    publicAppUrl,
    tokenSecret: confirmationTokenSecret
  });

  app.locals.supabaseBootstrapReady = Promise.resolve(null);
  if (bootstrapAdmin?.password && isSupabaseAuthConfigured() && isSupabaseAdminConfigured()) {
    app.locals.supabaseBootstrapReady = ensureSupabaseUser(bootstrapAdmin).catch(error => {
      console.warn(`Could not provision Supabase bootstrap user: ${error.message}`);
      return null;
    });
  }

  app.locals.ready = (async () => {
    await db.ready;
    if (bootstrapAdmin) await ensureBootstrapProfile(bootstrapAdmin);
    await app.locals.supabaseBootstrapReady;
  })();

  const configuredCorsOrigins = process.env.CORS_ORIGIN?.trim();
  const defaultCorsOrigins = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';
  const allowedCorsOrigins = (configuredCorsOrigins || defaultCorsOrigins)
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  function getRegistrationRedirect(req) {
    const configuredRedirect = process.env.AUTH_EMAIL_REDIRECT_TO?.trim();
    if (configuredRedirect) return configuredRedirect;
    const origin = req.get('origin');
    if (!origin) return undefined;
    try {
      const originUrl = new URL(origin);
      const sameHost = originUrl.host === req.get('host');
      if (!sameHost && !allowedCorsOrigins.includes(origin)) return undefined;
      return `${originUrl.origin}/cadastro?confirmado=1`;
    } catch {
      return undefined;
    }
  }
  if (allowedCorsOrigins.length > 0) {
    app.use(cors({
      origin(origin, callback) {
        if (!origin || allowedCorsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origin is not allowed by CORS.'));
      }
    }));
  }
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use((req, res, next) => {
    const requestId = req.get('x-request-id')?.trim() || randomUUID();
    req.requestId = requestId;
    res.set('x-request-id', requestId);
    next();
  });
  app.use(pinoHttp({
    logger: app.locals.logger,
    genReqId: req => req.requestId
  }));
  app.use([
    '/api/auth/register',
    '/api/service-confirmations'
  ], rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  }));
  app.use(express.json({ limit: '100kb' }));
  const distDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  app.use(express.static(distDirectory));
  app.use(async (req, res, next) => {
    try {
      await app.locals.ready;
      next();
    } catch (error) {
      next(error);
    }
  });

  app.get('/health/live', (req, res) => res.json({ status: 'ok' }));

  app.get(['/health', '/health/ready'], async (req, res, next) => {
    try {
      await db.one('SELECT 1 AS ok');
      res.json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/service-confirmations/:token', async (req, res) => {
    const confirmation = await app.locals.serviceConfirmations.getByToken(req.params.token);
    if (!confirmation) return res.status(404).json({ error: 'Confirmação inválida ou desatualizada.' });
    res.json({
      confirmation,
      candidates: confirmation.status === 'AWAITING'
        ? await getExchangeCandidates(confirmation.assignmentId, { currentDate: getCalendarDate(now(), timeZone) })
        : []
    });
  });

  app.post('/api/service-confirmations/:token/confirm', async (req, res) => {
    try {
      const confirmation = await app.locals.serviceConfirmations.confirm(req.params.token);
      if (!confirmation) return res.status(404).json({ error: 'Confirmação inválida ou desatualizada.' });
      res.json({ confirmation });
    } catch (error) {
      res.status(422).json({ error: error.message, code: error.code || 'CONFIRMATION_FAILED' });
    }
  });

  app.post('/api/service-confirmations/:token/exchange', async (req, res) => {
    try {
      const confirmation = await app.locals.serviceConfirmations.getByToken(req.params.token);
      if (!confirmation) return res.status(404).json({ error: 'Confirmação inválida ou desatualizada.' });
      const reason = String(req.body?.reason || '').trim();
      if (!reason) return res.status(422).json({ error: 'Informe o motivo da solicitação de troca.', code: 'EXCHANGE_REASON_REQUIRED' });
      const targetAssignmentId = Number(req.body?.targetAssignmentId);
      if (!Number.isInteger(targetAssignmentId)) return res.status(400).json({ error: 'Selecione a escala desejada.' });
      const exchange = await createScheduleExchange({
        assignmentId: confirmation.assignmentId,
        requesterId: confirmation.volunteerId,
        targetAssignmentId,
        reason,
        confirmationId: confirmation.id,
        currentDate: getCalendarDate(now(), timeZone)
      });
      const targetUserId = await getUserIdByVolunteerId(exchange.targetVolunteerId);
      if (targetUserId) await createNotification({
        userId: targetUserId,
        type: 'EXCHANGE_REQUESTED',
        exchangeId: exchange.id,
        message: `${exchange.requesterName} solicitou trocar ${exchange.date} (${exchange.shift}) por ${exchange.targetDate} (${exchange.targetShift}).`
      });
      res.status(201).json({ exchange });
    } catch (error) {
      res.status(422).json({ error: error.message, code: error.code || 'EXCHANGE_REQUEST_FAILED' });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    let supabaseUser = null;
    try {
      const input = validatePublicRegistration(req.body || {});
      const adminClient = app.locals.supabaseAdminClient || getSupabaseAdminClient();
      if (!adminClient) {
        return res.status(503).json({
          error: 'O cadastro está temporariamente indisponível. Configure o acesso administrativo do Supabase.',
          code: 'SUPABASE_ADMIN_NOT_CONFIGURED'
        });
      }
      if (await registrationEmailExists(input.email) || await findSupabaseUserByEmail(input.email, adminClient)) {
        return res.status(409).json({
          error: 'Este e-mail já possui cadastro. Entre no sistema ou recupere sua senha.',
          code: 'EMAIL_ALREADY_REGISTERED'
        });
      }

      const signup = await signUpSupabaseUser({
        ...input,
        emailRedirectTo: getRegistrationRedirect(req)
      }, app.locals.supabaseAuthClient);
      supabaseUser = signup.user;
      if (String(supabaseUser.email || '').toLowerCase() !== input.email) {
        throw new Error('O Supabase retornou uma identidade incompatível com o e-mail informado.');
      }
      if (signup.session || supabaseUser.email_confirmed_at) {
        await deleteSupabaseUser(supabaseUser.id, adminClient);
        supabaseUser = null;
        return res.status(503).json({
          error: 'Ative a confirmação de e-mail no Supabase Auth antes de liberar o cadastro.',
          code: 'EMAIL_CONFIRMATION_REQUIRED'
        });
      }

      const registration = await createPendingRegistration({
        authUserId: supabaseUser.id,
        name: input.name,
        email: input.email,
        phone: input.phone
      });
      res.status(201).json({
        registration: {
          id: registration.id,
          email: registration.email,
          status: 'AWAITING_EMAIL_CONFIRMATION'
        },
        message: 'Enviamos um link de confirmação para o seu e-mail.'
      });
    } catch (error) {
      if (supabaseUser?.id) {
        try {
          await deleteSupabaseUser(supabaseUser.id, app.locals.supabaseAdminClient || getSupabaseAdminClient());
        } catch {
          // Preserve the original registration error. The orphaned Auth user can
          // be removed from the Supabase dashboard if compensation also fails.
        }
      }
      const duplicate = /unique|already registered|already exists|taken/i.test(String(error.message));
      res.status(duplicate ? 409 : 400).json({
        error: duplicate
          ? 'Este e-mail já possui cadastro. Entre no sistema ou recupere sua senha.'
          : error.message,
        code: duplicate ? 'EMAIL_ALREADY_REGISTERED' : (error.code || 'REGISTRATION_FAILED')
      });
    }
  });

  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

  app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.user }));

  app.get('/api/me/directory', requireAuth, async (req, res) => {
    res.json({ volunteers: (await getAllVolunteers({ activeOnly: true })).map(volunteer => ({
      id: volunteer.id,
      name: volunteer.name,
      proficiencies: volunteer.proficiencies || {}
    })) });
  });

  app.get('/api/me/schedule', requireAuth, async (req, res) => {
    try {
      if (!req.user.volunteerId) return res.status(403).json({ error: 'Authenticated user is not linked to a volunteer.', code: 'VOLUNTEER_LINK_REQUIRED' });
      const year = req.query.year === undefined ? undefined : Number(req.query.year);
      const month = req.query.month === undefined ? undefined : Number(req.query.month);
      if (year !== undefined && (!Number.isInteger(year) || year < 2000 || year > 2200)) return res.status(400).json({ error: 'Invalid year.' });
      if (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) return res.status(400).json({ error: 'Invalid month.' });
      res.json({ assignments: await getPublishedAssignmentsByVolunteerId(req.user.volunteerId, { year, month }) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/me/unavailabilities', requireAuth, async (req, res) => {
    if (!req.user.volunteerId) return res.status(403).json({ error: 'Authenticated user is not linked to a volunteer.', code: 'VOLUNTEER_LINK_REQUIRED' });
    res.json(await getUnavailabilitiesByVolunteerId(req.user.volunteerId));
  });

  async function validateSelfUnavailability(input, current = null, volunteerId) {
    return validateUnavailabilityInput({ ...input, volunteerId: volunteerId ?? current?.volunteer_id }, current);
  }

  app.post('/api/me/unavailabilities', requireAuth, async (req, res) => {
    try {
      if (!req.user.volunteerId) return res.status(403).json({ error: 'Authenticated user is not linked to a volunteer.', code: 'VOLUNTEER_LINK_REQUIRED' });
      const input = await validateSelfUnavailability(req.body || {}, null, req.user.volunteerId);
      const cutoffDate = getUnavailabilityCutoff(input.date);
      if (getCalendarDate(now(), timeZone) > cutoffDate) {
        return res.status(422).json({ error: `Unavailability cutoff passed on ${cutoffDate}.`, code: 'UNAVAILABILITY_CUTOFF_PASSED', details: { cutoffDate } });
      }
      res.status(201).json(await addUnavailability({ ...input, volunteerId: req.user.volunteerId }));
    } catch (error) {
      res.status(422).json({ error: error.message });
    }
  });

  app.patch('/api/me/unavailabilities/:id', requireAuth, async (req, res) => {
    try {
      if (!req.user.volunteerId) return res.status(403).json({ error: 'Authenticated user is not linked to a volunteer.', code: 'VOLUNTEER_LINK_REQUIRED' });
      const current = await getUnavailabilityById(Number(req.params.id));
      if (!current || current.volunteer_id !== req.user.volunteerId) return res.status(404).json({ error: 'Unavailability not found.' });
      const input = await validateSelfUnavailability(req.body || {}, current, req.user.volunteerId);
      const cutoffDate = getUnavailabilityCutoff(input.date);
      if (getCalendarDate(now(), timeZone) > cutoffDate) {
        return res.status(422).json({ error: `Unavailability cutoff passed on ${cutoffDate}.`, code: 'UNAVAILABILITY_CUTOFF_PASSED', details: { cutoffDate } });
      }
      res.json(await updateUnavailability(current.id, input));
    } catch (error) {
      res.status(422).json({ error: error.message });
    }
  });

  app.delete('/api/me/unavailabilities/:id', requireAuth, async (req, res) => {
    const current = await getUnavailabilityById(Number(req.params.id));
    if (!current || current.volunteer_id !== req.user.volunteerId) return res.status(404).json({ error: 'Unavailability not found.' });
    try {
      const cutoffDate = getUnavailabilityCutoff(current.date);
      if (getCalendarDate(now(), timeZone) > cutoffDate) return res.status(422).json({ error: `Unavailability cutoff passed on ${cutoffDate}.`, code: 'UNAVAILABILITY_CUTOFF_PASSED', details: { cutoffDate } });
      await deleteUnavailability(current.id);
      res.status(204).end();
    } catch (error) {
      res.status(422).json({ error: error.message });
    }
  });

  app.get('/api/me/exchanges', requireAuth, async (req, res) => {
    if (!req.user.volunteerId) return res.status(403).json({ error: 'Authenticated user is not linked to a volunteer.', code: 'VOLUNTEER_LINK_REQUIRED' });
    res.json({ exchanges: await getExchangesByVolunteerId(req.user.volunteerId) });
  });

  app.get('/api/me/notifications', requireAuth, async (req, res) => {
    res.json({ notifications: await getNotificationsByUserId(req.user.id) });
  });

  app.post('/api/me/notifications/:id/read', requireAuth, async (req, res) => {
    const notification = await markNotificationRead(Number(req.params.id), req.user.id);
    if (!notification) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ notification });
  });

  app.post('/api/me/notifications/read-all', requireAuth, async (req, res) => {
    res.json({ updated: await markAllNotificationsRead(req.user.id) });
  });

  app.get('/api/admin/exchanges', requireAuth, requireRole('LEADER'), async (req, res) => {
    res.json({ exchanges: await getAllScheduleExchanges() });
  });

  app.get('/api/admin/service-confirmations', requireAuth, requireRole('LEADER'), async (req, res) => {
    const year = req.query.year === undefined ? undefined : Number(req.query.year);
    const month = req.query.month === undefined ? undefined : Number(req.query.month);
    if (year !== undefined && !Number.isInteger(year)) return res.status(400).json({ error: 'Ano inválido.' });
    if (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) return res.status(400).json({ error: 'Mês inválido.' });
    res.json({ confirmations: await app.locals.serviceConfirmations.listForLeader({ year, month }) });
  });

  app.post('/api/admin/service-confirmations/dispatch', requireAuth, requireRole('LEADER'), async (req, res) => {
    try {
      res.json(await app.locals.serviceConfirmations.dispatchDueReminders());
    } catch (error) {
      res.status(503).json({ error: error.message, code: 'EMAIL_DISPATCH_FAILED' });
    }
  });

  async function syncPendingEmailConfirmations() {
    const adminClient = app.locals.supabaseAdminClient || getSupabaseAdminClient();
    if (!adminClient) return;
    const pending = await getPendingRegistrations({ confirmedOnly: false });
    await Promise.all(pending
      .filter(registration => !registration.emailConfirmedAt && registration.authUserId)
      .map(async registration => {
        const authUser = await getSupabaseUserById(registration.authUserId, adminClient);
        if (authUser?.email_confirmed_at) {
          await markUserEmailConfirmed(registration.id, authUser.email_confirmed_at);
        }
      }));
  }

  function registrationResponse(registration) {
    if (!registration) return null;
    const { authUserId, ...safeRegistration } = registration;
    return safeRegistration;
  }

  app.get('/api/admin/registrations', requireAuth, requireRole('LEADER'), async (req, res) => {
    try {
      await syncPendingEmailConfirmations();
      res.json({ registrations: (await getPendingRegistrations()).map(registrationResponse) });
    } catch (error) {
      res.status(502).json({ error: error.message, code: 'REGISTRATION_SYNC_FAILED' });
    }
  });

  app.patch('/api/admin/registrations/:id', requireAuth, requireRole('LEADER'), async (req, res) => {
    try {
      const registration = await updatePendingRegistration(Number(req.params.id), req.body || {});
      if (!registration) return res.status(404).json({ error: 'Cadastro pendente não encontrado.' });
      res.json({ registration: registrationResponse(registration) });
    } catch (error) {
      res.status(422).json({ error: error.message });
    }
  });

  app.post('/api/admin/registrations/:id/approve', requireAuth, requireRole('LEADER'), async (req, res) => {
    try {
      await syncPendingEmailConfirmations();
      const id = Number(req.params.id);
      const registration = await getPendingRegistrationById(id);
      if (!registration) return res.status(404).json({ error: 'Cadastro pendente não encontrado.' });
      const user = await approvePendingRegistration(id);
      res.json({ user, volunteer: await getVolunteerById(registration.volunteerId) });
    } catch (error) {
      res.status(422).json({ error: error.message });
    }
  });

  app.delete('/api/admin/registrations/:id', requireAuth, requireRole('LEADER'), async (req, res) => {
    try {
      const registration = await getPendingRegistrationById(Number(req.params.id));
      if (!registration) return res.status(404).json({ error: 'Cadastro pendente não encontrado.' });
      const adminClient = app.locals.supabaseAdminClient || getSupabaseAdminClient();
      if (!adminClient) return res.status(503).json({ error: 'Supabase Admin não está configurado.' });
      await deleteSupabaseUser(registration.authUserId, adminClient);
      await deletePendingRegistration(registration.id);
      res.status(204).end();
    } catch (error) {
      res.status(502).json({ error: error.message, code: 'REGISTRATION_REJECTION_FAILED' });
    }
  });

  function requireVolunteerIdentity(req, res) {
    if (!req.user.volunteerId) {
      res.status(403).json({ error: 'Authenticated user is not linked to a volunteer.', code: 'VOLUNTEER_LINK_REQUIRED' });
      return null;
    }
    return req.user.volunteerId;
  }

  app.post('/api/exchanges', requireAuth, requireRole('VOLUNTEER'), async (req, res) => {
    try {
      const volunteerId = requireVolunteerIdentity(req, res);
      if (!volunteerId) return;
      const assignmentId = Number(req.body?.assignmentId);
      const targetAssignmentId = Number(req.body?.targetAssignmentId);
      if (!Number.isInteger(assignmentId) || !Number.isInteger(targetAssignmentId)) return res.status(400).json({ error: 'assignmentId and targetAssignmentId are required.' });
      const exchange = await createScheduleExchange({
        assignmentId,
        requesterId: volunteerId,
        targetAssignmentId,
        reason: req.body.reason,
        currentDate: getCalendarDate(now(), timeZone)
      });
      const targetUserId = await getUserIdByVolunteerId(exchange.targetVolunteerId);
      if (targetUserId) await createNotification({
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

  app.get('/api/exchanges/candidates', requireAuth, requireRole('VOLUNTEER'), async (req, res) => {
    const volunteerId = requireVolunteerIdentity(req, res);
    if (!volunteerId) return;
    const assignmentId = Number(req.query.assignmentId);
    if (!Number.isInteger(assignmentId)) return res.status(400).json({ error: 'assignmentId is required.' });
    const owned = (await getPublishedAssignmentsByVolunteerId(volunteerId)).some(item => item.id === assignmentId);
    if (!owned) return res.status(404).json({ error: 'Published assignment not found.' });
    res.json({ candidates: await getExchangeCandidates(assignmentId, { currentDate: getCalendarDate(now(), timeZone) }) });
  });

  app.post('/api/exchanges/:id/accept', requireAuth, requireRole('VOLUNTEER'), async (req, res) => {
    try {
      const volunteerId = requireVolunteerIdentity(req, res);
      if (!volunteerId) return;
      res.json({ exchange: await acceptScheduleExchange(Number(req.params.id), volunteerId, req.user.id, {
        currentDate: getCalendarDate(now(), timeZone)
      }) });
    } catch (error) {
      res.status(422).json({ error: error.message });
    }
  });

  app.post('/api/exchanges/:id/reject', requireAuth, requireRole('VOLUNTEER'), async (req, res) => {
    try {
      const volunteerId = requireVolunteerIdentity(req, res);
      if (!volunteerId) return;
      const exchange = await rejectScheduleExchange(Number(req.params.id), volunteerId, req.body?.rejectionReason || null);
      const requesterUserId = await getUserIdByVolunteerId(exchange.requesterId);
      if (requesterUserId) await createNotification({ userId: requesterUserId, type: 'EXCHANGE_REJECTED', exchangeId: exchange.id, message: 'Sua solicitação de troca foi rejeitada.' });
      res.json({ exchange });
    } catch (error) {
      res.status(422).json({ error: error.message });
    }
  });

  app.post('/api/exchanges/:id/cancel', requireAuth, requireRole('VOLUNTEER'), async (req, res) => {
    try {
      const volunteerId = requireVolunteerIdentity(req, res);
      if (!volunteerId) return;
      const exchange = await cancelScheduleExchange(Number(req.params.id), volunteerId);
      const targetUserId = await getUserIdByVolunteerId(exchange.targetVolunteerId);
      if (targetUserId) await createNotification({ userId: targetUserId, type: 'EXCHANGE_CANCELLED', exchangeId: exchange.id, message: 'Uma solicitação de troca foi cancelada.' });
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
      const user = await createUser(input);
      if (isSupabaseAuthConfigured()) {
        if (!isSupabaseAdminConfigured()) {
          await deleteUserById(user.id);
          return res.status(503).json({
            error: 'Configure SUPABASE_SECRET_KEY before provisioning users from the API.',
            code: 'SUPABASE_ADMIN_NOT_CONFIGURED'
          });
        }
        try {
          await ensureSupabaseUser(input);
        } catch (error) {
          await deleteUserById(user.id);
          throw error;
        }
      }
      res.status(201).json({ user });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/admin/users/:id', requireAuth, requireRole('LEADER'), async (req, res) => {
    const user = await getUserById(Number(req.params.id));
    if (!user) return res.status(404).json({ error: 'User not found.' });
    return res.json({ user });
  });

// --- Volunteers API ---

  app.get('/api/volunteers', async (req, res) => {
  try {
    const activeOnly = req.query.active === 'true';
    const volunteers = await getAllVolunteers({ activeOnly, includeProficiencies: true });
    res.json(volunteers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

  app.post('/api/volunteers', async (req, res) => {
  try {
    const volunteer = await createVolunteer(req.body);
    if (req.body.proficiencies) {
      await setVolunteerProficiencies(volunteer.id, req.body.proficiencies);
    }
    res.status(201).json((await getAllVolunteers({ activeOnly: false })).find(v => v.id === volunteer.id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

  const handleUpdateVolunteer = async (req, res) => {
    try {
      const updated = await updateVolunteer(Number(req.params.id), req.body);
      if (!updated) return res.status(404).json({ error: 'Volunteer not found.' });
      if (req.body.proficiencies) {
        await setVolunteerProficiencies(updated.id, req.body.proficiencies);
      }
      res.json((await getAllVolunteers({ activeOnly: false })).find(volunteer => volunteer.id === updated.id));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };

  app.patch('/api/volunteers/:id', handleUpdateVolunteer);
  app.put('/api/volunteers/:id', handleUpdateVolunteer);

  app.delete('/api/volunteers/:id', async (req, res) => {
    try {
      const archived = await deleteVolunteer(Number(req.params.id));
      if (!archived) return res.status(404).json({ error: 'Volunteer not found.' });
      res.json(archived);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put('/api/volunteers/:id/proficiencies', async (req, res) => {
    try {
      const volunteerId = Number(req.params.id);
      const volunteer = (await getAllVolunteers({ activeOnly: false })).find(item => item.id === volunteerId);
      if (!volunteer) return res.status(404).json({ error: 'Volunteer not found.' });
      if (!req.body.proficiencies || typeof req.body.proficiencies !== 'object') {
        return res.status(400).json({ error: 'proficiencies must be an object.' });
      }
      res.json(await replaceVolunteerProficiencies(volunteerId, req.body.proficiencies));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/volunteers/:id/proficiencies/:role', async (req, res) => {
    try {
      const volunteerId = Number(req.params.id);
      await deleteProficiency(volunteerId, req.params.role.toUpperCase());
      res.json(await getProficienciesByVolunteerId(volunteerId));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/volunteers/:id/proficiency', async (req, res) => {
  try {
    const { proficiencies } = req.body;
    const updated = await setVolunteerProficiencies(parseInt(req.params.id), proficiencies);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- Unavailabilities API ---

  app.get('/api/unavailabilities', async (req, res) => {
  try {
    let list = await getAllUnavailabilities();
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

  app.post('/api/unavailabilities', async (req, res) => {
  try {
    const input = await validateUnavailabilityInput(req.body || {});
    const cutoffDate = getUnavailabilityCutoff(input.date);
    if (getCalendarDate(now(), timeZone) > cutoffDate) {
      return res.status(422).json({
        error: `Unavailability cutoff passed on ${cutoffDate}.`,
        code: 'UNAVAILABILITY_CUTOFF_PASSED',
        details: { cutoffDate }
      });
    }
    const record = await addUnavailability(input);
    res.status(201).json(record);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
  });

  app.patch('/api/unavailabilities/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const current = await getUnavailabilityById(id);
      if (!current) return res.status(404).json({ error: 'Unavailability not found.' });
      const input = await validateUnavailabilityInput(req.body || {}, current);
      const cutoffDate = getUnavailabilityCutoff(input.date);
      if (getCalendarDate(now(), timeZone) > cutoffDate) {
        return res.status(422).json({
          error: `Unavailability cutoff passed on ${cutoffDate}.`,
          code: 'UNAVAILABILITY_CUTOFF_PASSED',
          details: { cutoffDate }
        });
      }
      res.json(await updateUnavailability(id, input));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/unavailabilities/:id', async (req, res) => {
  try {
    const success = await deleteUnavailability(parseInt(req.params.id));
    if (!success) return res.status(404).json({ error: 'Unavailability not found.' });
    res.json({ success });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- Schedule & Solver API ---

  app.get('/api/schedule', async (req, res) => {
  try {
    const { year, month } = parseYearMonth(req.query);
    const schedule = await getScheduleByMonthYear(year, month);
    res.json(schedule || { year, month, status: 'DRAFT', assignments: [] });
  } catch (error) {
    res.status(error.message.startsWith('Invalid ') ? 400 : 500).json({ error: error.message });
  }
});

  app.post('/api/schedule/generate', async (req, res) => {
  try {
    const { year, month } = parseYearMonth(req.body || {});

    const volunteers = await getAllVolunteers({ activeOnly: true, includeProficiencies: true });
    const unavailabilities = await getAllUnavailabilities();

    // Query past 90 days assignments for equity scoring
    const pastStartDate = new Date(year, month - 3, 1).toISOString().split('T')[0];
    const currentMonthStart = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const pastAssignments = await getAssignmentsByDateRange(pastStartDate, currentMonthStart);

    const proficiencies = [];
    volunteers.forEach(v => {
      if (v.proficiencies) {
        Object.entries(v.proficiencies).forEach(([role, level]) => {
          if (level > 0) proficiencies.push({ volunteerId: v.id, role, level });
        });
      }
    });

    let schedule = await getScheduleByMonthYear(year, month);
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
      schedule = await createSchedule({ year, month, status: 'DRAFT' });
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
    const updatedSchedule = await saveScheduleDraft(schedule.id, {
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

  app.put('/api/schedule/:id', async (req, res) => {
  try {
      const schedule = await getScheduleById(Number(req.params.id));
      if (!schedule) return res.status(404).json({ error: 'Schedule not found.' });
      if (schedule.status === 'PUBLISHED') {
        return res.status(409).json({ error: 'Reopen the published schedule before editing it.' });
      }
      const validation = await validateDraftAssignments(schedule, req.body.assignments || [], req.body.lockedSlots || []);
      if (validation.errors.length) {
        return res.status(422).json({
          error: validation.errors[0],
          code: 'INVALID_ASSIGNMENTS',
          details: { errors: validation.errors }
        });
      }
      const warnings = withCoverageWarnings(schedule, validation.assignments, req.body.warnings || []);
      res.json(await saveScheduleDraft(schedule.id, {
        assignments: validation.assignments,
        lockedSlots: validation.lockedSlots,
        warnings
      }));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/schedule/:id/publish', async (req, res) => {
  try {
      const schedule = await getScheduleById(Number(req.params.id));
      if (!schedule) return res.status(404).json({ error: 'Schedule not found.' });
      const validation = await validateDraftAssignments(schedule, schedule.assignments, schedule.lockedSlots);
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
      const published = await publishScheduleRecord(schedule.id, { warnings });
      if (!published) return res.status(404).json({ error: 'Schedule not found.' });
      res.json(published);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/schedule/:id/reopen', async (req, res) => {
  try {
      const reopened = await reopenScheduleRecord(Number(req.params.id));
      if (!reopened) return res.status(404).json({ error: 'Schedule not found.' });
      res.json(reopened);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/schedule/:id/versions', async (req, res) => {
  try {
      const schedule = await getScheduleById(Number(req.params.id));
      if (!schedule) return res.status(404).json({ error: 'Schedule not found.' });
      res.json(await getScheduleVersions(schedule.id));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put('/api/schedule/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const scheduleId = parseInt(req.params.id);
    const schedule = await getScheduleById(scheduleId);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found.' });
    if (status === 'PUBLISHED') {
      const validation = await validateDraftAssignments(schedule, schedule.assignments, schedule.lockedSlots);
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
      ? await publishScheduleRecord(scheduleId, { warnings })
      : status === 'DRAFT'
        ? await reopenScheduleRecord(scheduleId)
        : await updateScheduleStatus(scheduleId, status);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    return res.sendFile(path.join(distDirectory, 'index.html'));
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const isApiRequest = req.path.startsWith('/api') || req.path.startsWith('/health');
    if (!isApiRequest) return next(error);
    req.log.error({ err: error, requestId: req.requestId }, 'Unhandled API request error');
    return res.status(500).json({
      error: 'Internal server error.',
      code: 'INTERNAL_ERROR',
      requestId: req.requestId
    });
  });

  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const app = createApp({
    bootstrapAdmin: getBootstrapAdminFromEnv()
  });
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}
