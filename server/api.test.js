import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createApp } from './index.js';

async function createHttpFixture(options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'media-scheduler-api-'));
  const app = createApp({
    dbPath: path.join(directory, 'test.sqlite'),
    now: () => new Date('2026-06-20T12:00:00Z'),
    ...options
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  async function request(method, pathname, body) {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = response.status === 204 ? null : await response.json();
    return { status: response.status, body: payload };
  }

  async function cleanup() {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    app.locals.closeDatabase();
    await rm(directory, { recursive: true, force: true });
  }

  return { request, cleanup };
}

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
