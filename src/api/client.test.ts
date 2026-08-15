// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiClient } from './client.js';

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('carrega e normaliza os dados administrativos do mês', async () => {
  const calls = [];
  const client = createApiClient({
    baseUrl: '/api',
    fetchImpl: async (url) => {
      calls.push(url);
      if (url === '/api/volunteers') {
        return jsonResponse([{
          id: 7,
          name: 'Lia',
          allowed_shift: 'NIGHT',
          active: 1,
          proficiencies: { VMIX: 3 }
        }]);
      }
      if (url === '/api/unavailabilities?year=2026&month=8') {
        return jsonResponse([{
          id: 2,
          volunteer_id: 7,
          date: '2026-08-09',
          shift: 'NIGHT'
        }]);
      }
      if (url === '/api/schedule/12/versions') {
        return jsonResponse([{
          version: 1,
          published_at: '2026-07-26 12:00:00',
          warnings: ['Uma vaga descoberta'],
          assignments: [{
            volunteer_id: 7,
            volunteer_name: 'Lia no momento da publicação',
            date: '2026-08-09',
            shift: 'NIGHT',
            role: 'VMIX',
            is_trainee: 0
          }]
        }]);
      }
      return jsonResponse({
        id: 12,
        status: 'PUBLISHED',
        warnings: ['Uma vaga descoberta'],
        locked_slots: ['2026-08-09:NIGHT:VMIX'],
        assignments: [{
          volunteer_id: 7,
          date: '2026-08-09',
          shift: 'NIGHT',
          role: 'VMIX',
          is_trainee: 0
        }]
      });
    }
  });

  const data = await client.loadMonth(2026, 8);

  assert.deepEqual(calls, [
    '/api/volunteers',
    '/api/unavailabilities?year=2026&month=8',
    '/api/schedule?year=2026&month=8',
    '/api/schedule/12/versions'
  ]);
  assert.equal(data.volunteers[0].id, '7');
  assert.equal(data.volunteers[0].allowedShift, 'NIGHT');
  assert.equal(data.unavailabilities[0].volunteerId, '7');
  assert.equal(data.schedule.status, 'published');
  assert.deepEqual(data.schedule.lockedSlots, ['2026-08-09:NIGHT:VMIX']);
  assert.deepEqual(data.schedule.matrix['2026-08-09'].NIGHT.VMIX, {
    main: '7',
    trainee: ''
  });
  assert.equal(data.versions[0].version, 1);
  assert.equal(data.versions[0].matrix['2026-08-09'].NIGHT.VMIX.main, '7');
  assert.equal(data.versions[0].volunteerNames['7'].name, 'Lia no momento da publicação');
});

test('persiste a matriz como alocações e as vagas travadas', async () => {
  let request;
  const client = createApiClient({
    fetchImpl: async (url, init) => {
      request = { url, init };
      return jsonResponse({ id: 12, status: 'DRAFT', assignments: [] });
    }
  });

  await client.saveSchedule(12, {
    year: 2026,
    month: 8,
    matrix: {
      '2026-08-09': {
        NIGHT: {
          VMIX: { main: '7', trainee: '9' }
        }
      }
    },
    lockedSlots: ['2026-08-09:NIGHT:VMIX']
  });

  assert.equal(request.url, '/api/schedule/12');
  assert.equal(request.init.method, 'PUT');
  assert.deepEqual(JSON.parse(request.init.body), {
    year: 2026,
    month: 8,
    assignments: [
      { date: '2026-08-09', shift: 'NIGHT', role: 'VMIX', volunteerId: '7', isTrainee: false },
      { date: '2026-08-09', shift: 'NIGHT', role: 'VMIX', volunteerId: '9', isTrainee: true }
    ],
    lockedSlots: ['2026-08-09:NIGHT:VMIX']
  });
});

test('usa o endpoint legado de proficiências somente quando o convencional não existe', async () => {
  const calls = [];
  const client = createApiClient({
    fetchImpl: async (url, init) => {
      calls.push([url, init.method]);
      if (url.endsWith('/proficiencies')) return jsonResponse({ error: 'Not found' }, { status: 404 });
      return jsonResponse({ VMIX: 2 });
    }
  });

  const proficiencies = await client.updateProficiencies('7', { VMIX: 2 });

  assert.deepEqual(calls, [
    ['/api/volunteers/7/proficiencies', 'PUT'],
    ['/api/volunteers/7/proficiency', 'POST']
  ]);
  assert.deepEqual(proficiencies, { VMIX: 2 });
});

test('expõe a mensagem retornada pela API em falhas', async () => {
  const client = createApiClient({
    fetchImpl: async () => jsonResponse({ error: 'Data de corte encerrada' }, { status: 400 })
  });

  await assert.rejects(
    () => client.createUnavailability({ volunteerId: '7', date: '2026-08-09', shift: 'NIGHT' }),
    /Data de corte encerrada/
  );
});

test('expõe os recursos do portal sem depender de cookies locais', async () => {
  const calls = [];
  const client = createApiClient({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url === '/api/me/schedule?year=2026&month=8') return jsonResponse({ assignments: [{ id: 4, volunteer_id: 7, date: '2026-08-09', shift: 'NIGHT', role: 'VMIX' }] });
      if (url === '/api/me/exchanges') return jsonResponse({ exchanges: [{ id: 9, requester_id: 7, target_volunteer_id: 8, status: 'PENDING' }] });
      if (url === '/api/me/notifications') return jsonResponse({ notifications: [{ id: 2, message: 'Nova troca' }] });
      if (url === '/api/exchanges/9/accept') return jsonResponse({ exchange: { id: 9, status: 'ACCEPTED' } });
      return jsonResponse({ volunteers: [{ id: 8, name: 'Substituto' }] });
    }
  });

  const schedule = await client.getMySchedule(2026, 8);
  const exchanges = await client.getMyExchanges();
  const notifications = await client.getMyNotifications();
  const accepted = await client.acceptExchange(9);

  assert.equal(schedule[0].volunteerId, '7');
  assert.equal(exchanges[0].targetVolunteerId, '8');
  assert.equal(notifications[0].message, 'Nova troca');
  assert.equal(accepted.status, 'ACCEPTED');
  assert.ok(calls.every(call => call.init.credentials === undefined));
});

test('normaliza flags booleanas serializadas como strings', async () => {
  const client = createApiClient({
    fetchImpl: async (url) => {
      if (url === '/api/volunteers') return jsonResponse([{ id: 1, name: 'Inativa', active: '0' }]);
      if (url.startsWith('/api/me/schedule')) return jsonResponse({ assignments: [{ id: 2, volunteer_id: 1, is_trainee: '0' }] });
      return jsonResponse({});
    }
  });

  const volunteers = await client.getVolunteers();
  const schedule = await client.getMySchedule(2026, 8);
  assert.equal(volunteers[0].active, false);
  assert.equal(schedule[0].isTrainee, false);
});

test('usa a sessão Supabase para autenticar o login e proteger as chamadas da API', async () => {
  const authEvents = [];
  const session = { access_token: 'supabase-access-token' };
  const authClient = {
    auth: {
      async getSession() {
        return { data: { session }, error: null };
      },
      async signInWithPassword(credentials) {
        authEvents.push(['signInWithPassword', credentials]);
        return { data: { session }, error: null };
      },
      onAuthStateChange(callback) {
        authEvents.push(['onAuthStateChange', callback]);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signOut() {
        authEvents.push(['signOut']);
        return { error: null };
      }
    }
  };
  const calls = [];
  const client = createApiClient({
    authClient,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ user: { id: 1, role: 'LEADER' } });
    }
  });

  const user = await client.login('leader@example.com', 'password');
  await client.getVolunteers();
  await client.logout();
  client.subscribeToAuthState(() => {});

  assert.deepEqual(user, { id: 1, role: 'LEADER' });
  assert.deepEqual(authEvents[0], ['signInWithPassword', {
    email: 'leader@example.com',
    password: 'password'
  }]);
  assert.ok(calls.every(call => call.init.headers.get('Authorization') === 'Bearer supabase-access-token'));
  assert.ok(authEvents.some(([event]) => event === 'signOut'));
  assert.ok(authEvents.some(([event]) => event === 'onAuthStateChange'));
});

test('não oferece fallback de login quando o Supabase não está configurado', async () => {
  const client = createApiClient({ fetchImpl: async () => jsonResponse({}) });

  await assert.rejects(
    () => client.login('leader@example.com', 'password'),
    error => error.status === 503 && /Supabase Auth/.test(error.message)
  );
});

test('envia o cadastro público sem token e preserva o código de e-mail duplicado', async () => {
  let captured;
  const authClient = {
    auth: {
      async getSession() {
        throw new Error('O cadastro público não deve consultar a sessão.');
      }
    }
  };
  const client = createApiClient({
    authClient,
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return jsonResponse({
        error: 'Este e-mail já possui cadastro.',
        code: 'EMAIL_ALREADY_REGISTERED'
      }, { status: 409 });
    }
  });

  await assert.rejects(
    () => client.register({ name: 'Lia', email: 'lia@example.com', phone: '(11) 99999-0000', password: 'password' }),
    error => error.status === 409 && error.payload.code === 'EMAIL_ALREADY_REGISTERED'
  );
  assert.equal(captured.url, '/api/auth/register');
  assert.equal(captured.init.headers.has('Authorization'), false);
});

test('responde à confirmação pública e solicita permuta sem consultar a sessão', async () => {
  const calls = [];
  const authClient = {
    auth: {
      async getSession() {
        throw new Error('A confirmação pública não deve consultar a sessão.');
      }
    }
  };
  const client = createApiClient({
    authClient,
    fetchImpl: async (url, init) => {
      calls.push([url, init.method, init.body ? JSON.parse(init.body) : null]);
      if (init.method === 'GET') return jsonResponse({
        confirmation: { id: 4, status: 'AWAITING', shift: 'MORNING' },
        candidates: [{ assignmentId: 9, volunteerName: 'Bia' }]
      });
      if (url.endsWith('/confirm')) return jsonResponse({ confirmation: { id: 4, status: 'CONFIRMED' } });
      return jsonResponse({ exchange: { id: 8, status: 'PENDING', target_assignment_id: 9 } }, { status: 201 });
    }
  });

  const details = await client.getServiceConfirmation('signed-token');
  const confirmed = await client.confirmService('signed-token');
  const exchange = await client.requestServiceExchange('signed-token', {
    targetAssignmentId: 9,
    reason: 'Viagem'
  });

  assert.equal(details.candidates[0].assignmentId, '9');
  assert.equal(confirmed.status, 'CONFIRMED');
  assert.equal(exchange.targetAssignmentId, '9');
  assert.deepEqual(calls, [
    ['/api/service-confirmations/signed-token', 'GET', null],
    ['/api/service-confirmations/signed-token/confirm', 'POST', null],
    ['/api/service-confirmations/signed-token/exchange', 'POST', { targetAssignmentId: 9, reason: 'Viagem' }]
  ]);
});

test('expõe a fila administrativa e suas ações', async () => {
  const calls = [];
  const client = createApiClient({
    fetchImpl: async (url, init) => {
      calls.push([url, init.method]);
      if (url === '/api/admin/registrations') return jsonResponse({ registrations: [{ id: 4, volunteerId: 8, name: 'Lia' }] });
      if (init.method === 'PATCH') return jsonResponse({ registration: { id: 4, volunteerId: 8, name: 'Lia Editada' } });
      if (url.endsWith('/approve')) return jsonResponse({ user: { id: 4 }, volunteer: { id: 8, name: 'Lia', active: 1 } });
      return new Response(null, { status: 204 });
    }
  });

  const pending = await client.getPendingRegistrations();
  const updated = await client.updatePendingRegistration('4', { name: 'Lia Editada' });
  const approved = await client.approvePendingRegistration('4');
  await client.rejectPendingRegistration('4');

  assert.equal(pending[0].id, '4');
  assert.equal(updated.name, 'Lia Editada');
  assert.equal(approved.volunteer.id, '8');
  assert.deepEqual(calls, [
    ['/api/admin/registrations', 'GET'],
    ['/api/admin/registrations/4', 'PATCH'],
    ['/api/admin/registrations/4/approve', 'POST'],
    ['/api/admin/registrations/4', 'DELETE']
  ]);
});

test('usa o Supabase Auth para solicitar e concluir a recuperação de senha', async () => {
  const calls = [];
  const authClient = {
    auth: {
      async resetPasswordForEmail(email, options) {
        calls.push(['reset', email, options]);
        return { error: null };
      },
      async updateUser(attributes) {
        calls.push(['update', attributes]);
        return { error: null };
      }
    }
  };
  const client = createApiClient({ authClient, fetchImpl: async () => jsonResponse({}) });

  await client.requestPasswordReset('lia@example.com');
  await client.updatePassword('nova-senha');

  assert.deepEqual(calls, [
    ['reset', 'lia@example.com', undefined],
    ['update', { password: 'nova-senha' }]
  ]);
});
