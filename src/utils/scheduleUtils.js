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
