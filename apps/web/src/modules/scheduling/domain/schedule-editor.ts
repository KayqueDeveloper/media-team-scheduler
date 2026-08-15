export type SlotType = 'main' | 'trainee';

export interface ScheduleSlot {
  readonly main: string;
  readonly trainee: string;
}

type RawSlot = ScheduleSlot | string;
export type ScheduleMatrix = Record<string, Record<string, Record<string, RawSlot>>>;

export interface VolunteerView {
  readonly id: string | number;
  readonly name: string;
  readonly active: boolean;
  readonly allowedShift: string;
  readonly proficiencies?: Readonly<Record<string, number>>;
}

export interface UnavailabilityView {
  readonly volunteerId: string | number;
  readonly date: string;
  readonly shift: string;
}

interface IdOption {
  readonly id: string;
}

interface SundayOption {
  readonly date: string;
}

interface IgnoredSlot {
  readonly date: string;
  readonly shift: string;
  readonly role: string;
  readonly type: SlotType;
}

export function getSlotAssignment(
  schedule: ScheduleMatrix | null | undefined,
  date: string,
  shiftId: string,
  roleId: string
): ScheduleSlot {
  const raw = schedule?.[date]?.[shiftId]?.[roleId];
  if (!raw) return { main: '', trainee: '' };
  if (typeof raw === 'object') {
    return { main: raw.main || '', trainee: raw.trainee || '' };
  }
  return { main: raw, trainee: '' };
}

export function ensureScheduleSlots(
  schedule: ScheduleMatrix | null | undefined,
  sundays: readonly SundayOption[],
  shifts: readonly IdOption[],
  roles: readonly IdOption[]
): ScheduleMatrix {
  const result: ScheduleMatrix = structuredClone(schedule ?? {});
  for (const sunday of sundays) {
    const dateSlots = (result[sunday.date] ??= {});
    for (const shift of shifts) {
      const shiftSlots = (dateSlots[shift.id] ??= {});
      for (const role of roles) {
        shiftSlots[role.id] = getSlotAssignment(result, sunday.date, shift.id, role.id);
      }
    }
  }
  return result;
}

export function updateScheduleSlot(
  schedule: ScheduleMatrix,
  date: string,
  shift: string,
  role: string,
  volunteerId: string | number | null,
  type: SlotType
): ScheduleMatrix {
  const current = getSlotAssignment(schedule, date, shift, role);
  return {
    ...schedule,
    [date]: {
      ...schedule[date],
      [shift]: {
        ...schedule[date]?.[shift],
        [role]: { ...current, [type]: volunteerId ? String(volunteerId) : '' }
      }
    }
  };
}

function isUnavailable(
  unavailabilities: readonly UnavailabilityView[],
  volunteerId: string | number,
  date: string,
  shift: string
): boolean {
  return unavailabilities.some(
    (item) =>
      String(item.volunteerId) === String(volunteerId) &&
      item.date === date &&
      (item.shift === shift || item.shift === 'ALL')
  );
}

function allocationsForVolunteer(
  schedule: ScheduleMatrix,
  volunteerId: string | number,
  ignoredSlot: IgnoredSlot
): readonly IgnoredSlot[] {
  const result: IgnoredSlot[] = [];
  const targetVolunteerId = String(volunteerId);
  for (const [date, shifts] of Object.entries(schedule)) {
    for (const [shift, roles] of Object.entries(shifts)) {
      for (const [role, raw] of Object.entries(roles)) {
        const slot: ScheduleSlot = raw && typeof raw === 'object' ? raw : { main: raw, trainee: '' };
        for (const type of ['main', 'trainee'] as const) {
          if (
            ignoredSlot.date === date &&
            ignoredSlot.shift === shift &&
            ignoredSlot.role === role &&
            ignoredSlot.type === type
          ) {
            continue;
          }
          if (slot[type] && slot[type] === targetVolunteerId) {
            result.push({ date, shift, role, type });
          }
        }
      }
    }
  }
  return result;
}

export interface ValidateScheduleChangeInput {
  readonly schedule: ScheduleMatrix;
  readonly volunteers: readonly VolunteerView[];
  readonly unavailabilities: readonly UnavailabilityView[];
  readonly sundays: readonly SundayOption[];
  readonly date: string;
  readonly shift: string;
  readonly role: string;
  readonly volunteerId: string | number | null;
  readonly type: SlotType;
}

export function validateScheduleChange(input: ValidateScheduleChangeInput): string | null {
  const { schedule, volunteers, unavailabilities, sundays, date, shift, role, volunteerId, type } = input;
  const current = getSlotAssignment(schedule, date, shift, role);
  if (!volunteerId) {
    if (type === 'main' && current.trainee) {
      return 'Remova o treinando antes de deixar a alocação principal vaga.';
    }
    return null;
  }

  const volunteer = volunteers.find((item) => String(item.id) === String(volunteerId));
  if (!volunteer) return 'Voluntário não encontrado.';
  if (!volunteer.active) return 'Voluntários inativos não podem receber novas alocações.';
  if (volunteer.allowedShift !== 'ALL' && volunteer.allowedShift !== shift) {
    return `${volunteer.name} não pode servir neste turno.`;
  }
  if (isUnavailable(unavailabilities, volunteerId, date, shift)) {
    return `${volunteer.name} está indisponível nesta data e turno.`;
  }

  const level = volunteer.proficiencies?.[role] ?? 0;
  if (type === 'main' && level < 2) return 'A alocação principal exige proficiência N2 ou N3.';
  if (type === 'main' && current.trainee && level !== 3) {
    return 'Uma alocação com treinando exige mentor N3.';
  }
  if (type === 'trainee') {
    if (level !== 1) return 'A vaga de treinamento aceita apenas voluntário N1 nessa função.';
    const mentor = volunteers.find((item) => String(item.id) === current.main);
    if (!mentor || (mentor.proficiencies?.[role] ?? 0) !== 3) {
      return 'O treinando N1 precisa estar acompanhado por um mentor N3.';
    }
  }

  const otherAllocations = allocationsForVolunteer(schedule, volunteerId, {
    date,
    shift,
    role,
    type
  });
  if (otherAllocations.some((item) => item.date === date)) {
    return 'Um voluntário pode servir em apenas um turno e uma função por domingo.';
  }

  const servedDates = new Set(otherAllocations.map((item) => item.date));
  servedDates.add(date);
  const monthlyLimit = sundays.length === 5 ? 3 : 2;
  if (servedDates.size > monthlyLimit) {
    return `O limite deste mês é de ${String(monthlyLimit)} domingos por voluntário.`;
  }
  return null;
}

export interface CollectWarningsInput {
  readonly schedule: ScheduleMatrix;
  readonly sundays: readonly SundayOption[];
  readonly shifts: readonly IdOption[];
  readonly roles: readonly IdOption[];
  readonly volunteers: readonly VolunteerView[];
}

export function collectScheduleWarnings(input: CollectWarningsInput): readonly string[] {
  const { schedule, sundays, shifts, roles, volunteers } = input;
  let vacantSlots = 0;
  let invalidMain = 0;
  let invalidTrainee = 0;
  const volunteersById = new Map(volunteers.map((item) => [String(item.id), item]));

  for (const sunday of sundays) {
    for (const shift of shifts) {
      for (const role of roles) {
        const slot = getSlotAssignment(schedule, sunday.date, shift.id, role.id);
        const main = volunteersById.get(slot.main);
        const trainee = volunteersById.get(slot.trainee);
        if (!slot.main) vacantSlots += 1;
        else if (!main || (main.proficiencies?.[role.id] ?? 0) < 2) invalidMain += 1;
        if (
          slot.trainee &&
          (!trainee ||
            (trainee.proficiencies?.[role.id] ?? 0) !== 1 ||
            (main?.proficiencies?.[role.id] ?? 0) !== 3)
        ) {
          invalidTrainee += 1;
        }
      }
    }
  }

  const warnings: string[] = [];
  if (vacantSlots) warnings.push(`${String(vacantSlots)} vaga(s) principal(is) descoberta(s).`);
  if (invalidMain) {
    warnings.push(`${String(invalidMain)} alocação(ões) principal(is) sem proficiência N2/N3.`);
  }
  if (invalidTrainee) {
    warnings.push(`${String(invalidTrainee)} treinamento(s) sem a combinação N1 + mentor N3.`);
  }
  return warnings;
}
