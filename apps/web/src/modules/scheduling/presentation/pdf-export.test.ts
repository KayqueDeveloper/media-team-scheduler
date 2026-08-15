import { describe, expect, it } from 'vitest';

import { generateWhatsAppText } from '../../../../../../src/utils/pdfExport.js';

describe('distribuição da escala', () => {
  it('compartilha os dois primeiros nomes de alocações principais e treinandos no WhatsApp', () => {
    const text = generateWhatsAppText(
      {
        '2026-08-02': {
          MORNING: { FREEHAND: { main: '1', trainee: '2' } },
          NIGHT: { FREEHAND: { main: '', trainee: '' } }
        }
      },
      {
        1: { name: 'Maria Eduarda de Souza' },
        2: { name: 'Joana Clara Pereira' }
      },
      [{ date: '2026-08-02', formatted: '02/08/2026', label: '1º Domingo' }],
      [{ id: 'FREEHAND', name: 'Freehand' }],
      'Agosto 2026'
    );

    expect(text).toMatch(/\*Maria Eduarda\*/);
    expect(text).toMatch(/\(Treino: Joana Clara\)/);
    expect(text).not.toMatch(/Maria Eduarda de Souza|Joana Clara Pereira/);
  });
});
