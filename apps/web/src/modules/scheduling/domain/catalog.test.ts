import { describe, expect, it } from 'vitest';

import {
  formatVolunteerDisplayName,
  formatScheduleDate,
  getCurrentBusinessMonth,
  getRoleLabel,
  getShiftLabel,
  getSundaysForMonth
} from './catalog.js';

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

  it('apresenta identificadores internos com a linguagem do domínio', () => {
    expect(formatScheduleDate('2026-08-16')).toBe('16/08/2026');
    expect(getShiftLabel('MORNING')).toBe('Manhã');
    expect(getRoleLabel('FIXED_CAM')).toBe('Câmera Fixa');
  });

  it('exibe somente os dois primeiros nomes do voluntário na escala publicada', () => {
    expect(formatVolunteerDisplayName('  Maria   Eduarda de Souza  ')).toBe('Maria Eduarda');
    expect(formatVolunteerDisplayName('João Pedro')).toBe('João Pedro');
    expect(formatVolunteerDisplayName('Ana')).toBe('Ana');
  });
});
