import { describe, expect, it } from 'vitest';

import { apiErrorSchema, localDateSchema, scheduleAssignmentSchema } from './index.js';

describe('contratos HTTP', () => {
  it('aceita uma alocação válida e rejeita datas civis inválidas', () => {
    expect(
      scheduleAssignmentSchema.parse({
        date: '2026-08-02',
        shift: 'MORNING',
        role: 'VMIX',
        volunteerId: 42,
        isTrainee: false
      })
    ).toEqual({
      date: '2026-08-02',
      shift: 'MORNING',
      role: 'VMIX',
      volunteerId: 42,
      isTrainee: false
    });

    expect(localDateSchema.safeParse('2026-02-30').success).toBe(false);
  });

  it('mantém um envelope de erro estável e rastreável', () => {
    expect(
      apiErrorSchema.parse({
        code: 'INVALID_ASSIGNMENTS',
        message: 'A escala contém conflitos.',
        details: { conflicts: 2 },
        requestId: 'req-123'
      })
    ).toEqual({
      code: 'INVALID_ASSIGNMENTS',
      message: 'A escala contém conflitos.',
      details: { conflicts: 2 },
      requestId: 'req-123'
    });
  });
});
