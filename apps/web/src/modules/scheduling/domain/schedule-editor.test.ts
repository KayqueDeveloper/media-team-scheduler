import { describe, expect, it } from 'vitest';

import { getSlotAssignment, updateScheduleSlot, validateScheduleChange } from './schedule-editor.js';

describe('edição local da escala', () => {
  it('atualiza uma vaga sem alterar a matriz anterior', () => {
    const original = {
      '2026-08-02': { MORNING: { VMIX: { main: '1', trainee: '' } } }
    };
    const updated = updateScheduleSlot(original, '2026-08-02', 'MORNING', 'VMIX', 2, 'trainee');

    expect(getSlotAssignment(original, '2026-08-02', 'MORNING', 'VMIX')).toEqual({
      main: '1',
      trainee: ''
    });
    expect(getSlotAssignment(updated, '2026-08-02', 'MORNING', 'VMIX')).toEqual({
      main: '1',
      trainee: '2'
    });
  });

  it('impede um treinando sem mentor N3', () => {
    expect(
      validateScheduleChange({
        schedule: { '2026-08-02': { MORNING: { VMIX: { main: '1', trainee: '' } } } },
        volunteers: [
          { id: 1, name: 'Apto', active: true, allowedShift: 'ALL', proficiencies: { VMIX: 2 } },
          { id: 2, name: 'Treinando', active: true, allowedShift: 'ALL', proficiencies: { VMIX: 1 } }
        ],
        unavailabilities: [],
        sundays: [{ date: '2026-08-02' }],
        date: '2026-08-02',
        shift: 'MORNING',
        role: 'VMIX',
        volunteerId: 2,
        type: 'trainee'
      })
    ).toBe('O treinando N1 precisa estar acompanhado por um mentor N3.');
  });
});
