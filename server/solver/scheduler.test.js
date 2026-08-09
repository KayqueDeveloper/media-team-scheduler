/**
 * Church Broadcast Scheduling System - Automated Unit Test Suite
 * File: server/solver/scheduler.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSchedule,
  getSundaysInMonth,
  getPreviousSundayDate,
  DEFAULT_ROLES,
  DEFAULT_SHIFTS
} from './scheduler.js';

/**
 * Helper to generate mock volunteers and proficiencies.
 */
function createMockVolunteers(count = 30) {
  const volunteers = [];
  const proficiencies = [];

  for (let i = 1; i <= count; i++) {
    const id = `v${i}`;
    volunteers.push({ id, name: `Volunteer ${i}` });

    // Keep enough qualified principals for complete schedules while retaining N1 trainees.
    DEFAULT_ROLES.forEach((role, rIndex) => {
      let level = 2;
      if (i % 5 === 0) level = 1;
      if (i % 7 === 0) level = 3;
      proficiencies.push({ volunteerId: id, role, level });
    });
  }

  return { volunteers, proficiencies };
}

describe('Scheduler Utility Functions', () => {
  test('getSundaysInMonth returns correct Sundays for 4-Sunday month (Sept 2026)', () => {
    const sundays = getSundaysInMonth(2026, 9);
    assert.deepEqual(sundays, [
      '2026-09-06',
      '2026-09-13',
      '2026-09-20',
      '2026-09-27'
    ]);
    assert.equal(sundays.length, 4);
  });

  test('getSundaysInMonth returns correct Sundays for 5-Sunday month (Aug 2026)', () => {
    const sundays = getSundaysInMonth(2026, 8);
    assert.deepEqual(sundays, [
      '2026-08-02',
      '2026-08-09',
      '2026-08-16',
      '2026-08-23',
      '2026-08-30'
    ]);
    assert.equal(sundays.length, 5);
  });

  test('getPreviousSundayDate returns date exactly 7 days prior', () => {
    const prevSunday = getPreviousSundayDate('2026-08-02');
    assert.equal(prevSunday, '2026-07-26');
  });
});

describe('Scheduler Constraint Engine - 4 vs 5 Sundays', () => {
  test('Generates complete schedule for 4-Sunday month (Sept 2026 - 48 slots)', () => {
    const { volunteers, proficiencies } = createMockVolunteers(30);
    const result = generateSchedule({
      year: 2026,
      month: 9,
      volunteers,
      proficiencies
    });

    assert.equal(result.success, true);
    assert.equal(result.metrics.sundaysCount, 4);
    assert.equal(result.metrics.totalSlots, 48);
    assert.equal(result.schedule.length, 48);
  });

  test('Generates complete schedule for 5-Sunday month (Aug 2026 - 60 slots)', () => {
    const { volunteers, proficiencies } = createMockVolunteers(35);
    const result = generateSchedule({
      year: 2026,
      month: 8,
      volunteers,
      proficiencies
    });

    assert.equal(result.success, true);
    assert.equal(result.metrics.sundaysCount, 5);
    assert.equal(result.metrics.totalSlots, 60);
    assert.equal(result.schedule.length, 60);
  });
});

describe('Hard Constraints Enforcement', () => {
  test('assigns only N2 or N3 volunteers as principals in every function', () => {
    const volunteers = [
      { id: 'a-n1', name: 'N1 Freehand' },
      { id: 'b-freehand', name: 'N2 Freehand' },
      { id: 'c-freehand', name: 'N2 Freehand 2' },
      { id: 'd-vmix', name: 'N2 vMix' },
      { id: 'e-vmix', name: 'N2 vMix 2' }
    ];
    const proficiencies = [
      { volunteerId: 'a-n1', role: 'FREEHAND', level: 1 },
      { volunteerId: 'b-freehand', role: 'FREEHAND', level: 2 },
      { volunteerId: 'c-freehand', role: 'FREEHAND', level: 2 },
      { volunteerId: 'd-vmix', role: 'VMIX', level: 2 },
      { volunteerId: 'e-vmix', role: 'VMIX', level: 2 }
    ];

    const result = generateSchedule({
      year: 2026,
      month: 9,
      volunteers,
      proficiencies,
      roles: ['FREEHAND', 'VMIX'],
      shifts: ['MORNING']
    });

    assert.equal(result.success, true);
    assert.ok(result.schedule.length > 0);
    result.schedule.forEach(assignment => {
      assert.ok(assignment.proficiencyLevel >= 2);
    });
  });

  test('Enforces 1 volunteer per role per shift (6 roles x 2 shifts)', () => {
    const { volunteers, proficiencies } = createMockVolunteers(30);
    const result = generateSchedule({ year: 2026, month: 8, volunteers, proficiencies });

    assert.equal(result.success, true);
    const sundays = getSundaysInMonth(2026, 8);

    sundays.forEach(date => {
      DEFAULT_SHIFTS.forEach(shift => {
        const shiftSlots = result.schedule.filter(s => s.date === date && s.shift === shift);
        assert.equal(shiftSlots.length, 6);

        const assignedRoles = new Set(shiftSlots.map(s => s.role));
        assert.equal(assignedRoles.size, 6); // All 6 roles filled uniquely
      });
    });
  });

  test('Enforces Volunteer Proficiency >= 2 for every principal function (ADR 0010)', () => {
    const { volunteers, proficiencies } = createMockVolunteers(30);

    const result = generateSchedule({
      year: 2026,
      month: 8,
      volunteers,
      proficiencies
    });

    assert.equal(result.success, true);
    
    result.schedule.forEach(s => {
      assert.ok(s.proficiencyLevel >= 2, `${s.role} assigned to ${s.volunteerId} below N2`);
    });
  });

  test('Enforces Max 1 shift per Sunday per volunteer (ADR 0003)', () => {
    const { volunteers, proficiencies } = createMockVolunteers(30);
    const result = generateSchedule({ year: 2026, month: 8, volunteers, proficiencies });

    assert.equal(result.success, true);
    const byVolAndDate = new Map();

    result.schedule.forEach(s => {
      const key = `${s.volunteerId}:${s.date}`;
      byVolAndDate.set(key, (byVolAndDate.get(key) || 0) + 1);
    });

    for (const count of byVolAndDate.values()) {
      assert.ok(count <= 1, `Volunteer assigned ${count} times on the same date`);
    }
  });

  test('Enforces No 2 consecutive Sundays per volunteer (ADR 0003 / 1-week gap)', () => {
    const { volunteers, proficiencies } = createMockVolunteers(30);
    const result = generateSchedule({ year: 2026, month: 8, volunteers, proficiencies });

    assert.equal(result.success, true);

    volunteers.forEach(v => {
      const vAssignments = result.schedule.filter(s => s.volunteerId === v.id);
      const sundayIndices = vAssignments.map(s => s.sundayIndex).sort((a, b) => a - b);

      for (let i = 0; i < sundayIndices.length - 1; i++) {
        const gap = sundayIndices[i + 1] - sundayIndices[i];
        assert.ok(gap >= 2, `Volunteer ${v.id} assigned on consecutive Sundays (${sundayIndices[i]} and ${sundayIndices[i + 1]})`);
      }
    });
  });

  test('Enforces No 2 consecutive Sundays across previous month boundary', () => {
    const { volunteers, proficiencies } = createMockVolunteers(30);
    // Last Sunday of July 2026 is 2026-07-26
    const pastAssignments = [
      { volunteerId: 'v1', date: '2026-07-26', shift: 'morning', role: 'corte' }
    ];

    const result = generateSchedule({
      year: 2026,
      month: 8, // First Sunday of August is 2026-08-02
      volunteers,
      proficiencies,
      pastAssignments
    });

    assert.equal(result.success, true);
    // v1 must NOT be assigned on 2026-08-02 (Sunday index 0)
    const v1FirstSundayAssignments = result.schedule.filter(s => s.volunteerId === 'v1' && s.date === '2026-08-02');
    assert.equal(v1FirstSundayAssignments.length, 0);
  });

  test('Enforces Max 3 assignments in a five-Sunday month, using the third only when needed', () => {
    const { volunteers, proficiencies } = createMockVolunteers(30);
    const result = generateSchedule({ year: 2026, month: 8, volunteers, proficiencies });

    assert.equal(result.success, true);
    const counts = new Map();

    result.schedule.forEach(s => {
      counts.set(s.volunteerId, (counts.get(s.volunteerId) || 0) + 1);
    });

    for (const [vId, count] of counts.entries()) {
      assert.ok(count <= 3, `Volunteer ${vId} exceeded max 3 assignments (got ${count})`);
    }
    assert.equal(result.metrics.monthlyLimitUsed, 3);
  });

  test('Honors registered unavailabilities (ADR 0005)', () => {
    const { volunteers, proficiencies } = createMockVolunteers(30);
    const unavailabilities = [
      { volunteerId: 'v1', date: '2026-08-02', shift: 'morning' },
      { volunteerId: 'v2', date: '2026-08-09' } // Unavailable all day on Aug 9
    ];

    const result = generateSchedule({
      year: 2026,
      month: 8,
      volunteers,
      proficiencies,
      unavailabilities
    });

    assert.equal(result.success, true);

    const v1MorningAug2 = result.schedule.filter(s => s.volunteerId === 'v1' && s.date === '2026-08-02' && s.shift === 'morning');
    assert.equal(v1MorningAug2.length, 0);

    const v2Aug9 = result.schedule.filter(s => s.volunteerId === 'v2' && s.date === '2026-08-09');
    assert.equal(v2Aug9.length, 0);
  });

  test('Enforces allowedShift restriction (MORNING or NIGHT only)', () => {
    const { volunteers, proficiencies } = createMockVolunteers(30);
    // Lock v1 to MORNING only and v2 to NIGHT only
    volunteers[0].allowedShift = 'MORNING';
    volunteers[1].allowedShift = 'NIGHT';

    const result = generateSchedule({
      year: 2026,
      month: 8,
      volunteers,
      proficiencies
    });

    assert.equal(result.success, true);
    const v1NightAssignments = result.schedule.filter(s => s.volunteerId === 'v1' && s.shift === 'NIGHT');
    assert.equal(v1NightAssignments.length, 0, 'v1 should never be assigned to NIGHT shift');

    const v2MorningAssignments = result.schedule.filter(s => s.volunteerId === 'v2' && s.shift === 'MORNING');
    assert.equal(v2MorningAssignments.length, 0, 'v2 should never be assigned to MORNING shift');
  });
});

describe('Soft Constraints Enforcement', () => {
  test('Equity scoring prioritizes volunteers with fewer past assignments (ADR 0008)', () => {
    const { volunteers, proficiencies } = createMockVolunteers(30);
    // Give v1 5 past assignments and v2 0 past assignments
    const pastAssignments = [];
    for (let k = 1; k <= 5; k++) {
      pastAssignments.push({ volunteerId: 'v1', date: `2026-06-0${k}`, shift: 'morning', role: 'corte' });
    }

    const result = generateSchedule({
      year: 2026,
      month: 8,
      volunteers,
      proficiencies,
      pastAssignments
    });

    assert.equal(result.success, true);
    const v2Assignments = result.schedule.filter(s => s.volunteerId === 'v2');
    const v1Assignments = result.schedule.filter(s => s.volunteerId === 'v1');

    assert.ok(v2Assignments.length >= v1Assignments.length);
  });

  test('Seniority balance ensures at least one level-2 or level-3 volunteer per shift', () => {
    const { volunteers, proficiencies } = createMockVolunteers(30);
    const result = generateSchedule({ year: 2026, month: 8, volunteers, proficiencies });

    assert.equal(result.success, true);
    assert.equal(result.metrics.seniorityBalancedShifts, result.metrics.totalShifts);
  });
});

describe('Error Handling and Edge Cases', () => {
  test('returns the best partial schedule with vacancies and warnings when full coverage is impossible', () => {
    const volunteers = [{ id: 'only-n2', name: 'Only N2' }];
    const proficiencies = [
      { volunteerId: 'only-n2', role: 'FREEHAND', level: 2 }
    ];

    const result = generateSchedule({
      year: 2026,
      month: 9,
      volunteers,
      proficiencies,
      roles: ['FREEHAND'],
      shifts: ['MORNING']
    });

    assert.equal(result.success, true);
    assert.equal(result.schedule.length, 2);
    assert.equal(result.vacancies.length, 2);
    assert.equal(result.metrics.assignedSlots, 2);
    assert.equal(result.metrics.totalSlots, 4);
    assert.ok(result.warnings.length > 0);
  });

  test('Returns a partial success when volunteer pool is too small to cover slots', () => {
    const volunteers = [
      { id: 'v1', name: 'Vol 1' },
      { id: 'v2', name: 'Vol 2' }
    ];
    const proficiencies = [];
    volunteers.forEach(v => {
      DEFAULT_ROLES.forEach(r => proficiencies.push({ volunteerId: v.id, role: r, level: 2 }));
    });

    const result = generateSchedule({ year: 2026, month: 9, volunteers, proficiencies });
    assert.equal(result.success, true);
    assert.equal(result.complete, false);
    assert.ok(result.vacancies.length > 0);
  });

  test('Throws descriptive error if year or month missing', () => {
    assert.throws(() => generateSchedule({ month: 8 }), /Year and month are required/);
  });
});

describe('Trainee Scheduling Feature (N1 with N3 mentor)', () => {
  test('assigns an N1 trainee only beside an N3 principal in the same slot', () => {
    const volunteers = [
      { id: 'a-n2', name: 'N2 A' },
      { id: 'b-n2', name: 'N2 B' },
      { id: 'c-n3', name: 'N3 C' },
      { id: 'd-n3', name: 'N3 D' },
      { id: 'e-n1', name: 'N1 E' },
      { id: 'f-n1', name: 'N1 F' }
    ];
    const proficiencies = volunteers.map(volunteer => ({
      volunteerId: volunteer.id,
      role: 'FREEHAND',
      level: Number(volunteer.id.slice(3))
    }));

    const result = generateSchedule({
      year: 2026,
      month: 9,
      volunteers,
      proficiencies,
      roles: ['FREEHAND'],
      shifts: ['MORNING']
    });

    assert.ok(result.trainees.length > 0);
    result.trainees.forEach(trainee => {
      const principal = result.schedule.find(assignment =>
        assignment.date === trainee.date &&
        assignment.shift === trainee.shift &&
        assignment.role === trainee.role
      );
      assert.equal(principal.proficiencyLevel, 3);
      assert.equal(trainee.proficiencyLevel, 1);
      assert.equal(trainee.trainerId, principal.volunteerId);
    });
  });

  test('Assigns N1 trainees ONLY when the principal volunteer is N3', () => {
    const { volunteers, proficiencies } = createMockVolunteers(30);

    const result = generateSchedule({ year: 2026, month: 8, volunteers, proficiencies });
    assert.equal(result.success, true);
    assert.ok(Array.isArray(result.trainees));

    result.trainees.forEach(t => {
      // Check trainee proficiency is N1 (level 1)
      assert.equal(t.proficiencyLevel, 1, 'Trainee must have level 1 proficiency');

      // Find main operator assigned to this slot
      const mainSlot = result.schedule.find(s => s.date === t.date && s.shift === t.shift && s.role === t.role);
      assert.ok(mainSlot, 'Main operator slot must exist');
      assert.equal(mainSlot.proficiencyLevel, 3, `Principal proficiency must be N3 (got ${mainSlot.proficiencyLevel})`);
      assert.notEqual(t.volunteerId, mainSlot.volunteerId, 'Trainee cannot be the main volunteer');
    });
  });

  test('Trainee assignments strictly respect the consecutive Sundays constraint', () => {
    const { volunteers, proficiencies } = createMockVolunteers(30);

    const result = generateSchedule({ year: 2026, month: 8, volunteers, proficiencies });
    assert.equal(result.success, true);

    // Combine all assignments per volunteer (main + trainee)
    const assignmentsByVol = new Map();
    volunteers.forEach(v => assignmentsByVol.set(v.id, []));

    result.schedule.forEach(s => {
      if (s.volunteerId) assignmentsByVol.get(s.volunteerId)?.push({ date: s.date, sundayIndex: s.sundayIndex, type: 'main' });
    });
    result.trainees.forEach(t => {
      if (t.volunteerId) assignmentsByVol.get(t.volunteerId)?.push({ date: t.date, sundayIndex: t.sundayIndex, type: 'trainee' });
    });

    volunteers.forEach(v => {
      const volAssignments = assignmentsByVol.get(v.id) || [];
      const sundayIndices = volAssignments.map(a => a.sundayIndex).sort((a, b) => a - b);

      for (let i = 0; i < sundayIndices.length - 1; i++) {
        const gap = sundayIndices[i + 1] - sundayIndices[i];
        assert.ok(gap >= 2, `Volunteer ${v.id} assigned on consecutive Sundays (${sundayIndices[i]} and ${sundayIndices[i + 1]}) including trainee slots`);
      }
    });
  });

  test('Volunteer is never assigned twice on the same Sunday (as main or trainee)', () => {
    const { volunteers, proficiencies } = createMockVolunteers(30);

    const result = generateSchedule({ year: 2026, month: 8, volunteers, proficiencies });
    assert.equal(result.success, true);

    const byVolAndDate = new Map();
    result.schedule.forEach(s => {
      const key = `${s.volunteerId}:${s.date}`;
      byVolAndDate.set(key, (byVolAndDate.get(key) || 0) + 1);
    });
    result.trainees.forEach(t => {
      const key = `${t.volunteerId}:${t.date}`;
      byVolAndDate.set(key, (byVolAndDate.get(key) || 0) + 1);
    });

    for (const [key, count] of byVolAndDate.entries()) {
      assert.ok(count <= 1, `Volunteer/Date ${key} assigned ${count} times on the same date`);
    }
  });

  test('counts trainee participation toward the two-assignment limit in a four-Sunday month', () => {
    const volunteers = [
      { id: 'n1', name: 'Trainee' },
      { id: 'n3-a', name: 'Mentor A' },
      { id: 'n3-b', name: 'Mentor B' }
    ];
    const proficiencies = [
      { volunteerId: 'n1', role: 'FREEHAND', level: 1 },
      { volunteerId: 'n3-a', role: 'FREEHAND', level: 3 },
      { volunteerId: 'n3-b', role: 'FREEHAND', level: 3 }
    ];

    const result = generateSchedule({
      year: 2026,
      month: 9,
      volunteers,
      proficiencies,
      roles: ['FREEHAND'],
      shifts: ['MORNING'],
      force: true
    });

    const n1Participations = result.schedule.filter(item => item.volunteerId === 'n1').length +
      result.trainees.filter(item => item.volunteerId === 'n1').length;
    assert.equal(n1Participations, 2);
  });
});
