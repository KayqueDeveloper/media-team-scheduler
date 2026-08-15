import {
  DEFAULT_ROLES as LEGACY_DEFAULT_ROLES,
  DEFAULT_SHIFTS as LEGACY_DEFAULT_SHIFTS,
  generateSchedule as generateLegacySchedule,
  getPreviousSundayDate as getLegacyPreviousSundayDate
} from './generator-legacy.js';

export const DEFAULT_ROLES = LEGACY_DEFAULT_ROLES as readonly string[];
export const DEFAULT_SHIFTS = LEGACY_DEFAULT_SHIFTS as readonly string[];

export interface GenerationInput {
  readonly year: number;
  readonly month: number;
  readonly volunteers?: readonly unknown[];
  readonly proficiencies?: readonly unknown[] | Readonly<Record<string, unknown>>;
  readonly unavailabilities?: readonly unknown[];
  readonly pastAssignments?: readonly unknown[];
  readonly roles?: readonly unknown[];
  readonly shifts?: readonly unknown[];
  readonly lockedAssignments?: readonly unknown[];
}

export interface GeneratedAssignment {
  readonly date: string;
  readonly shift: string;
  readonly role: string;
  readonly volunteerId: string;
  readonly volunteerName: string;
  readonly proficiencyLevel: number;
  readonly isTrainee: boolean;
  readonly isLocked?: boolean;
  readonly traineeId?: string | null;
  readonly traineeName?: string | null;
}

export interface GenerationResult {
  readonly success: boolean;
  readonly complete?: boolean;
  readonly errors: readonly string[];
  readonly schedule: readonly GeneratedAssignment[] | null;
  readonly trainees?: readonly GeneratedAssignment[];
  readonly vacancies?: readonly Readonly<Record<string, unknown>>[];
  readonly invalidLockedAssignments?: readonly Readonly<Record<string, unknown>>[];
  readonly bySunday?: Readonly<Record<string, unknown>>;
  readonly metrics?: Readonly<Record<string, number | boolean>>;
  readonly warnings?: readonly string[];
}

const legacyGenerator = generateLegacySchedule as unknown as (input: GenerationInput) => GenerationResult;
const legacyPreviousSunday = getLegacyPreviousSundayDate as (date: string) => string;

export function generateSchedule(input: GenerationInput): GenerationResult {
  return legacyGenerator(input);
}

export function getPreviousSundayDate(date: string): string {
  return legacyPreviousSunday(date);
}
