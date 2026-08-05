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
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCDay() === 0) { // Sunday
      const yStr = d.getUTCFullYear();
      const mStr = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dStr = String(d.getUTCDate()).padStart(2, '0');
      sundays.push(`${yStr}-${mStr}-${dStr}`);
    }
  }
  return sundays;
}

/**
 * Gets the date string ('YYYY-MM-DD') of the Sunday preceding the given Sunday date.
 */
export function getPreviousSundayDate(sundayDateStr) {
  const d = new Date(Date.parse(sundayDateStr + 'T00:00:00Z'));
  d.setUTCDate(d.getUTCDate() - 7);
  const yStr = d.getUTCFullYear();
  const mStr = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dStr = String(d.getUTCDate()).padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

/**
 * Generates an optimized monthly broadcast schedule.
 *
 * @param {Object} params
 * @param {number} params.year - Target year (e.g. 2026)
 * @param {number} params.month - Target month (1-indexed, e.g. 8 for August)
 * @param {Array} params.volunteers - List of volunteers [{ id, name }, ...] or ['v1', ...]
 * @param {Array|Object} params.proficiencies - List of [{ volunteerId, role, level }] or map { vId: { role: level } }
 * @param {Array} [params.unavailabilities] - List of [{ volunteerId, date, shift }]
 * @param {Array} [params.pastAssignments] - List of past assignments [{ volunteerId, date, shift, role }]
 * @param {Array} [params.roles] - List of roles (default 6 broadcast roles)
 * @param {Array} [params.shifts] - List of shifts (default morning, evening)
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
  lockedAssignments = [],
  allowConsecutiveSundays = false,
  force = false
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

  // Normalize volunteers
  const normalizedVolunteers = volunteers.map(v => {
    if (typeof v === 'string' || typeof v === 'number') {
      return { id: String(v), name: String(v), allowedShift: 'ALL' };
    }
    const id = String(v.id || v.volunteerId || v.volunteer_id);
    const name = v.name || id;
    const allowedShift = v.allowedShift || v.preferredShift || (v.shifts && v.shifts.length === 1 ? v.shifts[0] : 'ALL');
    return { id, name, allowedShift };
  });

  if (normalizedVolunteers.length === 0) {
    return {
      success: false,
      errors: ['No volunteers provided.'],
      schedule: null
    };
  }

  const volunteerMap = new Map();
  normalizedVolunteers.forEach(v => volunteerMap.set(v.id, v));

  // Normalize roles & shifts
  const normalizedRoles = roles.map(r => String(r.id || r).toUpperCase());
  const normalizedShifts = shifts.map(s => String(s.id || s).toUpperCase());

  // Normalize proficiencies: Map<volunteerId, Map<role, level>>
  const profMap = new Map();
  normalizedVolunteers.forEach(v => profMap.set(v.id, new Map()));

  // Populate from embedded volunteer proficiencies
  volunteers.forEach(v => {
    const vId = String(v.id || v.volunteerId || v.volunteer_id || '');
    if (v.proficiencies && typeof v.proficiencies === 'object' && profMap.has(vId)) {
      Object.entries(v.proficiencies).forEach(([r, lvl]) => {
        profMap.get(vId).set(String(r).toUpperCase(), Number(lvl));
      });
    }
  });

  if (Array.isArray(proficiencies)) {
    proficiencies.forEach(p => {
      const vId = String(p.volunteerId || p.volunteer_id || p.vId || '');
      const role = String(p.role || p.roleId || p.role_id || '').toUpperCase();
      const level = Number(p.level || p.proficiency || 0);
      if (vId && role && profMap.has(vId)) {
        profMap.get(vId).set(role, level);
      }
    });
  } else if (proficiencies && typeof proficiencies === 'object') {
    Object.entries(proficiencies).forEach(([vId, roleObj]) => {
      const vIdStr = String(vId);
      if (profMap.has(vIdStr) && typeof roleObj === 'object') {
        Object.entries(roleObj).forEach(([r, lvl]) => {
          profMap.get(vIdStr).set(String(r).toUpperCase(), Number(lvl));
        });
      }
    });
  }

  const getProficiencyLevel = (vId, role) => profMap.get(vId)?.get(role) || 0;

  // Normalize unavailabilities: Set of "vId:date" or "vId:date:shift"
  const unavailSet = new Set();
  (unavailabilities || []).forEach(u => {
    const vId = String(u.volunteerId || u.volunteer_id || u.vId || '');
    const date = u.date;
    const shift = u.shift ? String(u.shift).toUpperCase() : null;
    if (vId && date) {
      if (shift) {
        unavailSet.add(`${vId}:${date}:${shift}`);
      } else {
        // Unavailable all day
        unavailSet.add(`${vId}:${date}`);
        normalizedShifts.forEach(s => unavailSet.add(`${vId}:${date}:${s}`));
      }
    }
  });

  // Calculate past stats for equity scoring and consecutive Sunday check
  const pastCountMap = new Map();
  const lastPastDateMap = new Map();
  normalizedVolunteers.forEach(v => {
    pastCountMap.set(v.id, 0);
    lastPastDateMap.set(v.id, null);
  });

  const prevSundayDate = getPreviousSundayDate(sundays[0]);
  const servedPrevSunday = new Set();

  (pastAssignments || []).forEach(pa => {
    const vId = String(pa.volunteerId || pa.volunteer_id || pa.vId || '');
    if (volunteerMap.has(vId)) {
      pastCountMap.set(vId, (pastCountMap.get(vId) || 0) + 1);
      const currLast = lastPastDateMap.get(vId);
      if (!currLast || pa.date > currLast) {
        lastPastDateMap.set(vId, pa.date);
      }
      if (pa.date === prevSundayDate) {
        servedPrevSunday.add(vId);
      }
    }
  });

  // Build slots list
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

  const totalSlots = slots.length;

  let solution = null;
  let strictSeniorityAchieved = true;
  let consecutiveSundaysRelaxed = false;

  if (force || allowConsecutiveSundays) {
    solution = runSolver(true, true, 3) || runSolver(false, true, 3) || runSolver(false, true, 4);
    consecutiveSundaysRelaxed = true;
  } else {
    // Standard Solver: Pass 1 (Strict Seniority, No Consecutive)
    solution = runSolver(true, false, 2);

    // Pass 2: Relaxed Seniority, No Consecutive
    if (!solution) {
      strictSeniorityAchieved = false;
      solution = runSolver(false, false, 2);
    }

    // Pass 3: Forced Fallback (Allow Consecutive Sundays if standard mode failed)
    if (!solution) {
      solution = runSolver(true, true, 3) || runSolver(false, true, 3) || runSolver(false, true, 4);
      if (solution) {
        consecutiveSundaysRelaxed = true;
      }
    }
  }

  if (!solution) {
    return {
      success: false,
      errors: ['Não foi possível gerar a escala completa nem com a liberação de domingos consecutivos. Cadastre mais voluntários ou revise indisponibilidades.'],
      schedule: null
    };
  }

  // Trainee assignment phase for slots with main operators >= N2
  const traineeAssignments = assignTraineesToSolution(solution, consecutiveSundaysRelaxed);

  // Format schedule output
  const schedule = solution.map(s => {
    const trainee = traineeAssignments.find(t => t.date === s.date && t.shift === s.shift && t.role === s.role);
    return {
      date: s.date,
      sundayIndex: s.sundayIndex,
      shift: s.shift,
      role: s.role,
      volunteerId: s.volunteerId,
      volunteerName: volunteerMap.get(s.volunteerId)?.name || s.volunteerId,
      proficiencyLevel: profMap.get(s.volunteerId)?.get(s.role) || 1,
      isTrainee: false,
      traineeId: trainee ? trainee.volunteerId : null,
      traineeName: trainee ? trainee.volunteerName : null
    };
  });

  // Build bySunday hierarchy
  const bySunday = {};
  sundays.forEach(d => {
    bySunday[d] = {};
    normalizedShifts.forEach(s => {
      bySunday[d][s] = {};
    });
  });
  schedule.forEach(item => {
    bySunday[item.date][item.shift][item.role] = {
      main: item.volunteerId,
      trainee: item.traineeId || null
    };
  });

  // Calculate metrics and warnings
  const warnings = [];
  const assignedVolunteers = new Set(schedule.map(s => s.volunteerId));
  traineeAssignments.forEach(t => assignedVolunteers.add(t.volunteerId));
  
  let seniorityBalancedShifts = 0;
  const totalShifts = sundays.length * normalizedShifts.length;

  sundays.forEach(date => {
    normalizedShifts.forEach(shift => {
      const shiftAssignments = schedule.filter(s => s.date === date && s.shift === shift);
      const hasSenior = shiftAssignments.some(s => s.proficiencyLevel >= 2);
      if (hasSenior) {
        seniorityBalancedShifts++;
      } else {
        warnings.push(`Shift ${shift} on ${date} has no volunteer with proficiency level >= 2.`);
      }
    });
  });

  return {
    success: true,
    schedule,
    trainees: traineeAssignments,
    bySunday,
    metrics: {
      sundaysCount: sundays.length,
      totalSlots,
      assignedSlots: schedule.length,
      traineeSlotsAssigned: traineeAssignments.length,
      uniqueVolunteersAssigned: assignedVolunteers.size,
      totalVolunteersAvailable: normalizedVolunteers.length,
      totalShifts,
      seniorityBalancedShifts,
      strictSeniorityAchieved
    },
    warnings
  };

  /**
   * Helper to assign N1 trainees to slots with main operators >= N2
   */
  function assignTraineesToSolution(mainSolution, allowConsecutive) {
    const volAssignedSundays = new Map();
    const volMonthCount = new Map();

    normalizedVolunteers.forEach(v => {
      const sunSet = new Set();
      if (servedPrevSunday.has(v.id)) {
        sunSet.add(-1);
      }
      volAssignedSundays.set(v.id, sunSet);
      volMonthCount.set(v.id, 0);
    });

    // Populate with mainSolution assignments
    mainSolution.forEach(s => {
      if (s.volunteerId) {
        volMonthCount.set(s.volunteerId, (volMonthCount.get(s.volunteerId) || 0) + 1);
        if (volAssignedSundays.has(s.volunteerId)) {
          volAssignedSundays.get(s.volunteerId).add(s.sundayIndex);
        }
      }
    });

    const traineeAssignments = [];

    for (const slot of mainSolution) {
      const mainVolId = slot.volunteerId;
      if (!mainVolId) continue;

      const mainLevel = getProficiencyLevel(mainVolId, slot.role);
      if (mainLevel < 2) continue; // Only N2+ can mentor trainees

      const eligibleTrainees = normalizedVolunteers.filter(v => {
        // Must be level 1 (N1) for this specific role
        const level = getProficiencyLevel(v.id, slot.role);
        if (level !== 1) return false;

        // Cannot be the main volunteer
        if (v.id === mainVolId) return false;

        // Shift preference
        if (v.allowedShift && v.allowedShift !== 'ALL' && v.allowedShift !== slot.shift) {
          return false;
        }

        // Unavailability
        if (unavailSet.has(`${v.id}:${slot.date}:${slot.shift}`) || unavailSet.has(`${v.id}:${slot.date}`)) {
          return false;
        }

        // Max assignments per month limit
        const currentCount = volMonthCount.get(v.id) || 0;
        if (currentCount >= 3) return false;

        // Max 1 shift per Sunday (cannot serve as main or trainee on same Sunday twice)
        const sunSet = volAssignedSundays.get(v.id);
        if (sunSet && sunSet.has(slot.sundayIndex)) return false;

        // No 2 consecutive Sundays (1-week gap) unless allowConsecutive is true
        if (!allowConsecutive && sunSet) {
          if (sunSet.has(slot.sundayIndex - 1) || sunSet.has(slot.sundayIndex + 1)) return false;
        }

        return true;
      });

      // Sort candidates by equity
      eligibleTrainees.sort((a, b) => {
        const aCount = volMonthCount.get(a.id) || 0;
        const bCount = volMonthCount.get(b.id) || 0;
        if (aCount !== bCount) return aCount - bCount;

        const aPast = pastCountMap.get(a.id) || 0;
        const bPast = pastCountMap.get(b.id) || 0;
        if (aPast !== bPast) return aPast - bPast;

        const aLast = lastPastDateMap.get(a.id) || '';
        const bLast = lastPastDateMap.get(b.id) || '';
        if (aLast !== bLast) return aLast.localeCompare(bLast);

        return a.id.localeCompare(b.id);
      });

      if (eligibleTrainees.length > 0) {
        const selectedTrainee = eligibleTrainees[0];
        traineeAssignments.push({
          date: slot.date,
          sundayIndex: slot.sundayIndex,
          shift: slot.shift,
          role: slot.role,
          volunteerId: selectedTrainee.id,
          volunteerName: selectedTrainee.name,
          proficiencyLevel: 1,
          isTrainee: true,
          trainerId: mainVolId,
          trainerName: volunteerMap.get(mainVolId)?.name || mainVolId
        });

        volMonthCount.set(selectedTrainee.id, (volMonthCount.get(selectedTrainee.id) || 0) + 1);
        volAssignedSundays.get(selectedTrainee.id).add(slot.sundayIndex);
      }
    }

    return traineeAssignments;
  }

  /**
   * Internal backtracking solver
   */
  function runSolver(requireStrictSeniority, allowConsecutive = false, maxPerMonth = 2) {
    // Search state
    const assignmentMap = new Map(); // slot.key -> volunteerId
    const volunteerMonthCount = new Map(); // vId -> count
    const volunteerAssignedSundays = new Map(); // vId -> Set of sundayIndexes
    const shiftSeniorCount = new Map(); // `${date}:${shift}` -> count of level >= 2

    normalizedVolunteers.forEach(v => {
      volunteerMonthCount.set(v.id, 0);
      const sunSet = new Set();
      if (servedPrevSunday.has(v.id)) {
        sunSet.add(-1); // served on last Sunday of previous month
      }
      volunteerAssignedSundays.set(v.id, sunSet);
    });

    sundays.forEach(d => {
      normalizedShifts.forEach(s => {
        shiftSeniorCount.set(`${d}:${s}`, 0);
      });
    });

    const unassignedSlotKeys = new Set(slots.map(s => s.key));

    // Apply pre-assigned / locked slots
    (lockedAssignments || []).forEach(locked => {
      const vId = String(locked.volunteerId || locked.vId || '');
      const date = locked.date;
      const shift = String(locked.shift || '').toUpperCase();
      const role = String(locked.role || '').toUpperCase();
      const key = `${date}:${shift}:${role}`;

      if (vId && unassignedSlotKeys.has(key)) {
        const slot = slots.find(s => s.key === key);
        if (slot) {
          unassignedSlotKeys.delete(key);
          assignmentMap.set(key, vId);
          volunteerMonthCount.set(vId, (volunteerMonthCount.get(vId) || 0) + 1);
          if (volunteerAssignedSundays.has(vId)) {
            volunteerAssignedSundays.get(vId).add(slot.sundayIndex);
          }
          const lvl = getProficiencyLevel(vId, role);
          if (lvl >= 2) {
            const shiftKey = `${date}:${shift}`;
            shiftSeniorCount.set(shiftKey, (shiftSeniorCount.get(shiftKey) || 0) + 1);
          }
        }
      }
    });

    function isEligible(vId, slot) {
      // Hard Constraint 0: Allowed shift check
      const volObj = volunteerMap.get(vId);
      if (volObj && volObj.allowedShift && volObj.allowedShift !== 'ALL') {
        if (volObj.allowedShift !== slot.shift) return false;
      }

      // Hard Constraint 1: Proficiency level (ADR 0002: Critical roles VMIX and SWITCHER require level >= 2)
      const minRequiredLevel = (slot.role === 'VMIX' || slot.role === 'SWITCHER') ? 2 : 1;
      const lvl = getProficiencyLevel(vId, slot.role);
      if (lvl < minRequiredLevel) return false;

      // Hard Constraint 2: Unavailability
      if (unavailSet.has(`${vId}:${slot.date}:${slot.shift}`) || unavailSet.has(`${vId}:${slot.date}`)) {
        return false;
      }

      // Hard Constraint 3: Max assignments per month
      const count = volunteerMonthCount.get(vId) || 0;
      if (count >= maxPerMonth) return false;

      // Hard Constraint 4: Max 1 shift per Sunday
      const sunSet = volunteerAssignedSundays.get(vId);
      if (sunSet.has(slot.sundayIndex)) return false;

      // Hard Constraint 5: No 2 consecutive Sundays (1-week gap) unless allowConsecutive is true
      if (!allowConsecutive) {
        if (sunSet.has(slot.sundayIndex - 1) || sunSet.has(slot.sundayIndex + 1)) return false;
      }

      return true;
    }

    function getCandidates(slot) {
      const candidates = [];
      for (const v of normalizedVolunteers) {
        if (isEligible(v.id, slot)) {
          candidates.push(v.id);
        }
      }

      const shiftKey = `${slot.date}:${slot.shift}`;
      const currentSeniorCount = shiftSeniorCount.get(shiftKey) || 0;

      // Sort candidates by soft constraint priorities
      candidates.sort((aId, bId) => {
        const aLvl = getProficiencyLevel(aId, slot.role) || 1;
        const bLvl = getProficiencyLevel(bId, slot.role) || 1;

        const aIsSenior = aLvl >= 2 ? 1 : 0;
        const bIsSenior = bLvl >= 2 ? 1 : 0;

        // If shift currently lacks senior volunteer, prioritize senior volunteers
        if (currentSeniorCount === 0 && aIsSenior !== bIsSenior) {
          return bIsSenior - aIsSenior;
        }

        // Equity score 1: Prioritize volunteers with fewer month assignments
        const aMonthCount = volunteerMonthCount.get(aId) || 0;
        const bMonthCount = volunteerMonthCount.get(bId) || 0;
        if (aMonthCount !== bMonthCount) {
          return aMonthCount - bMonthCount;
        }

        // Equity score 2: Prioritize volunteers with fewer past assignments
        const aPast = pastCountMap.get(aId) || 0;
        const bPast = pastCountMap.get(bId) || 0;
        if (aPast !== bPast) {
          return aPast - bPast;
        }

        // Equity score 3: Prioritize volunteers who haven't served recently
        const aLast = lastPastDateMap.get(aId) || '';
        const bLast = lastPastDateMap.get(bId) || '';
        if (aLast !== bLast) {
          return aLast.localeCompare(bLast);
        }

        // Tie-breaker
        return aId.localeCompare(bId);
      });

      return candidates;
    }

    function backtrack() {
      if (unassignedSlotKeys.size === 0) {
        // Solution found! Check strict seniority requirement if enforced
        if (requireStrictSeniority) {
          for (const [, count] of shiftSeniorCount.entries()) {
            if (count === 0) return false;
          }
        }
        return true;
      }

      // Dynamic MRV (Minimum Remaining Values): Pick slot with fewest candidates
      let bestSlot = null;
      let minCandidates = Infinity;
      let bestCandidateList = null;

      for (const slotKey of unassignedSlotKeys) {
        const slot = slots.find(s => s.key === slotKey);
        const candidates = getCandidates(slot);

        if (candidates.length === 0) {
          // Dead end
          return false;
        }

        if (candidates.length < minCandidates) {
          minCandidates = candidates.length;
          bestSlot = slot;
          bestCandidateList = candidates;
        }
      }

      // Try candidates for bestSlot
      unassignedSlotKeys.delete(bestSlot.key);
      const shiftKey = `${bestSlot.date}:${bestSlot.shift}`;

      for (const vId of bestCandidateList) {
        const lvl = profMap.get(vId)?.get(bestSlot.role) || 1;
        const isSenior = lvl >= 2;

        // Apply state
        assignmentMap.set(bestSlot.key, vId);
        volunteerMonthCount.set(vId, (volunteerMonthCount.get(vId) || 0) + 1);
        volunteerAssignedSundays.get(vId).add(bestSlot.sundayIndex);
        if (isSenior) {
          shiftSeniorCount.set(shiftKey, (shiftSeniorCount.get(shiftKey) || 0) + 1);
        }

        if (backtrack()) {
          return true;
        }

        // Revert state
        assignmentMap.delete(bestSlot.key);
        volunteerMonthCount.set(vId, volunteerMonthCount.get(vId) - 1);
        volunteerAssignedSundays.get(vId).delete(bestSlot.sundayIndex);
        if (isSenior) {
          shiftSeniorCount.set(shiftKey, shiftSeniorCount.get(shiftKey) - 1);
        }
      }

      unassignedSlotKeys.add(bestSlot.key);
      return false;
    }

    const success = backtrack();
    if (!success) return null;

    const result = [];
    for (const slot of slots) {
      result.push({
        ...slot,
        volunteerId: assignmentMap.get(slot.key)
      });
    }

    return result;
  }
}
