import { z } from 'zod';

export const ROLE_IDS = ['FREEHAND', 'VMIX', 'FIXED_CAM', 'SWITCHER', 'JIB', 'COORDINATOR'] as const;
export const SHIFT_IDS = ['MORNING', 'NIGHT'] as const;

export const roleSchema = z.enum(ROLE_IDS);
export const shiftSchema = z.enum(SHIFT_IDS);
export const availabilityShiftSchema = z.enum([...SHIFT_IDS, 'ALL']);
export const proficiencyLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const entityIdSchema = z.number().int().positive();

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    if (year === undefined || month === undefined || day === undefined) return false;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    );
  }, 'Data civil inválida.');

export const scheduleAssignmentSchema = z.object({
  date: localDateSchema,
  shift: shiftSchema,
  role: roleSchema,
  volunteerId: entityIdSchema,
  isTrainee: z.boolean().default(false)
});

export const volunteerSchema = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1),
  email: z.email().nullable().optional(),
  phone: z.string().nullable().optional(),
  active: z.boolean(),
  allowedShift: availabilityShiftSchema,
  proficiencies: z.partialRecord(roleSchema, proficiencyLevelSchema).default({})
});

export const unavailabilitySchema = z.object({
  id: entityIdSchema.optional(),
  volunteerId: entityIdSchema,
  date: localDateSchema,
  shift: availabilityShiftSchema,
  reason: z.string().nullable().optional()
});

export const scheduleDraftSchema = z.object({
  id: entityIdSchema.nullable().optional(),
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
  status: z.enum(['DRAFT', 'PUBLISHED']),
  assignments: z.array(scheduleAssignmentSchema),
  lockedSlots: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([])
});

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
  requestId: z.string().min(1)
});

export type Role = z.infer<typeof roleSchema>;
export type Shift = z.infer<typeof shiftSchema>;
export type AvailabilityShift = z.infer<typeof availabilityShiftSchema>;
export type ProficiencyLevel = z.infer<typeof proficiencyLevelSchema>;
export type LocalDate = z.infer<typeof localDateSchema>;
export type ScheduleAssignment = z.infer<typeof scheduleAssignmentSchema>;
export type Volunteer = z.infer<typeof volunteerSchema>;
export type Unavailability = z.infer<typeof unavailabilitySchema>;
export type ScheduleDraft = z.infer<typeof scheduleDraftSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
