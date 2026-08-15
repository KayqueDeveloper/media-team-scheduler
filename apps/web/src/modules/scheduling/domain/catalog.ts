import { ROLE_IDS, SHIFT_IDS, type Role, type Shift } from '@media-scheduler/contracts';
import { getSundaysInMonth } from '@media-scheduler/scheduling-domain';

export interface RoleOption {
  readonly id: Role;
  readonly name: string;
  readonly shortName: string;
}

export interface ShiftOption {
  readonly id: Shift;
  readonly name: string;
  readonly time: string;
}

export interface SundayOption {
  readonly date: string;
  readonly formatted: string;
  readonly label: string;
}

const ROLE_LABELS: Readonly<Record<Role, readonly [name: string, shortName: string]>> = {
  FREEHAND: ['Freehand', 'FREEHAND'],
  VMIX: ['vMix', 'VMIX'],
  FIXED_CAM: ['Câmera Fixa', 'FIXA'],
  SWITCHER: ['Corte', 'CORTE'],
  JIB: ['Grua', 'GRUA'],
  COORDINATOR: ['Coordenador', 'COORDENADOR']
};

export const ROLES: readonly RoleOption[] = ROLE_IDS.map((id) => ({
  id,
  name: ROLE_LABELS[id][0],
  shortName: ROLE_LABELS[id][1]
}));

export const SHIFTS: readonly ShiftOption[] = SHIFT_IDS.map((id) => ({
  id,
  name: id === 'MORNING' ? 'Manhã' : 'Noite',
  time: id === 'MORNING' ? '09h00' : '18h00'
}));

export const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
] as const;

export function getCurrentBusinessMonth(
  now: Date = new Date(),
  timeZone = 'America/Sao_Paulo'
): { readonly year: number; readonly monthIndex: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), monthIndex: Number(values.month) - 1 };
}

export function getSundaysForMonth(year: number, monthIndex: number): readonly SundayOption[] {
  return getSundaysInMonth(year, monthIndex + 1).map((date, index) => {
    const [yearPart, monthPart, dayPart] = date.split('-');
    return {
      date,
      formatted: `${dayPart ?? ''}/${monthPart ?? ''}/${yearPart ?? ''}`,
      label: `${String(index + 1)}º Domingo`
    };
  });
}
