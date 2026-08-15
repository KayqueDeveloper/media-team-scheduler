import { describe, expect, it } from 'vitest';

import { getCurrentBusinessMonth, getSundaysForMonth } from './catalog.js';

describe('catálogo da escala no frontend', () => {
  it('calcula o mês civil no fuso de negócio', () => {
    expect(getCurrentBusinessMonth(new Date('2026-09-01T01:30:00Z'), 'America/Sao_Paulo')).toEqual({
      year: 2026,
      monthIndex: 7
    });
  });

  it('apresenta os domingos sem depender do fuso do navegador', () => {
    expect(getSundaysForMonth(2026, 7)).toEqual([
      { date: '2026-08-02', formatted: '02/08/2026', label: '1º Domingo' },
      { date: '2026-08-09', formatted: '09/08/2026', label: '2º Domingo' },
      { date: '2026-08-16', formatted: '16/08/2026', label: '3º Domingo' },
      { date: '2026-08-23', formatted: '23/08/2026', label: '4º Domingo' },
      { date: '2026-08-30', formatted: '30/08/2026', label: '5º Domingo' }
    ]);
  });
});
