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
  shifts = DEFAULT_SHIFTS
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
      return { id: String(v), name: String(v) };
    }
    const id = String(v.id || v.volunteerId || v.volunteer_id);
    const name = v.name || id;
    return { id, name };
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

  // Run solver with strict seniority check first, then fallback without strict seniority requirement
  let solution = runSolver(true);
  let strictSeniorityAchieved = true;

  if (!solution) {
    strictSeniorityAchieved = false;
    solution = runSolver(false);
  }

  if (!solution) {
    return {
      success: false,
      errors: ['Unable to generate a schedule satisfying all hard constraints. Please check volunteer availability and proficiencies.'],
      schedule: null
    };
  }

  // Format schedule output
  const schedule = solution.map(s => ({
    date: s.date,
    sundayIndex: s.sundayIndex,
    shift: s.shift,
    role: s.role,
    volunteerId: s.volunteerId,
    volunteerName: volunteerMap.get(s.volunteerId)?.name || s.volunteerId,
    proficiencyLevel: profMap.get(s.volunteerId)?.get(s.role) || 1
  }));

  // Build bySunday hierarchy
  const bySunday = {};
  sundays.forEach(d => {
    bySunday[d] = {};
    normalizedShifts.forEach(s => {
      bySunday[d][s] = {};
    });
  });
  schedule.forEach(item => {
    bySunday[item.date][item.shift][item.role] = item.volunteerId;
  });

  // Calculate metrics and warnings
  const warnings = [];
  const assignedVolunteers = new Set(schedule.map(s => s.volunteerId));
  
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
    bySunday,
    metrics: {
      sundaysCount: sundays.length,
      totalSlots,
      assignedSlots: schedule.length,
      uniqueVolunteersAssigned: assignedVolunteers.size,
      totalVolunteersAvailable: normalizedVolunteers.length,
      totalShifts,
      seniorityBalancedShifts,
      strictSeniorityAchieved
    },
    warnings
  };

  /**
   * Internal backtracking solver
   */
  function runSolver(requireStrictSeniority) {
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

    function isEligible(vId, slot) {
      // Hard Constraint 1: Proficiency level >= 1
      const lvl = profMap.get(vId)?.get(slot.role) || 0;
      if (lvl < 1) return false;

      // Hard Constraint 2: Unavailability
      if (unavailSet.has(`${vId}:${slot.date}:${slot.shift}`) || unavailSet.has(`${vId}:${slot.date}`)) {
        return false;
      }

      // Hard Constraint 3: Max 2 assignments per month
      const count = volunteerMonthCount.get(vId) || 0;
      if (count >= 2) return false;

      // Hard Constraint 4: Max 1 shift per Sunday
      const sunSet = volunteerAssignedSundays.get(vId);
      if (sunSet.has(slot.sundayIndex)) return false;

      // Hard Constraint 5: No 2 consecutive Sundays (1-week gap)
      if (sunSet.has(slot.sundayIndex - 1) || sunSet.has(slot.sundayIndex + 1)) return false;

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
        const aLvl = profMap.get(aId)?.get(slot.role) || 1;
        const bLvl = profMap.get(bId)?.get(slot.role) || 1;

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
