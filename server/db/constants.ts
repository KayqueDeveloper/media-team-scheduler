// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
export const ROLES = Object.freeze({
  FREEHAND: 'FREEHAND',
  VMIX: 'VMIX',
  FIXED_CAM: 'FIXED_CAM',
  SWITCHER: 'SWITCHER',
  JIB: 'JIB',
  COORDINATOR: 'COORDINATOR'
});

export const ROLE_LIST = Object.freeze(Object.values(ROLES));

export const SHIFTS = Object.freeze({
  MORNING: 'MORNING',
  NIGHT: 'NIGHT'
});

export const SHIFT_LIST = Object.freeze(Object.values(SHIFTS));

export const PROFICIENCY_LEVELS = Object.freeze({
  NONE: 0,
  TRAINING: 1,
  QUALIFIED: 2,
  SENIOR: 3
});

export const SCHEDULE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED'
});
