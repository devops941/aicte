import { z } from "zod";

/**
 * Request payload schemas for the administrative APIs.
 *
 * Every object here is strict: an unknown or misspelt field is rejected rather
 * than silently dropped. That matters for an approval portal because a caller
 * that sends `isActiv: false` should be told the write was refused, not shown a
 * success while the account stays enabled. Zod's default behaviour would strip
 * the field and answer 200.
 */

export const ROLE = z.enum([
  "INSTITUTION_ADMIN",
  "REGIONAL_OFFICER",
  "BUREAU_OFFICER",
  "EVC_MEMBER",
  "COMPETENT_AUTHORITY",
  "SYSTEM_ADMIN",
  "SUPER_ADMIN",
  "AUDITOR",
]);

export const userCreateSchema = z.strictObject({
  email: z.string().email().max(160),
  name: z.string().min(2).max(120),
  role: ROLE,
  password: z.string().min(8).max(200),
  regionId: z.string().uuid().optional().nullable(),
  institutionId: z.string().uuid().optional().nullable(),
  designation: z.string().max(120).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
});

export const userUpdateSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().min(2).max(120).optional(),
  role: ROLE.optional(),
  regionId: z.string().uuid().optional().nullable(),
  institutionId: z.string().uuid().optional().nullable(),
  designation: z.string().max(120).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  isActive: z.boolean().optional(),
  reason: z.string().max(500).optional().nullable(),
});

export const userPasswordSchema = z.strictObject({
  id: z.string().uuid(),
  /** Omitted means "generate one"; the value is returned exactly once. */
  password: z.string().min(8).max(200).optional(),
});

export const institutionCreateSchema = z.strictObject({
  aicteId: z.string().min(3).max(40),
  name: z.string().min(3).max(200),
  state: z.string().min(2).max(80),
  district: z.string().max(80).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  regionId: z.string().uuid(),
  contactEmail: z.string().email().max(160).optional().nullable(),
  contactPhone: z.string().max(30).optional().nullable(),
});

export const institutionUpdateSchema = institutionCreateSchema.partial().extend({
  id: z.string().uuid(),
  isActive: z.boolean().optional(),
  reason: z.string().max(500).optional().nullable(),
});

export const holidayCreateSchema = z.strictObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD"),
  label: z.string().min(2).max(120),
  regionId: z.string().uuid().optional().nullable(),
});

export const escalationPolicySchema = z.strictObject({
  id: z.string().uuid().optional(),
  level: z.coerce.number().int().min(1).max(10),
  afterWorkingDays: z.coerce.number().int().min(0).max(365),
  targetRole: z.enum([
    "INSTITUTION_ADMIN",
    "REGIONAL_OFFICER",
    "BUREAU_OFFICER",
    "EVC_MEMBER",
    "COMPETENT_AUTHORITY",
    "SYSTEM_ADMIN",
    "AUDITOR",
  ]),
  channel: z.enum(["IN_APP", "EMAIL"]),
  scope: z
    .enum(["NEW_ENGINEERING", "EXTENSION_OF_APPROVAL", "INCREASE_IN_INTAKE", "NEW_COURSE", "CLOSURE", "OTHERS"])
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
  description: z.string().max(300).optional().nullable(),
});

export const maintenanceActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("retry-notification"), id: z.string().uuid() }),
  z.strictObject({ action: z.literal("retry-all-failed") }),
  z.strictObject({ action: z.literal("verify-chain") }),
]);
