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
