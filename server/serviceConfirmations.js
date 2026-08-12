import crypto from 'node:crypto';

import { getDatabase } from './db/index.js';

function calendarDate(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addCalendarDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function tokenFor(id, secret) {
  const encodedId = Buffer.from(String(id)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encodedId).digest('base64url');
  return `${encodedId}.${signature}`;
}

function idFromToken(token, secret) {
  const [encodedId, suppliedSignature] = String(token || '').split('.');
  if (!encodedId || !suppliedSignature) return null;
  const expectedSignature = crypto.createHmac('sha256', secret).update(encodedId).digest();
  let supplied;
  try {
    supplied = Buffer.from(suppliedSignature, 'base64url');
  } catch {
    return null;
  }
  if (supplied.length !== expectedSignature.length || !crypto.timingSafeEqual(supplied, expectedSignature)) return null;
  const id = Number(Buffer.from(encodedId, 'base64url').toString('utf8'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function publicConfirmation(row) {
  if (!row) return null;
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    volunteerId: row.volunteer_id,
    status: row.status,
    date: row.date,
    shift: row.shift,
    role: row.role,
    isTrainee: Boolean(row.is_trainee),
    volunteerName: row.volunteer_name,
    reminderCount: Number(row.reminder_count) || 0,
    lastReminderOn: row.last_reminder_on || null,
    respondedAt: row.responded_at || null
  };
}

const confirmationSelect = `
  SELECT c.*, a.date, a.shift, a.role, a.is_trainee,
    v.name AS volunteer_name, COALESCE(u.email, v.email) AS recipient_email,
    s.status AS schedule_status
  FROM service_confirmations c
  LEFT JOIN assignments a ON a.id = c.assignment_id
  JOIN schedules s ON s.id = c.schedule_id
  JOIN volunteers v ON v.id = c.volunteer_id
  LEFT JOIN users u ON u.volunteer_id = c.volunteer_id
    AND u.active = 1 AND u.approval_status = 'APPROVED'
`;

export function createServiceConfirmationModule({
  db = getDatabase(),
  now = () => new Date(),
  timeZone = 'America/Sao_Paulo',
  emailSender,
  publicAppUrl = 'http://localhost:3000',
  tokenSecret = process.env.CONFIRMATION_TOKEN_SECRET
    || (process.env.NODE_ENV === 'production' ? null : 'development-only-confirmation-secret')
} = {}) {
  if (!tokenSecret) throw new Error('Configure CONFIRMATION_TOKEN_SECRET antes de iniciar as confirmações.');
  async function getCurrentById(id) {
    const row = await db.one(`${confirmationSelect} WHERE c.id = ?`, [id]);
    if (!row || row.status === 'SUPERSEDED') return null;
    if (!row.assignment_id || row.schedule_status !== 'PUBLISHED') return null;
    const assignment = await db.one('SELECT volunteer_id FROM assignments WHERE id = ?', [row.assignment_id]);
    return assignment?.volunteer_id === row.volunteer_id ? row : null;
  }

  async function ensureDueConfirmations(today) {
    const throughDate = addCalendarDays(today, 3);
    const assignments = await db.all(`
      SELECT a.*, s.published_version
      FROM assignments a
      JOIN schedules s ON s.id = a.schedule_id
      WHERE s.status = 'PUBLISHED' AND a.date >= ? AND a.date <= ?
      ORDER BY a.date, a.shift, a.role, a.is_trainee
    `, [today, throughDate]);

    for (const assignment of assignments) {
      await db.transaction(async tx => {
        await tx.run(`
          UPDATE service_confirmations
          SET status = 'SUPERSEDED', superseded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE assignment_id = ? AND volunteer_id != ? AND status != 'SUPERSEDED'
        `, [assignment.id, assignment.volunteer_id]);
        await tx.run(`
          INSERT INTO service_confirmations (schedule_id, assignment_id, volunteer_id)
          VALUES (?, ?, ?)
          ON CONFLICT(assignment_id, volunteer_id) DO UPDATE SET
            schedule_id = excluded.schedule_id,
            updated_at = CURRENT_TIMESTAMP
        `, [assignment.schedule_id, assignment.id, assignment.volunteer_id]);
      });
    }
  }

  async function dispatchDueReminders() {
    if (!emailSender?.sendServiceConfirmation) {
      throw new Error('O provedor de e-mail não está configurado.');
    }
    const today = calendarDate(now(), timeZone);
    const throughDate = addCalendarDays(today, 3);
    await ensureDueConfirmations(today);
    const due = await db.all(`${confirmationSelect}
      WHERE c.status = 'AWAITING'
        AND a.volunteer_id = c.volunteer_id
        AND a.date >= ? AND a.date <= ?
        AND (c.last_reminder_on IS NULL OR c.last_reminder_on != ?)
      ORDER BY a.date, a.shift, a.role, c.id
    `, [today, throughDate, today]);

    let sent = 0;
    let failed = 0;
    for (const confirmation of due) {
      if (!confirmation.recipient_email) {
        failed += 1;
        await db.run(`UPDATE service_confirmations
          SET last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `, ['Voluntário sem e-mail ativo.', confirmation.id]);
        continue;
      }
      const token = tokenFor(confirmation.id, tokenSecret);
      const confirmationUrl = `${publicAppUrl.replace(/\/$/, '')}/confirmar-presenca?token=${encodeURIComponent(token)}`;
      try {
        const delivery = await emailSender.sendServiceConfirmation({
          to: confirmation.recipient_email,
          volunteerName: confirmation.volunteer_name,
          date: confirmation.date,
          shift: confirmation.shift,
          role: confirmation.role,
          isTrainee: Boolean(confirmation.is_trainee),
          confirmationUrl,
          idempotencyKey: `service-confirmation/${confirmation.id}/${today}`
        });
        await db.run(`
          UPDATE service_confirmations
          SET last_reminder_on = ?, reminder_count = reminder_count + 1,
            provider_message_id = ?, last_error = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'AWAITING'
        `, [today, delivery?.id || null, confirmation.id]);
        sent += 1;
      } catch (error) {
        failed += 1;
        await db.run(`UPDATE service_confirmations
          SET last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `, [String(error?.message || error), confirmation.id]);
      }
    }

    const pendingExchanges = await db.all(`
      SELECT e.*, requester.name AS requester_name, target.name AS target_name,
        COALESCE(target_user.email, target.email) AS recipient_email,
        source.date AS source_date, source.shift AS source_shift,
        destination.date AS target_date, destination.shift AS target_shift
      FROM schedule_exchanges e
      JOIN assignments source ON source.id = e.assignment_id
      JOIN assignments destination ON destination.id = e.target_assignment_id
      JOIN volunteers requester ON requester.id = e.requester_id
      JOIN volunteers target ON target.id = e.target_volunteer_id
      LEFT JOIN users target_user ON target_user.volunteer_id = target.id
        AND target_user.active = 1 AND target_user.approval_status = 'APPROVED'
      WHERE e.status = 'PENDING'
        AND source.date >= ?
        AND (e.last_reminder_on IS NULL OR e.last_reminder_on != ?)
      ORDER BY e.created_at, e.id
    `, [today, today]);
    for (const exchange of pendingExchanges) {
      if (!exchange.recipient_email || !emailSender?.sendExchangeRequest) {
        failed += 1;
        continue;
      }
      try {
        await emailSender.sendExchangeRequest({
          to: exchange.recipient_email,
          requesterName: exchange.requester_name,
          targetName: exchange.target_name,
          sourceDate: exchange.source_date,
          sourceShift: exchange.source_shift,
          targetDate: exchange.target_date,
          targetShift: exchange.target_shift,
          reason: exchange.reason,
          idempotencyKey: `schedule-exchange/${exchange.id}/${today}`
        });
        await db.run(`UPDATE schedule_exchanges
          SET last_reminder_on = ? WHERE id = ? AND status = 'PENDING'
        `, [today, exchange.id]);
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    return { sent, failed, considered: due.length + pendingExchanges.length };
  }

  async function getByToken(token) {
    const id = idFromToken(token, tokenSecret);
    if (!id) return null;
    return publicConfirmation(await getCurrentById(id));
  }

  async function confirm(token) {
    const id = idFromToken(token, tokenSecret);
    if (!id) return null;
    const current = await getCurrentById(id);
    if (!current) return null;
    if (current.status === 'EXCHANGE_PENDING') {
      const error = new Error('Existe uma solicitação de troca pendente para esta escala.');
      error.code = 'EXCHANGE_PENDING';
      throw error;
    }
    await db.run(`
      UPDATE service_confirmations
      SET status = 'CONFIRMED', responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('AWAITING', 'CONFIRMED')
    `, [id]);
    return publicConfirmation(await getCurrentById(id));
  }

  async function listForLeader({ year, month } = {}) {
    const conditions = [];
    const params = [];
    if (year !== undefined) {
      conditions.push('s.year = ?');
      params.push(year);
    }
    if (month !== undefined) {
      conditions.push('s.month = ?');
      params.push(month);
    }
    const rows = await db.all(`${confirmationSelect}
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY a.date, a.shift, a.role, c.id
    `, params);
    return rows.map(row => ({
      ...publicConfirmation(row),
      volunteerId: row.volunteer_id,
      recipientEmail: row.recipient_email || null,
      lastError: row.last_error || null
    }));
  }

  return {
    dispatchDueReminders,
    getByToken,
    confirm,
    listForLeader,
    tokenForId: id => tokenFor(id, tokenSecret)
  };
}
