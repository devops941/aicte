import { z } from "zod";

/**
 * Payload schemas for EVC scheduling.
 *
 * They are strict so a misspelt or unknown field is rejected rather than
 * silently dropped — a caller that sends `memberIds` under the wrong name would
 * otherwise get a 201 and a visit with no committee. `scheduledFor` is parsed
 * as a real date: the previous `z.string().min(8)` accepted anything longer
 * than eight characters, and `new Date("not-a-date")` produced an Invalid Date
 * that reached Prisma and surfaced as a 500.
 */

/** ISO date-time, normalised to a Date. Rejects values a Date cannot represent. */
const isoDateTime = z
  .string()
  .trim()
  .min(1)
  .refine((v) => !Number.isNaN(new Date(v).getTime()), { message: "Enter a valid date and time" })
  .transform((v) => new Date(v));

export const evcStatus = z.enum(["PROPOSED", "SCHEDULED", "COMPLETED", "CANCELLED"]);

export const evcCreateSchema = z.strictObject({
  applicationId: z.string().uuid(),
  scheduledFor: isoDateTime,
  memberIds: z.array(z.string().uuid()).min(1, "Select at least one committee member").max(8),
  venue: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const evcUpdateSchema = z.strictObject({
  id: z.string().uuid(),
  scheduledFor: isoDateTime.optional(),
  status: evcStatus.optional(),
  memberIds: z.array(z.string().uuid()).min(1).max(8).optional(),
  venue: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type EvcCreateInput = z.infer<typeof evcCreateSchema>;
export type EvcUpdateInput = z.infer<typeof evcUpdateSchema>;
