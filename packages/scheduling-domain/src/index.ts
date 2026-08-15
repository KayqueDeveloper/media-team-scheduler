import {
  ROLE_IDS,
  SHIFT_IDS,
  type Role,
  type ScheduleAssignment,
  type Shift,
  type Unavailability,
  type Volunteer
} from '@media-scheduler/contracts';

export type ScheduleViolationCode =
  | 'DATE_OUTSIDE_MONTH'
  | 'UNKNOWN_OR_INACTIVE_VOLUNTEER'
  | 'SHIFT_NOT_ALLOWED'
  | 'VOLUNTEER_UNAVAILABLE'
  | 'MAIN_REQUIRES_QUALIFIED_VOLUNTEER'
  | 'TRAINEE_REQUIRES_LEVEL_ONE'
  | 'ONE_ASSIGNMENT_PER_SUNDAY'
  | 'MONTHLY_LIMIT_EXCEEDED'
  | 'TRAINEE_REQUIRES_SENIOR_MENTOR';

export interface ScheduleViolation {
  readonly code: ScheduleViolationCode;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
}

export interface ValidationInput {
  readonly year: number;
  readonly month: number;
  readonly volunteers: readonly Volunteer[];
  readonly unavailabilities: readonly Unavailability[];
  readonly assignments: readonly ScheduleAssignment[];
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly violations: readonly ScheduleViolation[];
}

export interface CoverageInput {
  readonly year: number;
  readonly month: number;
  readonly assignments: readonly ScheduleAssignment[];
  readonly roles?: readonly Role[];
  readonly shifts?: readonly Shift[];
}

export interface CoverageSummary {
  readonly totalSlots: number;
  readonly coveredSlots: number;
  readonly vacantSlots: number;
  readonly traineeAssignments: number;
}

export function getSundaysInMonth(year: number, month: number): readonly string[] {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('Ano e mês válidos são obrigatórios.');
  }

  const sundays: string[] = [];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCDay() !== 0) continue;
    sundays.push(
      `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    );
  }
  return sundays;
}

function assignmentContext(assignment: ScheduleAssignment): Readonly<Record<string, unknown>> {
  return {
    volunteerId: assignment.volunteerId,
    date: assignment.date,
    shift: assignment.shift,
    role: assignment.role,
    isTrainee: assignment.isTrainee
  };
}

function slotKey(assignment: ScheduleAssignment): string {
  return `${assignment.date}:${assignment.shift}:${assignment.role}`;
}

export function validateSchedule(input: ValidationInput): ValidationResult {
  const sundays = new Set(getSundaysInMonth(input.year, input.month));
  const monthlyLimit = sundays.size === 5 ? 3 : 2;
  const volunteers = new Map(input.volunteers.map((volunteer) => [volunteer.id, volunteer]));
  const violations: ScheduleViolation[] = [];
  const seenVolunteerDates = new Set<string>();
  const duplicateVolunteerDates = new Set<string>();
  const volunteerDates = new Map<number, Set<string>>();
  const principalsBySlot = new Map<string, ScheduleAssignment>();

  for (const assignment of input.assignments) {
    if (!assignment.isTrainee) principalsBySlot.set(slotKey(assignment), assignment);
  }

  for (const assignment of input.assignments) {
    const context = assignmentContext(assignment);
    if (!sundays.has(assignment.date)) {
      violations.push({
        code: 'DATE_OUTSIDE_MONTH',
        message: 'A alocação deve usar um domingo do mês da escala.',
        context
      });
    }

    const volunteer = volunteers.get(assignment.volunteerId);
    if (!volunteer?.active) {
      violations.push({
        code: 'UNKNOWN_OR_INACTIVE_VOLUNTEER',
        message: 'A alocação exige um voluntário ativo.',
        context
      });
      continue;
    }

    if (volunteer.allowedShift !== 'ALL' && volunteer.allowedShift !== assignment.shift) {
      violations.push({
        code: 'SHIFT_NOT_ALLOWED',
        message: 'O turno não é permitido para o voluntário.',
        context
      });
    }

    const unavailable = input.unavailabilities.some(
      (item) =>
        item.volunteerId === assignment.volunteerId &&
        item.date === assignment.date &&
        (item.shift === 'ALL' || item.shift === assignment.shift)
    );
    if (unavailable) {
      violations.push({
        code: 'VOLUNTEER_UNAVAILABLE',
        message: 'O voluntário informou indisponibilidade para a data e o turno.',
        context
      });
    }

    const proficiency = volunteer.proficiencies[assignment.role] ?? 0;
    if (!assignment.isTrainee && proficiency < 2) {
      violations.push({
        code: 'MAIN_REQUIRES_QUALIFIED_VOLUNTEER',
        message: 'A alocação principal exige proficiência N2 ou N3.',
        context
      });
    }
    if (assignment.isTrainee && proficiency !== 1) {
      violations.push({
        code: 'TRAINEE_REQUIRES_LEVEL_ONE',
        message: 'A vaga de treinamento aceita somente proficiência N1.',
        context
      });
    }

    const volunteerDateKey = `${String(assignment.volunteerId)}:${assignment.date}`;
    if (seenVolunteerDates.has(volunteerDateKey) && !duplicateVolunteerDates.has(volunteerDateKey)) {
      duplicateVolunteerDates.add(volunteerDateKey);
      violations.push({
        code: 'ONE_ASSIGNMENT_PER_SUNDAY',
        message: 'Um voluntário pode servir em somente um turno e uma função por domingo.',
        context: { volunteerId: assignment.volunteerId, date: assignment.date }
      });
    }
    seenVolunteerDates.add(volunteerDateKey);

    const servedDates = volunteerDates.get(assignment.volunteerId) ?? new Set<string>();
    servedDates.add(assignment.date);
    volunteerDates.set(assignment.volunteerId, servedDates);

    if (assignment.isTrainee) {
      const principal = principalsBySlot.get(slotKey(assignment));
      const mentor = principal === undefined ? undefined : volunteers.get(principal.volunteerId);
      if (mentor === undefined || (mentor.proficiencies[assignment.role] ?? 0) !== 3) {
        violations.push({
          code: 'TRAINEE_REQUIRES_SENIOR_MENTOR',
          message: 'O treinando N1 precisa estar acompanhado por um mentor N3 na mesma vaga.',
          context
        });
      }
    }
  }

  for (const [volunteerId, dates] of volunteerDates) {
    if (dates.size <= monthlyLimit) continue;
    violations.push({
      code: 'MONTHLY_LIMIT_EXCEEDED',
      message: `O limite deste mês é de ${String(monthlyLimit)} domingos por voluntário.`,
      context: { volunteerId, dates: [...dates].sort(), monthlyLimit }
    });
  }

  return { valid: violations.length === 0, violations };
}

export function summarizeCoverage(input: CoverageInput): CoverageSummary {
  const roles = input.roles ?? ROLE_IDS;
  const shifts = input.shifts ?? SHIFT_IDS;
  const sundays = getSundaysInMonth(input.year, input.month);
  const expectedSlots = new Set<string>();
  for (const date of sundays) {
    for (const shift of shifts) {
      for (const role of roles) expectedSlots.add(`${date}:${shift}:${role}`);
    }
  }

  const coveredSlots = new Set(
    input.assignments
      .filter((assignment) => !assignment.isTrainee)
      .map(slotKey)
      .filter((key) => expectedSlots.has(key))
  ).size;

  return {
    totalSlots: expectedSlots.size,
    coveredSlots,
    vacantSlots: expectedSlots.size - coveredSlots,
    traineeAssignments: input.assignments.filter((assignment) => assignment.isTrainee).length
  };
}

export { DEFAULT_ROLES, DEFAULT_SHIFTS, generateSchedule, getPreviousSundayDate } from './generator.js';
