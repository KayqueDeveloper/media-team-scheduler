// @ts-nocheck -- Legacy server module; keep database boundaries explicit.
import { getDatabase } from './db/index.js';
import { getAssignmentsByScheduleId } from './db/repository.js';

const MAX_INVITATIONS_PER_ROUND = 5;
const CONTACT_CHANNELS = ['WHATSAPP', 'PHONE', 'EMAIL', 'IN_PERSON', 'OTHER'];

function domainError(message, code, status = 422) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function dateDistanceInDays(from, to) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function publicInvitation(row) {
  if (!row) return null;
  return {
    id: row.id,
    coverageRequestId: row.coverage_request_id,
    volunteerId: row.volunteer_id,
    status: row.status,
    respondedAt: row.responded_at || null,
    createdAt: row.created_at,
    date: row.date,
    shift: row.shift,
    role: row.role,
    isTrainee: Boolean(row.is_trainee),
    reason: row.reason,
    requestStatus: row.request_status,
    originalVolunteerName: row.original_volunteer_name,
    winnerVolunteerName: row.winner_volunteer_name || null,
    requestedByName: row.requested_by_name
  };
}

const invitationSelect = `
  SELECT i.*, r.status AS request_status, r.reason,
    a.date, a.shift, a.role, a.is_trainee,
    original.name AS original_volunteer_name,
    winner.name AS winner_volunteer_name,
    creator.name AS requested_by_name
  FROM coverage_invitations i
  JOIN coverage_requests r ON r.id = i.coverage_request_id
  JOIN assignments a ON a.id = r.assignment_id
  JOIN volunteers original ON original.id = r.original_volunteer_id
  LEFT JOIN volunteers winner ON winner.id = r.winner_volunteer_id
  JOIN users creator ON creator.id = r.created_by_user_id
`;

async function getAssignmentContext(db, assignmentId) {
  return db.one(
    `
    SELECT a.*, s.status AS schedule_status, s.year, s.month, s.published_version,
      s.warnings AS schedule_warnings, v.name AS volunteer_name,
      c.id AS confirmation_id, c.status AS confirmation_status
    FROM assignments a
    JOIN schedules s ON s.id = a.schedule_id
    JOIN volunteers v ON v.id = a.volunteer_id
    LEFT JOIN service_confirmations c
      ON c.assignment_id = a.id AND c.volunteer_id = a.volunteer_id
      AND c.status != 'SUPERSEDED'
    WHERE a.id = ?
  `,
    [assignmentId]
  );
}

async function canManageAssignment(db, user, assignment) {
  if (!assignment || !user) return false;
  if (user.role === 'LEADER') return true;
  if (!user.scopes?.includes('COORDINATOR') || !user.volunteerId) return false;
  return Boolean(
    await db.one(
      `
    SELECT 1
    FROM assignments coordinator
    WHERE coordinator.schedule_id = ?
      AND coordinator.date = ?
      AND coordinator.shift = ?
      AND coordinator.role = 'COORDINATOR'
      AND coordinator.volunteer_id = ?
    LIMIT 1
  `,
      [assignment.schedule_id, assignment.date, assignment.shift, user.volunteerId]
    )
  );
}

async function assertManageAssignment(db, user, assignmentId) {
  const assignment = await getAssignmentContext(db, assignmentId);
  if (!assignment) throw domainError('Alocação não encontrada.', 'ASSIGNMENT_NOT_FOUND', 404);
  if (!(await canManageAssignment(db, user, assignment))) {
    throw domainError('Você não coordena este turno.', 'COORDINATOR_ASSIGNMENT_REQUIRED', 403);
  }
  return assignment;
}

async function eligibleCandidateRows(db, assignment) {
  return db.all(
    `
    SELECT v.id, v.name, v.email, v.phone, v.allowed_shift,
      p.level AS proficiency_level,
      (SELECT COUNT(*)
       FROM assignments history
       JOIN schedules history_schedule ON history_schedule.id = history.schedule_id
       WHERE history.volunteer_id = v.id AND history_schedule.status = 'PUBLISHED'
         AND history.date < ?) AS previous_assignments
    FROM volunteers v
    JOIN proficiencies p ON p.volunteer_id = v.id AND p.role = ?
    JOIN users u ON u.volunteer_id = v.id
      AND u.role = 'VOLUNTEER' AND u.active = 1 AND u.approval_status = 'APPROVED'
    WHERE v.active = 1
      AND v.id != ?
      AND (v.allowed_shift = 'ALL' OR v.allowed_shift = ?)
      AND ((? = 1 AND p.level = 1) OR (? = 0 AND p.level >= 2))
      AND NOT EXISTS (
        SELECT 1 FROM unavailabilities unavailable
        WHERE unavailable.volunteer_id = v.id AND unavailable.date = ?
          AND (unavailable.shift = 'ALL' OR unavailable.shift = ?)
      )
      AND NOT EXISTS (
        SELECT 1 FROM assignments occupied
        JOIN schedules occupied_schedule ON occupied_schedule.id = occupied.schedule_id
        WHERE occupied.volunteer_id = v.id AND occupied.date = ?
          AND occupied_schedule.status = 'PUBLISHED'
      )
    ORDER BY p.level DESC, previous_assignments ASC, v.name ASC
  `,
    [
      assignment.date,
      assignment.role,
      assignment.volunteer_id,
      assignment.shift,
      assignment.is_trainee,
      assignment.is_trainee,
      assignment.date,
      assignment.shift,
      assignment.date
    ]
  );
}

async function assertCandidateIds(db, assignment, rawCandidateIds) {
  const candidateIds = [...new Set((rawCandidateIds || []).map(Number))];
  if (candidateIds.length < 1 || candidateIds.length > MAX_INVITATIONS_PER_ROUND) {
    throw domainError(
      `Selecione entre 1 e ${MAX_INVITATIONS_PER_ROUND} voluntários por rodada.`,
      'COVERAGE_INVITATION_LIMIT'
    );
  }
  if (candidateIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw domainError('A lista de voluntários é inválida.', 'INVALID_COVERAGE_CANDIDATES');
  }
  const eligible = await eligibleCandidateRows(db, assignment);
  const eligibleIds = new Set(eligible.map((item) => Number(item.id)));
  if (candidateIds.some((id) => !eligibleIds.has(id))) {
    throw domainError(
      'Um dos voluntários selecionados não está mais elegível para esta posição.',
      'COVERAGE_CANDIDATE_NOT_ELIGIBLE'
    );
  }
  return { candidateIds, eligible };
}

async function notifyVolunteer(db, volunteerId, type, coverageRequestId, message) {
  await db.run(
    `
    INSERT INTO notifications (user_id, type, coverage_request_id, message)
    SELECT id, ?, ?, ? FROM users
    WHERE volunteer_id = ? AND active = 1 AND approval_status = 'APPROVED'
  `,
    [type, coverageRequestId, message, volunteerId]
  );
}

async function closeInvitations(db, requestId, status) {
  await db.run(
    `
    UPDATE coverage_invitations
    SET status = ?, responded_at = COALESCE(responded_at, CURRENT_TIMESTAMP)
    WHERE coverage_request_id = ? AND status = 'PENDING'
  `,
    [status, requestId]
  );
}

async function addInvitationsOn(db, request, assignment, actorUserId, candidateIds) {
  const { candidateIds: validatedIds } = await assertCandidateIds(db, assignment, candidateIds);
  for (const volunteerId of validatedIds) {
    const existing = await db.one(
      `
      SELECT id FROM coverage_invitations
      WHERE coverage_request_id = ? AND volunteer_id = ?
    `,
      [request.id, volunteerId]
    );
    if (existing)
      throw domainError('Este voluntário já foi convidado para a cobertura.', 'COVERAGE_ALREADY_INVITED');
  }
  for (const volunteerId of validatedIds) {
    await db.run(
      `
      INSERT INTO coverage_invitations
        (coverage_request_id, volunteer_id, invited_by_user_id)
      VALUES (?, ?, ?)
    `,
      [request.id, volunteerId, actorUserId]
    );
    await notifyVolunteer(
      db,
      volunteerId,
      'COVERAGE_INVITED',
      request.id,
      `Você foi convidado para cobrir ${assignment.role} em ${assignment.date} · ${assignment.shift}.`
    );
  }
}

export function createCoverageRequestModule({
  db = getDatabase(),
  now = () => new Date(),
  timeZone = 'America/Sao_Paulo'
} = {}) {
  function currentDate() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function currentLocalDateTime() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(now());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
  }

  async function expirePastRequests(databaseRef = db) {
    const expired = await databaseRef.all(
      `
      SELECT request.id
      FROM coverage_requests request
      JOIN assignments assignment ON assignment.id = request.assignment_id
      WHERE request.status = 'OPEN' AND assignment.date < ?
    `,
      [currentDate()]
    );
    for (const request of expired) {
      await databaseRef.run(
        `UPDATE coverage_requests SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'`,
        [request.id]
      );
      await closeInvitations(databaseRef, request.id, 'EXPIRED');
    }
  }

  async function listManagedServices(user, { year, month }) {
    await expirePastRequests();
    const params = [year, month];
    const permission =
      user.role === 'LEADER'
        ? ''
        : `AND EXISTS (
          SELECT 1 FROM assignments coordinator
          WHERE coordinator.schedule_id = team.schedule_id
            AND coordinator.date = team.date
            AND coordinator.shift = team.shift
            AND coordinator.role = 'COORDINATOR'
            AND coordinator.volunteer_id = ?
        )`;
    if (user.role !== 'LEADER') params.push(user.volunteerId);
    const rows = await db.all(
      `
      SELECT team.*, volunteer.name AS volunteer_name, volunteer.email, volunteer.phone,
        COALESCE(confirmation.status, 'NOT_REQUESTED') AS confirmation_status,
        confirmation.confirmation_source,
        request.id AS coverage_request_id, request.status AS coverage_status,
        (SELECT COUNT(*) FROM service_contact_attempts attempt
          WHERE attempt.assignment_id = team.id) AS contact_attempt_count,
        (SELECT MAX(attempt.created_at) FROM service_contact_attempts attempt
          WHERE attempt.assignment_id = team.id) AS last_contact_at
      FROM assignments team
      JOIN schedules schedule ON schedule.id = team.schedule_id
      JOIN volunteers volunteer ON volunteer.id = team.volunteer_id
      LEFT JOIN service_confirmations confirmation
        ON confirmation.assignment_id = team.id
        AND confirmation.volunteer_id = team.volunteer_id
        AND confirmation.status != 'SUPERSEDED'
      LEFT JOIN coverage_requests request
        ON request.assignment_id = team.id AND request.status = 'OPEN'
      WHERE schedule.status = 'PUBLISHED' AND schedule.year = ? AND schedule.month = ?
        ${permission}
      ORDER BY team.date, team.shift, team.role, team.is_trainee
    `,
      params
    );

    const grouped = new Map();
    for (const row of rows) {
      const key = `${row.schedule_id}:${row.date}:${row.shift}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          scheduleId: row.schedule_id,
          date: row.date,
          shift: row.shift,
          team: []
        });
      }
      grouped.get(key).team.push({
        assignmentId: row.id,
        volunteerId: row.volunteer_id,
        volunteerName: row.volunteer_name,
        email: row.email || '',
        phone: row.phone || '',
        role: row.role,
        isTrainee: Boolean(row.is_trainee),
        confirmationStatus: row.confirmation_status,
        confirmationSource: row.confirmation_source || null,
        coverageRequestId: row.coverage_request_id || null,
        coverageStatus: row.coverage_status || null,
        contactAttemptCount: Number(row.contact_attempt_count) || 0,
        lastContactAt: row.last_contact_at || null
      });
    }
    return [...grouped.values()];
  }

  async function listCandidates(user, assignmentId) {
    const assignment = await assertManageAssignment(db, user, assignmentId);
    if (assignment.schedule_status !== 'PUBLISHED') {
      throw domainError('A escala precisa estar publicada.', 'SCHEDULE_NOT_PUBLISHED');
    }
    return eligibleCandidateRows(db, assignment);
  }

  async function recordContactAttempt(user, assignmentId, { channel, note } = {}) {
    const assignment = await assertManageAssignment(db, user, assignmentId);
    const normalizedChannel = String(channel || '').toUpperCase();
    if (!CONTACT_CHANNELS.includes(normalizedChannel)) {
      throw domainError('Canal de contato inválido.', 'INVALID_CONTACT_CHANNEL');
    }
    const normalizedNote = String(note || '').trim();
    if (normalizedNote.length > 500)
      throw domainError('A observação deve ter no máximo 500 caracteres.', 'CONTACT_NOTE_TOO_LONG');
    const result = await db.run(
      `
      INSERT INTO service_contact_attempts
        (assignment_id, volunteer_id, actor_user_id, channel, note)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id
    `,
      [assignment.id, assignment.volunteer_id, user.id, normalizedChannel, normalizedNote || null]
    );
    return db.one('SELECT * FROM service_contact_attempts WHERE id = ?', [result.lastInsertRowid]);
  }

  async function confirmManually(user, assignmentId) {
    await assertManageAssignment(db, user, assignmentId);
    await db.transaction(async (tx) => {
      const assignment = await getAssignmentContext(tx, assignmentId);
      if (!assignment || assignment.schedule_status !== 'PUBLISHED') {
        throw domainError('A alocação não está publicada.', 'SCHEDULE_NOT_PUBLISHED');
      }
      if (assignment.confirmation_status === 'EXCHANGE_PENDING') {
        throw domainError('Existe uma troca pendente para esta alocação.', 'EXCHANGE_ALREADY_PENDING');
      }
      const open = await tx.one(
        `
        SELECT id FROM coverage_requests
        WHERE assignment_id = ? AND original_volunteer_id = ? AND status = 'OPEN'
      `,
        [assignment.id, assignment.volunteer_id]
      );
      if (open) {
        const cancelled = await tx.run(
          `
          UPDATE coverage_requests
          SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'OPEN'
          RETURNING id
        `,
          [open.id]
        );
        if (!cancelled.changes)
          throw domainError('A cobertura já foi atendida.', 'COVERAGE_ALREADY_RESOLVED', 409);
        await closeInvitations(tx, open.id, 'CANCELLED');
      }
      await tx.run(
        `
        INSERT INTO service_confirmations
          (schedule_id, assignment_id, volunteer_id, status, responded_at, confirmation_source, confirmed_by_user_id)
        VALUES (?, ?, ?, 'CONFIRMED', CURRENT_TIMESTAMP, ?, ?)
        ON CONFLICT(assignment_id, volunteer_id) DO UPDATE SET
          status = 'CONFIRMED', responded_at = CURRENT_TIMESTAMP,
          superseded_at = NULL, confirmation_source = excluded.confirmation_source,
          confirmed_by_user_id = excluded.confirmed_by_user_id, updated_at = CURRENT_TIMESTAMP
      `,
        [
          assignment.schedule_id,
          assignment.id,
          assignment.volunteer_id,
          user.role === 'LEADER' ? 'LEADER' : 'COORDINATOR',
          user.id
        ]
      );
      await notifyVolunteer(
        tx,
        assignment.volunteer_id,
        'SERVICE_CONFIRMED_MANUALLY',
        open?.id || null,
        `Sua presença em ${assignment.date} · ${assignment.shift} foi confirmada por ${user.name}.`
      );
    });
    return getAssignmentContext(db, assignmentId);
  }

  async function createRequest(user, assignmentId, { reason, candidateIds } = {}) {
    const assignment = await assertManageAssignment(db, user, assignmentId);
    const normalizedReason = String(reason || '').trim();
    if (normalizedReason.length < 3 || normalizedReason.length > 500) {
      throw domainError('Informe um motivo entre 3 e 500 caracteres.', 'COVERAGE_REASON_REQUIRED');
    }
    if (assignment.schedule_status !== 'PUBLISHED')
      throw domainError('A escala precisa estar publicada.', 'SCHEDULE_NOT_PUBLISHED');
    const distance = dateDistanceInDays(currentDate(), assignment.date);
    if (distance < 0) throw domainError('Não é possível cobrir uma alocação passada.', 'PAST_ASSIGNMENT');
    if (user.role !== 'LEADER' && distance > 3) {
      throw domainError(
        'O coordenador pode iniciar a cobertura a partir de três dias antes do culto.',
        'COVERAGE_WINDOW_NOT_OPEN'
      );
    }
    if (assignment.confirmation_status === 'CONFIRMED')
      throw domainError('O voluntário já confirmou presença.', 'ASSIGNMENT_ALREADY_CONFIRMED');
    if (assignment.confirmation_status === 'EXCHANGE_PENDING')
      throw domainError('O voluntário já solicitou troca.', 'EXCHANGE_ALREADY_PENDING');
    if (
      await db.one(`SELECT 1 FROM schedule_exchanges WHERE assignment_id = ? AND status = 'PENDING'`, [
        assignment.id
      ])
    ) {
      throw domainError('Existe uma troca pendente para esta alocação.', 'EXCHANGE_ALREADY_PENDING');
    }
    const { candidateIds: validatedIds } = await assertCandidateIds(db, assignment, candidateIds);
    const openedEarly = currentLocalDateTime() < `${addDays(assignment.date, -2)}T18:00`;

    let requestId;
    await db.transaction(async (tx) => {
      if (
        await tx.one(`SELECT id FROM coverage_requests WHERE assignment_id = ? AND status = 'OPEN'`, [
          assignment.id
        ])
      ) {
        throw domainError('Já existe uma cobertura aberta para esta alocação.', 'COVERAGE_ALREADY_OPEN', 409);
      }
      const result = await tx.run(
        `
        INSERT INTO coverage_requests
          (schedule_id, assignment_id, original_volunteer_id, created_by_user_id, reason, opened_early)
        VALUES (?, ?, ?, ?, ?, ?)
        RETURNING id
      `,
        [
          assignment.schedule_id,
          assignment.id,
          assignment.volunteer_id,
          user.id,
          normalizedReason,
          openedEarly ? 1 : 0
        ]
      );
      requestId = result.lastInsertRowid;
      await tx.run(
        `
        INSERT INTO service_confirmations (schedule_id, assignment_id, volunteer_id)
        VALUES (?, ?, ?)
        ON CONFLICT(assignment_id, volunteer_id) DO NOTHING
      `,
        [assignment.schedule_id, assignment.id, assignment.volunteer_id]
      );
      await addInvitationsOn(tx, { id: requestId }, assignment, user.id, validatedIds);
    });
    return getRequest(user, requestId);
  }

  async function getRequest(user, requestId) {
    const request = await db.one(
      `
      SELECT r.*, a.date, a.shift, a.role, a.is_trainee,
        original.name AS original_volunteer_name,
        winner.name AS winner_volunteer_name,
        creator.name AS created_by_name
      FROM coverage_requests r
      JOIN assignments a ON a.id = r.assignment_id
      JOIN volunteers original ON original.id = r.original_volunteer_id
      LEFT JOIN volunteers winner ON winner.id = r.winner_volunteer_id
      JOIN users creator ON creator.id = r.created_by_user_id
      WHERE r.id = ?
    `,
      [requestId]
    );
    if (!request) throw domainError('Solicitação de cobertura não encontrada.', 'COVERAGE_NOT_FOUND', 404);
    const assignment = await assertManageAssignment(db, user, request.assignment_id);
    const invitations = await db.all(
      `${invitationSelect} WHERE i.coverage_request_id = ? ORDER BY i.created_at`,
      [requestId]
    );
    return {
      id: request.id,
      assignmentId: request.assignment_id,
      scheduleId: request.schedule_id,
      originalVolunteerId: request.original_volunteer_id,
      originalVolunteerName: request.original_volunteer_name,
      winnerVolunteerId: request.winner_volunteer_id || null,
      winnerVolunteerName: request.winner_volunteer_name || null,
      createdByName: request.created_by_name,
      status: request.status,
      reason: request.reason,
      openedEarly: Boolean(request.opened_early),
      date: request.date,
      shift: request.shift,
      role: request.role,
      isTrainee: Boolean(request.is_trainee),
      invitations: invitations.map(publicInvitation),
      assignmentVolunteerId: assignment.volunteer_id
    };
  }

  async function addInvitations(user, requestId, candidateIds) {
    const request = await db.one('SELECT * FROM coverage_requests WHERE id = ?', [requestId]);
    if (!request) throw domainError('Solicitação de cobertura não encontrada.', 'COVERAGE_NOT_FOUND', 404);
    const assignment = await assertManageAssignment(db, user, request.assignment_id);
    if (request.status !== 'OPEN')
      throw domainError('A solicitação de cobertura já foi encerrada.', 'COVERAGE_ALREADY_RESOLVED', 409);
    await db.transaction((tx) => addInvitationsOn(tx, request, assignment, user.id, candidateIds));
    return getRequest(user, requestId);
  }

  async function cancelRequest(user, requestId) {
    const request = await db.one('SELECT * FROM coverage_requests WHERE id = ?', [requestId]);
    if (!request) throw domainError('Solicitação de cobertura não encontrada.', 'COVERAGE_NOT_FOUND', 404);
    await assertManageAssignment(db, user, request.assignment_id);
    await db.transaction(async (tx) => {
      const cancelled = await tx.run(
        `
        UPDATE coverage_requests
        SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'OPEN'
        RETURNING id
      `,
        [requestId]
      );
      if (!cancelled.changes)
        throw domainError('A cobertura já foi encerrada.', 'COVERAGE_ALREADY_RESOLVED', 409);
      await closeInvitations(tx, requestId, 'CANCELLED');
    });
    return getRequest(user, requestId);
  }

  async function listMyInvitations(user) {
    if (!user.volunteerId) return [];
    await expirePastRequests();
    const rows = await db.all(
      `${invitationSelect}
      WHERE i.volunteer_id = ?
      ORDER BY CASE WHEN i.status = 'PENDING' THEN 0 ELSE 1 END, i.created_at DESC
    `,
      [user.volunteerId]
    );
    return rows.map(publicInvitation);
  }

  async function getMyInvitation(user, invitationId, databaseRef = db) {
    const row = await databaseRef.one(`${invitationSelect} WHERE i.id = ? AND i.volunteer_id = ?`, [
      invitationId,
      user.volunteerId
    ]);
    if (!row) throw domainError('Convite de cobertura não encontrado.', 'COVERAGE_INVITATION_NOT_FOUND', 404);
    return row;
  }

  async function acceptInvitation(user, invitationId) {
    if (!user.volunteerId)
      throw domainError('Sua conta não está vinculada a um voluntário.', 'VOLUNTEER_LINK_REQUIRED', 403);
    let won = false;
    let requestId;
    let deferredError = null;
    await db.transaction(async (tx) => {
      const invitation = await getMyInvitation(user, invitationId, tx);
      requestId = invitation.coverage_request_id;
      if (invitation.status !== 'PENDING' || invitation.request_status !== 'OPEN') {
        if (invitation.status === 'PENDING') {
          await tx.run(
            `UPDATE coverage_invitations SET status = 'FILLED_BY_OTHER', responded_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [invitation.id]
          );
        }
        return;
      }
      const assignment = await getAssignmentContext(
        tx,
        (await tx.one('SELECT assignment_id FROM coverage_requests WHERE id = ?', [requestId])).assignment_id
      );
      if (assignment.date < currentDate()) {
        await tx.run(
          `UPDATE coverage_requests SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'`,
          [requestId]
        );
        await closeInvitations(tx, requestId, 'EXPIRED');
        deferredError = domainError('Esta solicitação de cobertura expirou.', 'COVERAGE_EXPIRED', 409);
        return;
      }
      const eligible = await eligibleCandidateRows(tx, assignment);
      if (!eligible.some((item) => Number(item.id) === Number(user.volunteerId))) {
        await tx.run(
          `UPDATE coverage_invitations SET status = 'NO_LONGER_ELIGIBLE', responded_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [invitation.id]
        );
        deferredError = domainError(
          'Você não está mais elegível para esta cobertura.',
          'COVERAGE_CANDIDATE_NOT_ELIGIBLE',
          409
        );
        return;
      }
      const claimed = await tx.run(
        `
        UPDATE coverage_requests
        SET status = 'FILLED', winner_volunteer_id = ?, filled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'OPEN'
          AND original_volunteer_id = ?
          AND EXISTS (
            SELECT 1 FROM assignments current_assignment
            JOIN schedules current_schedule ON current_schedule.id = current_assignment.schedule_id
            WHERE current_assignment.id = coverage_requests.assignment_id
              AND current_assignment.volunteer_id = coverage_requests.original_volunteer_id
              AND current_schedule.status = 'PUBLISHED'
          )
          AND NOT EXISTS (
            SELECT 1 FROM service_confirmations current_confirmation
            WHERE current_confirmation.assignment_id = coverage_requests.assignment_id
              AND current_confirmation.volunteer_id = coverage_requests.original_volunteer_id
              AND current_confirmation.status IN ('CONFIRMED', 'EXCHANGE_PENDING')
          )
        RETURNING id
      `,
        [user.volunteerId, requestId, assignment.volunteer_id]
      );
      if (!claimed.changes) {
        await tx.run(
          `UPDATE coverage_invitations SET status = 'FILLED_BY_OTHER', responded_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [invitation.id]
        );
        return;
      }

      const replacement = await tx.run(
        `
        UPDATE assignments SET volunteer_id = ?
        WHERE id = ? AND volunteer_id = ?
      `,
        [user.volunteerId, assignment.id, assignment.volunteer_id]
      );
      if (!replacement.changes)
        throw domainError('A alocação mudou durante o aceite.', 'ASSIGNMENT_CHANGED', 409);
      won = true;

      await tx.run(
        `UPDATE coverage_invitations SET status = 'ACCEPTED', responded_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [invitation.id]
      );
      await closeInvitations(tx, requestId, 'FILLED_BY_OTHER');
      await tx.run(
        `
        UPDATE service_confirmations
        SET status = 'SUPERSEDED', superseded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE assignment_id = ? AND volunteer_id = ? AND status != 'SUPERSEDED'
      `,
        [assignment.id, assignment.volunteer_id]
      );
      await tx.run(
        `
        INSERT INTO service_confirmations
          (schedule_id, assignment_id, volunteer_id, status, responded_at, confirmation_source, confirmed_by_user_id)
        VALUES (?, ?, ?, 'CONFIRMED', CURRENT_TIMESTAMP, 'COVERAGE', ?)
        ON CONFLICT(assignment_id, volunteer_id) DO UPDATE SET
          status = 'CONFIRMED', responded_at = CURRENT_TIMESTAMP,
          superseded_at = NULL, confirmation_source = 'COVERAGE',
          confirmed_by_user_id = excluded.confirmed_by_user_id, updated_at = CURRENT_TIMESTAMP
      `,
        [assignment.schedule_id, assignment.id, user.volunteerId, user.id]
      );

      const nextVersion = Number(assignment.published_version) + 1;
      const assignments = await getAssignmentsByScheduleId(assignment.schedule_id, tx);
      await tx.run(
        `
        INSERT INTO schedule_versions (schedule_id, version, assignments, warnings)
        VALUES (?, ?, ?, ?)
      `,
        [
          assignment.schedule_id,
          nextVersion,
          JSON.stringify(assignments),
          assignment.schedule_warnings || '[]'
        ]
      );
      await tx.run(
        `
        UPDATE schedules SET published_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `,
        [nextVersion, assignment.schedule_id]
      );
      await tx.run(
        `
        INSERT INTO schedule_change_events
          (schedule_id, from_version, to_version, coverage_request_id, assignment_id,
           previous_volunteer_id, new_volunteer_id, changed_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          assignment.schedule_id,
          assignment.published_version,
          nextVersion,
          requestId,
          assignment.id,
          assignment.volunteer_id,
          user.volunteerId,
          user.id
        ]
      );

      await tx.run(
        `
        UPDATE coverage_invitations
        SET status = 'NO_LONGER_ELIGIBLE', responded_at = CURRENT_TIMESTAMP
        WHERE volunteer_id = ? AND status = 'PENDING'
          AND coverage_request_id IN (
            SELECT other_request.id
            FROM coverage_requests other_request
            JOIN assignments other_assignment ON other_assignment.id = other_request.assignment_id
            WHERE other_request.status = 'OPEN' AND other_assignment.date = ?
          )
      `,
        [user.volunteerId, assignment.date]
      );

      await notifyVolunteer(
        tx,
        user.volunteerId,
        'COVERAGE_ACCEPTED',
        requestId,
        `Você assumiu ${assignment.role} em ${assignment.date} · ${assignment.shift}. Sua presença já está confirmada.`
      );
      await notifyVolunteer(
        tx,
        assignment.volunteer_id,
        'COVERAGE_REPLACED',
        requestId,
        `Sua alocação de ${assignment.role} em ${assignment.date} · ${assignment.shift} foi coberta por outra pessoa.`
      );
      const otherInvitees = await tx.all(
        `
        SELECT volunteer_id FROM coverage_invitations
        WHERE coverage_request_id = ? AND id != ?
      `,
        [requestId, invitation.id]
      );
      for (const other of otherInvitees) {
        await notifyVolunteer(
          tx,
          other.volunteer_id,
          'COVERAGE_FILLED',
          requestId,
          'Esta solicitação já foi atendida por outra pessoa. Obrigado pela disponibilidade e preocupação com a equipe.'
        );
      }
      await tx.run(
        `
        INSERT INTO notifications (user_id, type, coverage_request_id, message)
        SELECT id, 'COVERAGE_UPDATED', ?, ? FROM users
        WHERE (id = ? OR role = 'LEADER') AND active = 1
      `,
        [
          requestId,
          `A cobertura de ${assignment.role} em ${assignment.date} foi preenchida.`,
          (await tx.one('SELECT created_by_user_id FROM coverage_requests WHERE id = ?', [requestId]))
            .created_by_user_id
        ]
      );
    });
    if (deferredError) throw deferredError;
    const invitation = publicInvitation(await getMyInvitation(user, invitationId));
    return { invitation, won, coverageRequestId: requestId };
  }

  async function declineInvitation(user, invitationId) {
    await getMyInvitation(user, invitationId);
    const result = await db.run(
      `
      UPDATE coverage_invitations
      SET status = 'DECLINED', responded_at = CURRENT_TIMESTAMP
      WHERE id = ? AND volunteer_id = ? AND status = 'PENDING'
    `,
      [invitationId, user.volunteerId]
    );
    if (!result.changes)
      throw domainError('Este convite já foi encerrado.', 'COVERAGE_INVITATION_CLOSED', 409);
    return publicInvitation(await getMyInvitation(user, invitationId));
  }

  return {
    listManagedServices,
    listCandidates,
    recordContactAttempt,
    confirmManually,
    createRequest,
    getRequest,
    addInvitations,
    cancelRequest,
    listMyInvitations,
    acceptInvitation,
    declineInvitation
  };
}
