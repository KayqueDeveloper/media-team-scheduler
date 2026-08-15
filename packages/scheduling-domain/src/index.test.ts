import { describe, expect, it } from 'vitest';

import { summarizeCoverage, validateSchedule } from './index.js';

const volunteers = [
  {
    id: 1,
    name: 'Mentora',
    active: true,
    allowedShift: 'ALL' as const,
    proficiencies: { VMIX: 3 as const }
  },
  {
    id: 2,
    name: 'Treinando',
    active: true,
    allowedShift: 'ALL' as const,
    proficiencies: { VMIX: 1 as const }
  }
];

describe('interface do domínio de escala', () => {
  it('aceita a combinação N3 + N1 no mesmo slot', () => {
    const result = validateSchedule({
      year: 2026,
      month: 8,
      volunteers,
      unavailabilities: [],
      assignments: [
        { date: '2026-08-02', shift: 'MORNING', role: 'VMIX', volunteerId: 1, isTrainee: false },
        { date: '2026-08-02', shift: 'MORNING', role: 'VMIX', volunteerId: 2, isTrainee: true }
      ]
    });

    expect(result).toEqual({ valid: true, violations: [] });
  });

  it('expõe violações de negócio sem depender da interface visual', () => {
    const result = validateSchedule({
      year: 2026,
      month: 8,
      volunteers,
      unavailabilities: [],
      assignments: [
        { date: '2026-08-02', shift: 'MORNING', role: 'VMIX', volunteerId: 1, isTrainee: false },
        { date: '2026-08-02', shift: 'NIGHT', role: 'VMIX', volunteerId: 1, isTrainee: false },
        { date: '2026-08-09', shift: 'MORNING', role: 'VMIX', volunteerId: 2, isTrainee: true }
      ]
    });

    expect(result.valid).toBe(false);
    expect(result.violations.map(({ code }) => code)).toEqual([
      'ONE_ASSIGNMENT_PER_SUNDAY',
      'TRAINEE_REQUIRES_SENIOR_MENTOR'
    ]);
  });

  it('resume cobertura principal sem contar treinandos como vagas cobertas', () => {
    expect(
      summarizeCoverage({
        year: 2026,
        month: 8,
        roles: ['VMIX'],
        shifts: ['MORNING'],
        assignments: [
          { date: '2026-08-02', shift: 'MORNING', role: 'VMIX', volunteerId: 1, isTrainee: false },
          { date: '2026-08-02', shift: 'MORNING', role: 'VMIX', volunteerId: 2, isTrainee: true }
        ]
      })
    ).toEqual({ totalSlots: 5, coveredSlots: 1, vacantSlots: 4, traineeAssignments: 1 });
  });
});
