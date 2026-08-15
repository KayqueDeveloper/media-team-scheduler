import { describe, expect, it } from 'vitest';

import { evaluateUnavailabilityWindow, getUnavailabilityCutoff } from './policy.js';

describe('política de indisponibilidade', () => {
  it('fecha no dia 25 do mês anterior à escala', () => {
    expect(getUnavailabilityCutoff('2026-08-02')).toBe('2026-07-25');
    expect(evaluateUnavailabilityWindow('2026-08-02', '2026-07-25')).toEqual({
      accepted: true,
      cutoffDate: '2026-07-25'
    });
    expect(evaluateUnavailabilityWindow('2026-08-02', '2026-07-26')).toEqual({
      accepted: false,
      cutoffDate: '2026-07-25'
    });
  });

  it('recusa uma data que não é domingo', () => {
    expect(() => getUnavailabilityCutoff('2026-08-03')).toThrow(/domingo/);
  });
});
