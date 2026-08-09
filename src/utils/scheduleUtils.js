/**
 * Helper utilities for working with schedule assignments (main & trainee slots)
 */

export function getSlotAssignment(schedule, date, shiftId, roleId) {
  const raw = schedule?.[date]?.[shiftId]?.[roleId];
  if (!raw) return { main: '', trainee: '' };
  if (typeof raw === 'object') {
    return {
      main: raw.main || '',
      trainee: raw.trainee || ''
    };
  }
  return { main: String(raw), trainee: '' };
}

export function ensureScheduleSlots(schedule, sundays, shifts, roles) {
  const result = structuredClone(schedule || {});
  for (const sunday of sundays) {
    result[sunday.date] ??= {};
    for (const shift of shifts) {
      result[sunday.date][shift.id] ??= {};
      for (const role of roles) {
        const slot = getSlotAssignment(result, sunday.date, shift.id, role.id);
        result[sunday.date][shift.id][role.id] = slot;
      }
    }
  }
  return result;
}

export function updateScheduleSlot(schedule, date, shift, role, volunteerId, type) {
  const current = getSlotAssignment(schedule, date, shift, role);
  return {
    ...schedule,
    [date]: {
      ...schedule?.[date],
      [shift]: {
        ...schedule?.[date]?.[shift],
        [role]: { ...current, [type]: volunteerId ? String(volunteerId) : '' }
      }
    }
  };
}

function isUnavailable(unavailabilities, volunteerId, date, shift) {
  return unavailabilities.some(item =>
    String(item.volunteerId) === String(volunteerId) &&
    item.date === date &&
    (item.shift === shift || item.shift === 'ALL')
  );
}

function allocationsForVolunteer(schedule, volunteerId, ignoredSlot) {
  const result = [];
  for (const [date, shifts] of Object.entries(schedule || {})) {
    for (const [shift, roles] of Object.entries(shifts || {})) {
      for (const [role, raw] of Object.entries(roles || {})) {
        const slot = raw && typeof raw === 'object' ? raw : { main: raw, trainee: '' };
        for (const type of ['main', 'trainee']) {
          if (ignoredSlot && ignoredSlot.date === date && ignoredSlot.shift === shift && ignoredSlot.role === role && ignoredSlot.type === type) continue;
          if (slot[type] && String(slot[type]) === String(volunteerId)) result.push({ date, shift, role, type });
        }
      }
    }
  }
  return result;
}

export function validateScheduleChange({
  schedule,
  volunteers,
  unavailabilities,
  sundays,
  date,
  shift,
  role,
  volunteerId,
  type
}) {
  const current = getSlotAssignment(schedule, date, shift, role);
  if (!volunteerId) {
    if (type === 'main' && current.trainee) return 'Remova o treinando antes de deixar a alocação principal vaga.';
    return null;
  }

  const volunteer = volunteers.find(item => String(item.id) === String(volunteerId));
  if (!volunteer) return 'Voluntário não encontrado.';
  if (!volunteer.active) return 'Voluntários inativos não podem receber novas alocações.';
  if (volunteer.allowedShift !== 'ALL' && volunteer.allowedShift !== shift) {
    return `${volunteer.name} não pode servir neste turno.`;
  }
  if (isUnavailable(unavailabilities, volunteerId, date, shift)) {
    return `${volunteer.name} está indisponível nesta data e turno.`;
  }

  const level = Number(volunteer.proficiencies?.[role] || 0);
  if (type === 'main' && level < 2) return 'A alocação principal exige proficiência N2 ou N3.';
  if (type === 'main' && current.trainee && level !== 3) return 'Uma alocação com treinando exige mentor N3.';
  if (type === 'trainee') {
    if (level !== 1) return 'A vaga de treinamento aceita apenas voluntário N1 nessa função.';
    const mentor = volunteers.find(item => String(item.id) === String(current.main));
    if (!mentor || Number(mentor.proficiencies?.[role] || 0) !== 3) return 'O treinando N1 precisa estar acompanhado por um mentor N3.';
  }

  const otherAllocations = allocationsForVolunteer(schedule, volunteerId, { date, shift, role, type });
  if (otherAllocations.some(item => item.date === date)) {
    return 'Um voluntário pode servir em apenas um turno e uma função por domingo.';
  }

  const servedDates = new Set(otherAllocations.map(item => item.date));
  servedDates.add(date);
  const monthlyLimit = sundays.length === 5 ? 3 : 2;
  if (servedDates.size > monthlyLimit) {
    return `O limite deste mês é de ${monthlyLimit} domingos por voluntário.`;
  }
  return null;
}

export function collectScheduleWarnings({ schedule, sundays, shifts, roles, volunteers }) {
  let vacantSlots = 0;
  let invalidMain = 0;
  let invalidTrainee = 0;
  const volunteersById = new Map(volunteers.map(item => [String(item.id), item]));

  for (const sunday of sundays) {
    for (const shift of shifts) {
      for (const role of roles) {
        const slot = getSlotAssignment(schedule, sunday.date, shift.id, role.id);
        const main = volunteersById.get(String(slot.main));
        const trainee = volunteersById.get(String(slot.trainee));
        if (!slot.main) vacantSlots += 1;
        else if (!main || Number(main.proficiencies?.[role.id] || 0) < 2) invalidMain += 1;
        if (slot.trainee && (!trainee || Number(trainee.proficiencies?.[role.id] || 0) !== 1 || Number(main?.proficiencies?.[role.id] || 0) !== 3)) {
          invalidTrainee += 1;
        }
      }
    }
  }

  const warnings = [];
  if (vacantSlots) warnings.push(`${vacantSlots} vaga(s) principal(is) descoberta(s).`);
  if (invalidMain) warnings.push(`${invalidMain} alocação(ões) principal(is) sem proficiência N2/N3.`);
  if (invalidTrainee) warnings.push(`${invalidTrainee} treinamento(s) sem a combinação N1 + mentor N3.`);
  return warnings;
}
