import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createApp } from './index.js';

async function createHttpFixture(options = {}) {
  const {
    databasePath,
    supabaseAuthClient: providedAuthClient,
    supabaseAdminClient: providedAdminClient,
    ...appOptions
  } = options;
  const ownsDirectory = !databasePath;
  const directory = ownsDirectory
    ? await mkdtemp(path.join(os.tmpdir(), 'media-scheduler-api-'))
    : path.dirname(databasePath);
  const authUsers = new Map();
  let nextAuthUserId = 1;
  const defaultAuthClient = {
    auth: {
      async getUser(token) {
        const prefix = 'test-token:';
        const email = token.startsWith(prefix) ? token.slice(prefix.length) : '';
        const registeredUser = [...authUsers.values()].find(user => user.email === email);
        return email
          ? { data: { user: registeredUser || { id: `supabase-${email}`, email, email_confirmed_at: '2026-01-01T00:00:00Z' } }, error: null }
          : { data: { user: null }, error: new Error('Invalid test token.') };
      },
      async signUp({ email, options: signupOptions }) {
        const user = {
          id: `signup-user-${nextAuthUserId++}`,
          email: email.toLowerCase(),
          email_confirmed_at: null,
          identities: [{ id: `identity-${email}` }],
          user_metadata: signupOptions?.data || {}
        };
        authUsers.set(user.id, user);
        return { data: { user, session: null }, error: null };
      }
    }
  };
  const defaultAdminClient = {
    auth: {
      admin: {
        async listUsers() {
          return { data: { users: [...authUsers.values()] }, error: null };
        },
        async getUserById(id) {
          return { data: { user: authUsers.get(id) || null }, error: null };
        },
        async deleteUser(id) {
          authUsers.delete(id);
          return { data: {}, error: null };
        }
      }
    }
  };
  const supabaseAuthClient = providedAuthClient || defaultAuthClient;
  const supabaseAdminClient = providedAdminClient || defaultAdminClient;
  const app = createApp({
    dbPath: databasePath || path.join(directory, 'test.sqlite'),
    now: () => new Date('2026-06-20T12:00:00Z'),
    bootstrapAdmin: { email: 'leader@test.local', name: 'Test Leader' },
    supabaseAuthClient,
    supabaseAdminClient,
    ...appOptions
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  let authToken = providedAuthClient ? 'test-supabase-token' : 'test-token:leader@test.local';

  async function request(method, pathname, body) {
    const headers = { ...(body === undefined ? {} : { 'content-type': 'application/json' }) };
    if (authToken) headers.authorization = `Bearer ${authToken}`;
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = response.status === 204 ? null : await response.json();
    return { status: response.status, body: payload };
  }

  async function requestUnauthenticated(method, pathname, body) {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = response.status === 204 ? null : await response.json();
    return { status: response.status, body: payload };
  }

  async function loginAs(email) {
    authToken = `test-token:${email}`;
  }

  function confirmEmail(email) {
    const user = [...authUsers.values()].find(item => item.email === email.toLowerCase());
    if (!user) throw new Error(`Auth user not found for ${email}`);
    user.email_confirmed_at = '2026-06-20T12:30:00Z';
  }

  function hasAuthUser(email) {
    return [...authUsers.values()].some(user => user.email === email.toLowerCase());
  }

  async function cleanup() {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await app.locals.closeDatabase();
    if (ownsDirectory) await rm(directory, { recursive: true, force: true });
  }

  return { request, requestUnauthenticated, loginAs, confirmEmail, hasAuthUser, cleanup };
}

test('HTTP API enforces authentication and leader authorization', async t => {
  const fixture = await createHttpFixture();
  t.after(fixture.cleanup);

  const unauthenticated = await fixture.requestUnauthenticated('GET', '/api/volunteers');
  assert.equal(unauthenticated.status, 401);

  const legacyLogin = await fixture.requestUnauthenticated('POST', '/api/auth/login', {
    email: 'leader@test.local',
    password: 'leader-password'
  });
  assert.equal(legacyLogin.status, 404);

  const volunteer = await fixture.request('POST', '/api/volunteers', { name: 'Voluntário com conta', email: 'volunteer@test.local' });
  const account = await fixture.request('POST', '/api/admin/users', {
    name: 'Voluntário com conta',
    email: 'volunteer@test.local',
    password: 'volunteer-password',
    role: 'VOLUNTEER',
    volunteerId: volunteer.body.id
  });
  assert.equal(account.status, 201);
  assert.equal(account.body.user.role, 'VOLUNTEER');

  await fixture.loginAs('volunteer@test.local');
  const forbidden = await fixture.request('GET', '/api/volunteers');
  assert.equal(forbidden.status, 403);

  const me = await fixture.request('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.volunteerId, volunteer.body.id);

});

test('public registration requires email confirmation and leader approval before portal access', async t => {
  const fixture = await createHttpFixture();
  t.after(fixture.cleanup);

  const invalidPhone = await fixture.requestUnauthenticated('POST', '/api/auth/register', {
    name: 'Nova Voluntária',
    email: 'nova@test.local',
    phone: '1234',
    password: 'senha-segura'
  });
  assert.equal(invalidPhone.status, 400);

  const created = await fixture.requestUnauthenticated('POST', '/api/auth/register', {
    name: 'Nova Voluntária',
    email: 'nova@test.local',
    phone: '(31) 99999-1234',
    password: 'senha-segura'
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.registration.status, 'AWAITING_EMAIL_CONFIRMATION');

  const beforeConfirmation = await fixture.request('GET', '/api/admin/registrations');
  assert.equal(beforeConfirmation.status, 200);
  assert.equal(beforeConfirmation.body.registrations.length, 0);

  fixture.confirmEmail('nova@test.local');
  await fixture.loginAs('nova@test.local');
  const pendingLogin = await fixture.request('GET', '/api/auth/me');
  assert.equal(pendingLogin.status, 403);
  assert.equal(pendingLogin.body.code, 'AUTH_APPROVAL_PENDING');

  await fixture.loginAs('leader@test.local');
  const pending = await fixture.request('GET', '/api/admin/registrations');
  assert.equal(pending.status, 200);
  assert.equal(pending.body.registrations.length, 1);
  assert.equal(pending.body.registrations[0].phone, '+5531999991234');
  const registrationId = pending.body.registrations[0].id;

  const immutableEmail = await fixture.request('PATCH', `/api/admin/registrations/${registrationId}`, {
    email: 'outro@test.local'
  });
  assert.equal(immutableEmail.status, 422);

  const updated = await fixture.request('PATCH', `/api/admin/registrations/${registrationId}`, {
    name: 'Voluntária Aprovada',
    phone: '(31) 98888-4321'
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.registration.name, 'Voluntária Aprovada');
  assert.equal(updated.body.registration.phone, '+5531988884321');

  const approved = await fixture.request('POST', `/api/admin/registrations/${registrationId}/approve`);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.user.active, true);
  assert.equal(approved.body.user.approvalStatus, 'APPROVED');
  assert.equal(approved.body.volunteer.active, true);
  assert.deepEqual(approved.body.volunteer.proficiencies, {});

  await fixture.loginAs('nova@test.local');
  const me = await fixture.request('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'VOLUNTEER');
  assert.equal(me.body.user.name, 'Voluntária Aprovada');
});

test('rejecting a pending registration deletes Auth and local records and frees the email', async t => {
  const fixture = await createHttpFixture();
  t.after(fixture.cleanup);

  const registrationInput = {
    name: 'Cadastro Rejeitado',
    email: 'rejeitado@test.local',
    phone: '(11) 99999-1111',
    password: 'senha-segura'
  };
  assert.equal((await fixture.requestUnauthenticated('POST', '/api/auth/register', registrationInput)).status, 201);
  fixture.confirmEmail(registrationInput.email);

  const pending = await fixture.request('GET', '/api/admin/registrations');
  assert.equal(pending.body.registrations.length, 1);
  const rejected = await fixture.request('DELETE', `/api/admin/registrations/${pending.body.registrations[0].id}`);
  assert.equal(rejected.status, 204);
  assert.equal(fixture.hasAuthUser(registrationInput.email), false);

  const volunteers = await fixture.request('GET', '/api/volunteers');
  assert.equal(volunteers.body.some(volunteer => volunteer.email === registrationInput.email), false);
  assert.equal((await fixture.requestUnauthenticated('POST', '/api/auth/register', registrationInput)).status, 201);
});

test('volunteer API isolates personal data and applies an accepted exchange as a new publication version', async t => {
  const fixture = await createHttpFixture();
  t.after(fixture.cleanup);

  const requester = await fixture.request('POST', '/api/volunteers', {
    name: 'Solicitante',
    email: 'requester@test.local',
    proficiencies: { VMIX: 2 }
  });
  const target = await fixture.request('POST', '/api/volunteers', {
    name: 'Substituto',
    email: 'target@test.local',
    proficiencies: { VMIX: 2 }
  });
  await fixture.request('POST', '/api/admin/users', {
    name: 'Solicitante', email: 'requester@test.local', password: 'requester-password',
    role: 'VOLUNTEER', volunteerId: requester.body.id
  });
  await fixture.request('POST', '/api/admin/users', {
    name: 'Substituto', email: 'target@test.local', password: 'target-password',
    role: 'VOLUNTEER', volunteerId: target.body.id
  });

  const generated = await fixture.request('POST', '/api/schedule/generate', { year: 2026, month: 7 });
  assert.equal(generated.status, 200);
  const scheduleId = generated.body.schedule.id;
  const saved = await fixture.request('PUT', `/api/schedule/${scheduleId}`, {
    assignments: [{ date: '2026-07-05', shift: 'MORNING', role: 'VMIX', volunteerId: requester.body.id }],
    lockedSlots: []
  });
  assert.equal(saved.status, 200);
  const published = await fixture.request('POST', `/api/schedule/${scheduleId}/publish`, {
    confirmedWarnings: true
  });
  assert.equal(published.status, 200);
  const assignmentId = published.body.assignments.find(item => item.volunteer_id === requester.body.id && item.role === 'VMIX').id;

  await fixture.loginAs('requester@test.local');
  const personalSchedule = await fixture.request('GET', '/api/me/schedule?year=2026&month=7');
  assert.equal(personalSchedule.status, 200);
  assert.equal(personalSchedule.body.assignments.length, 1);
  const createdUnavailability = await fixture.request('POST', '/api/me/unavailabilities', {
    volunteerId: target.body.id,
    date: '2026-07-12',
    shift: 'ALL',
    reason: 'Viagem'
  });
  assert.equal(createdUnavailability.status, 201);
  assert.equal(createdUnavailability.body.volunteer_id, requester.body.id);

  const exchange = await fixture.request('POST', '/api/exchanges', {
    assignmentId,
    targetVolunteerId: target.body.id,
    reason: 'Imprevisto'
  });
  assert.equal(exchange.status, 201);
  const exchangeId = exchange.body.exchange.id;

  await fixture.loginAs('target@test.local');
  const targetNotifications = await fixture.request('GET', '/api/me/notifications');
  assert.equal(targetNotifications.status, 200);
  assert.equal(targetNotifications.body.notifications[0].type, 'EXCHANGE_REQUESTED');
  const pending = await fixture.request('GET', '/api/me/exchanges');
  assert.equal(pending.status, 200);
  assert.equal(pending.body.exchanges[0].status, 'PENDING');
  const accepted = await fixture.request('POST', `/api/exchanges/${exchangeId}/accept`);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.exchange.status, 'ACCEPTED');

  const targetSchedule = await fixture.request('GET', '/api/me/schedule?year=2026&month=7');
  assert.equal(targetSchedule.body.assignments.length, 1);
  assert.equal(targetSchedule.body.assignments[0].volunteer_id, target.body.id);

  await fixture.loginAs('leader@test.local');
  const adminExchanges = await fixture.request('GET', '/api/admin/exchanges');
  assert.equal(adminExchanges.status, 200);
  assert.equal(adminExchanges.body.exchanges[0].status, 'ACCEPTED');
  const versions = await fixture.request('GET', `/api/schedule/${scheduleId}/versions`);
  assert.equal(versions.status, 200);
  assert.equal(versions.body.length, 2);
  assert.equal(versions.body[0].assignments[0].volunteer_id, requester.body.id);
  assert.equal(versions.body[1].assignments[0].volunteer_id, target.body.id);

  await fixture.loginAs('requester@test.local');
  const requesterNotifications = await fixture.request('GET', '/api/me/notifications');
  assert.equal(requesterNotifications.body.notifications[0].type, 'EXCHANGE_ACCEPTED');
});

test('HTTP API preserves administrative data after a server restart', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'media-scheduler-restart-'));
  const databasePath = path.join(directory, 'persistent.sqlite');
  t.after(() => rm(directory, { recursive: true, force: true }));

  const firstServer = await createHttpFixture({ databasePath });
  const created = await firstServer.request('POST', '/api/volunteers', {
    name: 'Persistente',
    proficiencies: { VMIX: 2 }
  });
  assert.equal(created.status, 201);
  await firstServer.cleanup();

  const restartedServer = await createHttpFixture({ databasePath });
  t.after(restartedServer.cleanup);
  const volunteers = await restartedServer.request('GET', '/api/volunteers');
  assert.equal(volunteers.status, 200);
  assert.equal(volunteers.body.length, 1);
  assert.equal(volunteers.body[0].name, 'Persistente');
  assert.deepEqual(volunteers.body[0].proficiencies, { VMIX: 2 });
});

test('HTTP API updates and archives a volunteer without deleting its history', async t => {
  const fixture = await createHttpFixture();
  t.after(fixture.cleanup);

  const created = await fixture.request('POST', '/api/volunteers', {
    name: 'Ana Teste',
    email: 'ana@example.com',
    phone: '31999999999',
    allowedShift: 'MORNING',
    proficiencies: { VMIX: 2 }
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.name, 'Ana Teste');
  assert.equal(created.body.allowedShift, 'MORNING');
  assert.deepEqual(created.body.proficiencies, { VMIX: 2 });

  const updated = await fixture.request('PUT', `/api/volunteers/${created.body.id}`, {
    name: 'Ana Atualizada',
    allowedShift: 'ALL'
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.name, 'Ana Atualizada');
  assert.equal(updated.body.allowedShift, 'ALL');

  const archived = await fixture.request('DELETE', `/api/volunteers/${created.body.id}`);
  assert.equal(archived.status, 200);
  assert.equal(archived.body.active, false);

  const allVolunteers = await fixture.request('GET', '/api/volunteers');
  assert.equal(allVolunteers.status, 200);
  assert.equal(allVolunteers.body.length, 1);
  assert.equal(allVolunteers.body[0].active, false);

  const activeVolunteers = await fixture.request('GET', '/api/volunteers?active=true');
  assert.equal(activeVolunteers.status, 200);
  assert.deepEqual(activeVolunteers.body, []);
});

test('HTTP API replaces and removes proficiencies through volunteer resources', async t => {
  const fixture = await createHttpFixture();
  t.after(fixture.cleanup);

  const created = await fixture.request('POST', '/api/volunteers', {
    name: 'Bruno Teste',
    proficiencies: { VMIX: 2 }
  });

  const replaced = await fixture.request('PUT', `/api/volunteers/${created.body.id}/proficiencies`, {
    proficiencies: { JIB: 3 }
  });
  assert.equal(replaced.status, 200);
  assert.deepEqual(replaced.body, { JIB: 3 });

  const removed = await fixture.request('DELETE', `/api/volunteers/${created.body.id}/proficiencies/JIB`);
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.body, {});

  const invalid = await fixture.request('PUT', `/api/volunteers/${created.body.id}/proficiencies`, {
    proficiencies: { INVALID_ROLE: 2 }
  });
  assert.equal(invalid.status, 400);
});

test('HTTP API accepts an unavailability through day 25 and rejects it afterwards', async t => {
  let currentTime = new Date('2026-06-25T23:59:59Z');
  const fixture = await createHttpFixture({ now: () => currentTime });
  t.after(fixture.cleanup);

  const volunteer = await fixture.request('POST', '/api/volunteers', { name: 'Carla Teste' });
  const accepted = await fixture.request('POST', '/api/unavailabilities', {
    volunteerId: volunteer.body.id,
    date: '2026-07-05',
    shift: 'ALL',
    reason: 'Viagem'
  });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.reason, 'Viagem');

  const updated = await fixture.request('PATCH', `/api/unavailabilities/${accepted.body.id}`, {
    reason: 'Viagem confirmada'
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.reason, 'Viagem confirmada');

  currentTime = new Date('2026-06-26T03:00:00Z');
  const rejected = await fixture.request('POST', '/api/unavailabilities', {
    volunteerId: volunteer.body.id,
    date: '2026-07-12',
    shift: 'NIGHT'
  });
  assert.equal(rejected.status, 422);
  assert.equal(rejected.body.code, 'UNAVAILABILITY_CUTOFF_PASSED');
  assert.equal(rejected.body.details.cutoffDate, '2026-06-25');

  const listed = await fixture.request('GET', `/api/unavailabilities?volunteerId=${volunteer.body.id}&year=2026&month=7`);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 1);
  assert.equal(listed.body[0].reason, 'Viagem confirmada');
});

test('HTTP API persists a draft and preserves immutable publication versions', async t => {
  const fixture = await createHttpFixture();
  t.after(fixture.cleanup);

  const mentor = await fixture.request('POST', '/api/volunteers', {
    name: 'Mentora N3',
    proficiencies: { VMIX: 3 }
  });
  const trainee = await fixture.request('POST', '/api/volunteers', {
    name: 'Treinando N1',
    proficiencies: { VMIX: 1 }
  });

  const generated = await fixture.request('POST', '/api/schedule/generate', {
    year: 2026,
    month: 7
  });
  assert.equal(generated.status, 200);
  assert.ok(generated.body.schedule.id);
  assert.equal(generated.body.schedule.status, 'DRAFT');
  assert.ok(generated.body.warnings.length > 0);

  const scheduleId = generated.body.schedule.id;
  const invalid = await fixture.request('PUT', `/api/schedule/${scheduleId}`, {
    assignments: [{
      date: '2026-07-05',
      shift: 'MORNING',
      role: 'VMIX',
      volunteerId: trainee.body.id,
      isTrainee: false
    }],
    lockedSlots: []
  });
  assert.equal(invalid.status, 422);
  assert.equal(invalid.body.code, 'INVALID_ASSIGNMENTS');

  const saved = await fixture.request('PUT', `/api/schedule/${scheduleId}`, {
    assignments: [
      {
        date: '2026-07-05',
        shift: 'MORNING',
        role: 'VMIX',
        volunteerId: mentor.body.id,
        isTrainee: false
      },
      {
        date: '2026-07-05',
        shift: 'MORNING',
        role: 'VMIX',
        volunteerId: trainee.body.id,
        isTrainee: true
      }
    ],
    lockedSlots: ['2026-07-05:MORNING:VMIX'],
    warnings: ['47 vagas sem cobertura']
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.lockedSlots, ['2026-07-05:MORNING:VMIX']);
  assert.equal(saved.body.assignments.length, 2);

  const unconfirmed = await fixture.request('POST', `/api/schedule/${scheduleId}/publish`, {
    warnings: ['47 vagas sem cobertura'],
    confirmedWarnings: false
  });
  assert.equal(unconfirmed.status, 422);
  assert.equal(unconfirmed.body.code, 'WARNINGS_REQUIRE_CONFIRMATION');

  await fixture.request('PUT', `/api/volunteers/${mentor.body.id}`, { active: false });
  const invalidPublication = await fixture.request('POST', `/api/schedule/${scheduleId}/publish`, {
    warnings: ['47 vagas sem cobertura'],
    confirmedWarnings: true
  });
  assert.equal(invalidPublication.status, 422);
  assert.equal(invalidPublication.body.code, 'INVALID_ASSIGNMENTS');
  await fixture.request('PUT', `/api/volunteers/${mentor.body.id}`, { active: true });

  const published = await fixture.request('POST', `/api/schedule/${scheduleId}/publish`, {
    warnings: ['47 vagas sem cobertura'],
    confirmedWarnings: true
  });
  assert.equal(published.status, 200);
  assert.equal(published.body.status, 'PUBLISHED');
  assert.equal(published.body.publishedVersion, 1);

  const blockedEdit = await fixture.request('PUT', `/api/schedule/${scheduleId}`, {
    assignments: [],
    lockedSlots: []
  });
  assert.equal(blockedEdit.status, 409);

  const reopened = await fixture.request('POST', `/api/schedule/${scheduleId}/reopen`);
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.status, 'DRAFT');

  const renamedMentor = await fixture.request('PUT', `/api/volunteers/${mentor.body.id}`, {
    name: 'Mentora N3 Renomeada'
  });
  assert.equal(renamedMentor.status, 200);

  const republished = await fixture.request('POST', `/api/schedule/${scheduleId}/publish`, {
    warnings: ['47 vagas sem cobertura'],
    confirmedWarnings: true
  });
  assert.equal(republished.status, 200);
  assert.equal(republished.body.publishedVersion, 2);

  const versions = await fixture.request('GET', `/api/schedule/${scheduleId}/versions`);
  assert.equal(versions.status, 200);
  assert.equal(versions.body.length, 2);
  assert.equal(versions.body[0].version, 1);
  assert.equal(versions.body[1].version, 2);
  assert.equal(versions.body[0].assignments.length, 2);
  assert.equal(versions.body[0].assignments[0].volunteer_name, 'Mentora N3');
  assert.equal(versions.body[1].assignments[0].volunteer_name, 'Mentora N3 Renomeada');
});

test('HTTP API validates Supabase access tokens before resolving the local profile', async t => {
  const fixture = await createHttpFixture({
    supabaseAuthClient: {
      auth: {
        async getUser(token) {
          assert.equal(token, 'test-supabase-token');
          return {
            data: { user: { id: 'supabase-user-id', email: 'leader@test.local' } },
            error: null
          };
        }
      }
    }
  });
  t.after(fixture.cleanup);

  const me = await fixture.request('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'leader@test.local');

  const missingToken = await fixture.requestUnauthenticated('GET', '/api/auth/me');
  assert.equal(missingToken.status, 401);
  assert.equal(missingToken.body.code, 'AUTH_REQUIRED');
});
