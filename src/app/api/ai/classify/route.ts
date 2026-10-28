import { z } from "zod";
import { jsonOk, parseBody, withAuth } from "@/lib/api";
import { classifyApplication } from "@/lib/ai";

const schema = z.object({
  intakeRequested: z.coerce.number().int().positive().optional().nullable(),
  existingIntake: z.coerce.number().int().positive().optional().nullable(),
  hasExistingApproval: z.boolean().optional(),
  isNewInstitution: z.boolean().optional(),
  courseName: z.string().max(160).optional().nullable(),
});

/**
 * Suggests an application type and queue. Suggestion only: the officer picks
 * the final value and nothing here changes a stored stage or status.
 */
export const POST = withAuth("application:read", async ({ req }) => {
  const body = parseBody(schema, await req.json());
  return jsonOk({ suggestion: classifyApplication(body) });
});
