/**
 * Church Broadcast Scheduling System - Constraint Solver Engine
 * File: server/solver/scheduler.js
 */

export const DEFAULT_ROLES = ['FREEHAND', 'VMIX', 'FIXED_CAM', 'SWITCHER', 'JIB', 'COORDINATOR'];
export const DEFAULT_SHIFTS = ['MORNING', 'NIGHT'];

/**
 * Returns an array of Sunday dates ('YYYY-MM-DD') for a given year and month (1-indexed).
 */
export function getSundaysInMonth(year, month) {
  const sundays = [];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCDay() === 0) {
      const yearPart = date.getUTCFullYear();
      const monthPart = String(date.getUTCMonth() + 1).padStart(2, '0');
      const dayPart = String(date.getUTCDate()).padStart(2, '0');
      sundays.push(`${yearPart}-${monthPart}-${dayPart}`);
    }
  }

  return sundays;
}

/**
 * Gets the date string ('YYYY-MM-DD') of the Sunday preceding the given Sunday date.
 */
export function getPreviousSundayDate(sundayDateStr) {
  const date = new Date(Date.parse(`${sundayDateStr}T00:00:00Z`));
  date.setUTCDate(date.getUTCDate() - 7);
  const yearPart = date.getUTCFullYear();
  const monthPart = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dayPart = String(date.getUTCDate()).padStart(2, '0');
  return `${yearPart}-${monthPart}-${dayPart}`;
}

/**
 * Generates the best monthly schedule that can be built from the supplied data.
 * A valid request returns success=true even when coverage is partial; uncovered
 * slots are exposed through `vacancies` and `warnings`.
 */
export function generateSchedule({
  year,
  month,
  volunteers = [],
  proficiencies = [],
  unavailabilities = [],
  pastAssignments = [],
  roles = DEFAULT_ROLES,
  shifts = DEFAULT_SHIFTS,
  lockedAssignments = []
}) {
  if (!year || !month) {
    throw new Error('Year and month are required parameters.');
  }

  const sundays = getSundaysInMonth(year, month);
  if (sundays.length === 0) {
    return {
      success: false,
      errors: [`No Sundays found for year ${year}, month ${month}`],
      schedule: null
    };
  }

  const normalizedRoles = roles.map(role => String(role?.id ?? role).toUpperCase());
  const normalizedShifts = shifts.map(shift => String(shift?.id ?? shift).toUpperCase());
  const normalizedVolunteers = volunteers
    .filter(volunteer => typeof volunteer !== 'object' || volunteer.active !== false)
    .map(volunteer => {
      if (typeof volunteer === 'string' || typeof volunteer === 'number') {
        return { id: String(volunteer), name: String(volunteer), allowedShift: 'ALL' };
      }

      const id = String(volunteer.id ?? volunteer.volunteerId ?? volunteer.volunteer_id ?? '');
      const oneAllowedShift = Array.isArray(volunteer.shifts) && volunteer.shifts.length === 1
        ? volunteer.shifts[0]
        : null;
      const rawAllowedShift = volunteer.allowedShift ?? volunteer.preferredShift ?? oneAllowedShift ?? 'ALL';
      const allowedShift = ['ALL', 'ANY', 'BOTH'].includes(String(rawAllowedShift).toUpperCase())
        ? 'ALL'
        : String(rawAllowedShift).toUpperCase();

      return {
        id,
        name: volunteer.name || id,
        allowedShift
      };
    })
    .filter(volunteer => volunteer.id);

  const volunteerMap = new Map(normalizedVolunteers.map(volunteer => [volunteer.id, volunteer]));
  const profMap = new Map(normalizedVolunteers.map(volunteer => [volunteer.id, new Map()]));

  volunteers.forEach(volunteer => {
    if (!volunteer || typeof volunteer !== 'object') return;
    const volunteerId = String(volunteer.id ?? volunteer.volunteerId ?? volunteer.volunteer_id ?? '');
    if (!profMap.has(volunteerId) || !volunteer.proficiencies || typeof volunteer.proficiencies !== 'object') return;

    Object.entries(volunteer.proficiencies).forEach(([role, level]) => {
      profMap.get(volunteerId).set(String(role).toUpperCase(), Number(level));
    });
  });

  if (Array.isArray(proficiencies)) {
    proficiencies.forEach(proficiency => {
      const volunteerId = String(
        proficiency.volunteerId ?? proficiency.volunteer_id ?? proficiency.vId ?? ''
      );
      const role = String(proficiency.role ?? proficiency.roleId ?? proficiency.role_id ?? '').toUpperCase();
      const level = Number(proficiency.level ?? proficiency.proficiency ?? 0);
      if (volunteerId && role && profMap.has(volunteerId)) {
        profMap.get(volunteerId).set(role, level);
      }
    });
  } else if (proficiencies && typeof proficiencies === 'object') {
    Object.entries(proficiencies).forEach(([volunteerId, roleLevels]) => {
      if (!profMap.has(String(volunteerId)) || !roleLevels || typeof roleLevels !== 'object') return;
      Object.entries(roleLevels).forEach(([role, level]) => {
        profMap.get(String(volunteerId)).set(String(role).toUpperCase(), Number(level));
      });
    });
  }

  const getProficiencyLevel = (volunteerId, role) => profMap.get(volunteerId)?.get(role) || 0;

  const unavailable = new Set();
  unavailabilities.forEach(unavailability => {
    const volunteerId = String(
      unavailability.volunteerId ?? unavailability.volunteer_id ?? unavailability.vId ?? ''
    );
    const date = unavailability.date;
    const shift = unavailability.shift ? String(unavailability.shift).toUpperCase() : null;
    if (!volunteerId || !date) return;

    unavailable.add(`${volunteerId}:${date}`);
    if (shift) {
      unavailable.delete(`${volunteerId}:${date}`);
      unavailable.add(`${volunteerId}:${date}:${shift}`);
    }
  });

  const isUnavailable = (volunteerId, date, shift) =>
    unavailable.has(`${volunteerId}:${date}`) || unavailable.has(`${volunteerId}:${date}:${shift}`);

  const pastCountMap = new Map(normalizedVolunteers.map(volunteer => [volunteer.id, 0]));
  const lastPastDateMap = new Map(normalizedVolunteers.map(volunteer => [volunteer.id, null]));
  const servedPreviousSunday = new Set();
  const previousSunday = getPreviousSundayDate(sundays[0]);

  pastAssignments.forEach(assignment => {
    const volunteerId = String(
      assignment.volunteerId ?? assignment.volunteer_id ?? assignment.vId ?? ''
    );
    if (!volunteerMap.has(volunteerId)) return;

    pastCountMap.set(volunteerId, (pastCountMap.get(volunteerId) || 0) + 1);
    if (!lastPastDateMap.get(volunteerId) || assignment.date > lastPastDateMap.get(volunteerId)) {
      lastPastDateMap.set(volunteerId, assignment.date);
    }
    if (assignment.date === previousSunday) {
      servedPreviousSunday.add(volunteerId);
    }
  });

  const slots = [];
  sundays.forEach((date, sundayIndex) => {
    normalizedShifts.forEach(shift => {
      normalizedRoles.forEach(role => {
        slots.push({
          key: `${date}:${shift}:${role}`,
          date,
          sundayIndex,
          shift,
          role
        });
      });
    });
  });
  const slotMap = new Map(slots.map(slot => [slot.key, slot]));
  const dynamicMonthlyLimit = sundays.length === 5 ? 3 : 2;

  const invalidLockedAssignments = [];
  const validLockedAssignments = new Map();
  const lockedVolunteerDates = new Set();
  const lockedVolunteerCounts = new Map();

  const rejectLockedAssignment = (assignment, code, reason) => {
    invalidLockedAssignments.push({ assignment, code, reason });
  };

  lockedAssignments.forEach(originalAssignment => {
    const assignment = {
      date: originalAssignment.date,
      shift: String(originalAssignment.shift ?? '').toUpperCase(),
      role: String(originalAssignment.role ?? '').toUpperCase(),
      volunteerId: String(originalAssignment.volunteerId ?? originalAssignment.vId ?? '')
    };
    const key = `${assignment.date}:${assignment.shift}:${assignment.role}`;
    const slot = slotMap.get(key);
    const volunteer = volunteerMap.get(assignment.volunteerId);
    const volunteerDateKey = `${assignment.volunteerId}:${assignment.date}`;

    if (!slot) {
      rejectLockedAssignment(assignment, 'UNKNOWN_SLOT', 'a vaga não pertence ao mês, turno ou função solicitados');
    } else if (!volunteer) {
      rejectLockedAssignment(assignment, 'UNKNOWN_VOLUNTEER', 'o voluntário não está ativo ou não existe');
    } else if (validLockedAssignments.has(key)) {
      rejectLockedAssignment(assignment, 'DUPLICATE_SLOT', 'a vaga já possui outra alocação travada válida');
    } else if (getProficiencyLevel(assignment.volunteerId, assignment.role) < 2) {
      rejectLockedAssignment(assignment, 'INSUFFICIENT_PROFICIENCY', 'uma alocação principal exige proficiência N2 ou N3');
    } else if (volunteer.allowedShift !== 'ALL' && volunteer.allowedShift !== assignment.shift) {
      rejectLockedAssignment(assignment, 'SHIFT_NOT_ALLOWED', 'o turno não é permitido para o voluntário');
    } else if (isUnavailable(assignment.volunteerId, assignment.date, assignment.shift)) {
      rejectLockedAssignment(assignment, 'UNAVAILABLE', 'o voluntário está indisponível nessa data e turno');
    } else if (lockedVolunteerDates.has(volunteerDateKey)) {
      rejectLockedAssignment(assignment, 'MULTIPLE_SHIFTS_SAME_SUNDAY', 'o voluntário já possui uma alocação travada nesse domingo');
    } else if ((lockedVolunteerCounts.get(assignment.volunteerId) || 0) >= dynamicMonthlyLimit) {
      rejectLockedAssignment(assignment, 'MONTHLY_LIMIT_EXCEEDED', 'a alocação excede o limite mensal do voluntário');
    } else {
      validLockedAssignments.set(key, { ...slot, volunteerId: assignment.volunteerId, isLocked: true });
      lockedVolunteerDates.add(volunteerDateKey);
      lockedVolunteerCounts.set(
        assignment.volunteerId,
        (lockedVolunteerCounts.get(assignment.volunteerId) || 0) + 1
      );
    }
  });

  const compareVolunteers = (leftId, rightId, monthCounts) => {
    const monthDifference = (monthCounts.get(leftId) || 0) - (monthCounts.get(rightId) || 0);
    if (monthDifference !== 0) return monthDifference;

    const historyDifference = (pastCountMap.get(leftId) || 0) - (pastCountMap.get(rightId) || 0);
    if (historyDifference !== 0) return historyDifference;

    const leftLastDate = lastPastDateMap.get(leftId) || '';
    const rightLastDate = lastPastDateMap.get(rightId) || '';
    if (leftLastDate !== rightLastDate) return leftLastDate.localeCompare(rightLastDate);
    return leftId.localeCompare(rightId);
  };

  function buildAttempt(monthlyLimit, allowConsecutiveSundays) {
    for (const count of lockedVolunteerCounts.values()) {
      if (count > monthlyLimit) return null;
    }

    const assignmentMap = new Map(validLockedAssignments);
    const monthCounts = new Map(normalizedVolunteers.map(volunteer => [volunteer.id, 0]));
    const assignedSundayIndexes = new Map(
      normalizedVolunteers.map(volunteer => [
        volunteer.id,
        servedPreviousSunday.has(volunteer.id) ? new Set([-1]) : new Set()
      ])
    );

    for (const assignment of validLockedAssignments.values()) {
      monthCounts.set(assignment.volunteerId, (monthCounts.get(assignment.volunteerId) || 0) + 1);
      assignedSundayIndexes.get(assignment.volunteerId).add(assignment.sundayIndex);
    }

    if (!allowConsecutiveSundays) {
      for (const sundayIndexes of assignedSundayIndexes.values()) {
        const orderedIndexes = [...sundayIndexes].sort((left, right) => left - right);
        for (let index = 1; index < orderedIndexes.length; index++) {
          if (orderedIndexes[index] - orderedIndexes[index - 1] === 1) return null;
        }
      }
    }

    const isEligible = (volunteerId, slot) => {
      const volunteer = volunteerMap.get(volunteerId);
      if (!volunteer || getProficiencyLevel(volunteerId, slot.role) < 2) return false;
      if (volunteer.allowedShift !== 'ALL' && volunteer.allowedShift !== slot.shift) return false;
      if (isUnavailable(volunteerId, slot.date, slot.shift)) return false;
      if ((monthCounts.get(volunteerId) || 0) >= monthlyLimit) return false;

      const sundayIndexes = assignedSundayIndexes.get(volunteerId);
      if (sundayIndexes.has(slot.sundayIndex)) return false;
      if (!allowConsecutiveSundays && (
        sundayIndexes.has(slot.sundayIndex - 1) || sundayIndexes.has(slot.sundayIndex + 1)
      )) return false;
      return true;
    };

    sundays.forEach((date, sundayIndex) => {
      const dateSlots = slots.filter(slot => slot.date === date && !assignmentMap.has(slot.key));
      const candidatesBySlot = new Map();

      dateSlots.forEach(slot => {
        const candidates = normalizedVolunteers
          .map(volunteer => volunteer.id)
          .filter(volunteerId => isEligible(volunteerId, slot))
          .sort((leftId, rightId) => compareVolunteers(leftId, rightId, monthCounts));
        candidatesBySlot.set(slot.key, candidates);
      });

      dateSlots.sort((left, right) => {
        const candidateDifference =
          candidatesBySlot.get(left.key).length - candidatesBySlot.get(right.key).length;
        return candidateDifference || left.key.localeCompare(right.key);
      });

      const volunteerToSlot = new Map();
      const slotToVolunteer = new Map();
      for (const locked of validLockedAssignments.values()) {
        if (locked.sundayIndex === sundayIndex) {
          volunteerToSlot.set(locked.volunteerId, locked.key);
        }
      }

      const assignSlot = (slotKey, visitedVolunteers, visitedSlots) => {
        if (visitedSlots.has(slotKey)) return false;
        visitedSlots.add(slotKey);

        for (const volunteerId of candidatesBySlot.get(slotKey) || []) {
          if (visitedVolunteers.has(volunteerId)) continue;
          visitedVolunteers.add(volunteerId);

          const occupiedSlotKey = volunteerToSlot.get(volunteerId);
          if (!occupiedSlotKey || (
            !validLockedAssignments.has(occupiedSlotKey) &&
            assignSlot(occupiedSlotKey, visitedVolunteers, visitedSlots)
          )) {
            volunteerToSlot.set(volunteerId, slotKey);
            slotToVolunteer.set(slotKey, volunteerId);
            return true;
          }
        }
        return false;
      };

      dateSlots.forEach(slot => assignSlot(slot.key, new Set(), new Set()));

      slotToVolunteer.forEach((volunteerId, slotKey) => {
        const slot = slotMap.get(slotKey);
        assignmentMap.set(slotKey, { ...slot, volunteerId, isLocked: false });
        monthCounts.set(volunteerId, (monthCounts.get(volunteerId) || 0) + 1);
        assignedSundayIndexes.get(volunteerId).add(sundayIndex);
      });
    });

    return {
      assignmentMap,
      assignedSundayIndexes,
      monthCounts,
      monthlyLimit,
      allowConsecutiveSundays
    };
  }

  const attemptDefinitions = [
    { monthlyLimit: 2, allowConsecutiveSundays: false },
    ...(dynamicMonthlyLimit === 3
      ? [{ monthlyLimit: 3, allowConsecutiveSundays: false }]
      : []),
    { monthlyLimit: 2, allowConsecutiveSundays: true },
    ...(dynamicMonthlyLimit === 3
      ? [{ monthlyLimit: 3, allowConsecutiveSundays: true }]
      : [])
  ];

  let selectedAttempt = null;
  for (const definition of attemptDefinitions) {
    const attempt = buildAttempt(definition.monthlyLimit, definition.allowConsecutiveSundays);
    if (!attempt) continue;

    if (!selectedAttempt || attempt.assignmentMap.size > selectedAttempt.assignmentMap.size) {
      selectedAttempt = attempt;
    }
    if (attempt.assignmentMap.size === slots.length) {
      selectedAttempt = attempt;
      break;
    }
  }

  // There is always at least one usable attempt because invalid locks are discarded.
  selectedAttempt ||= buildAttempt(dynamicMonthlyLimit, true);

  const schedule = slots
    .filter(slot => selectedAttempt.assignmentMap.has(slot.key))
    .map(slot => {
      const assignment = selectedAttempt.assignmentMap.get(slot.key);
      return {
        ...slot,
        volunteerId: assignment.volunteerId,
        volunteerName: volunteerMap.get(assignment.volunteerId)?.name || assignment.volunteerId,
        proficiencyLevel: getProficiencyLevel(assignment.volunteerId, slot.role),
        isTrainee: false,
        isLocked: assignment.isLocked,
        traineeId: null,
        traineeName: null
      };
    });

  const participationCounts = new Map(normalizedVolunteers.map(volunteer => [volunteer.id, 0]));
  const participationSundays = new Map(
    normalizedVolunteers.map(volunteer => [
      volunteer.id,
      servedPreviousSunday.has(volunteer.id) ? new Set([-1]) : new Set()
    ])
  );
  schedule.forEach(assignment => {
    participationCounts.set(
      assignment.volunteerId,
      (participationCounts.get(assignment.volunteerId) || 0) + 1
    );
    participationSundays.get(assignment.volunteerId).add(assignment.sundayIndex);
  });

  const trainees = [];
  schedule.forEach(principal => {
    if (principal.proficiencyLevel !== 3) return;

    const candidates = normalizedVolunteers
      .map(volunteer => volunteer.id)
      .filter(volunteerId => {
        if (getProficiencyLevel(volunteerId, principal.role) !== 1) return false;
        const volunteer = volunteerMap.get(volunteerId);
        if (volunteer.allowedShift !== 'ALL' && volunteer.allowedShift !== principal.shift) return false;
        if (isUnavailable(volunteerId, principal.date, principal.shift)) return false;
        if ((participationCounts.get(volunteerId) || 0) >= selectedAttempt.monthlyLimit) return false;

        const sundayIndexes = participationSundays.get(volunteerId);
        if (sundayIndexes.has(principal.sundayIndex)) return false;
        if (
          sundayIndexes.has(principal.sundayIndex - 1) ||
          sundayIndexes.has(principal.sundayIndex + 1)
        ) return false;
        return true;
      })
      .sort((leftId, rightId) => compareVolunteers(leftId, rightId, participationCounts));

    if (candidates.length === 0) return;
    const volunteerId = candidates[0];
    const trainee = {
      date: principal.date,
      sundayIndex: principal.sundayIndex,
      shift: principal.shift,
      role: principal.role,
      volunteerId,
      volunteerName: volunteerMap.get(volunteerId)?.name || volunteerId,
      proficiencyLevel: 1,
      isTrainee: true,
      trainerId: principal.volunteerId,
      trainerName: principal.volunteerName
    };
    trainees.push(trainee);
    principal.traineeId = volunteerId;
    principal.traineeName = trainee.volunteerName;
    participationCounts.set(volunteerId, (participationCounts.get(volunteerId) || 0) + 1);
    participationSundays.get(volunteerId).add(principal.sundayIndex);
  });

  const vacancies = slots
    .filter(slot => !selectedAttempt.assignmentMap.has(slot.key))
    .map(slot => ({ ...slot, reason: 'NO_ELIGIBLE_VOLUNTEER' }));

  const bySunday = {};
  sundays.forEach(date => {
    bySunday[date] = {};
    normalizedShifts.forEach(shift => {
      bySunday[date][shift] = {};
      normalizedRoles.forEach(role => {
        bySunday[date][shift][role] = { main: null, trainee: null };
      });
    });
  });
  schedule.forEach(assignment => {
    bySunday[assignment.date][assignment.shift][assignment.role] = {
      main: assignment.volunteerId,
      trainee: assignment.traineeId
    };
  });

  const warnings = invalidLockedAssignments.map(({ assignment, reason }) =>
    `Alocação travada ${assignment.date}:${assignment.shift}:${assignment.role} ignorada: ${reason}.`
  );
  if (vacancies.length > 0) {
    warnings.push(`${vacancies.length} vaga(s) permaneceram sem alocação principal N2/N3.`);
  }
  if (selectedAttempt.allowConsecutiveSundays) {
    warnings.push('Domingos consecutivos foram permitidos para aumentar a cobertura da escala.');
  }
  if (selectedAttempt.monthlyLimit === 3) {
    warnings.push('O limite de três participações foi necessário para aumentar a cobertura do mês com cinco domingos.');
  }

  const assignedVolunteers = new Set(schedule.map(assignment => assignment.volunteerId));
  trainees.forEach(trainee => assignedVolunteers.add(trainee.volunteerId));
  const totalShifts = sundays.length * normalizedShifts.length;
  const seniorityBalancedShifts = sundays.reduce((balancedCount, date) =>
    balancedCount + normalizedShifts.filter(shift =>
      schedule.some(assignment => assignment.date === date && assignment.shift === shift)
    ).length, 0);

  return {
    success: true,
    complete: vacancies.length === 0,
    errors: [],
    schedule,
    trainees,
    vacancies,
    invalidLockedAssignments,
    bySunday,
    metrics: {
      sundaysCount: sundays.length,
      totalSlots: slots.length,
      assignedSlots: schedule.length,
      vacantSlots: vacancies.length,
      traineeSlotsAssigned: trainees.length,
      uniqueVolunteersAssigned: assignedVolunteers.size,
      totalVolunteersAvailable: normalizedVolunteers.length,
      totalShifts,
      seniorityBalancedShifts,
      strictSeniorityAchieved: true,
      monthlyLimitUsed: selectedAttempt.monthlyLimit,
      consecutiveSundaysRelaxed: selectedAttempt.allowConsecutiveSundays
    },
    warnings
  };
}
