import { z } from "zod";
import { jsonError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";
import { SETTINGS, SETTINGS_BY_KEY, parseSetting, validateSetting } from "@/lib/settings";

/**
 * System settings API.
 *
 * Reads never return a secret value: a secret setting is reported as
 * `{ value: null, isSet: true|false }`, so the browser can show "configured"
 * without the credential ever leaving the server. Writes are validated against
 * the registry, and every change is audited with the secret value omitted.
 */
export const GET = withAuth("admin:config", async () => {
  const rows = await prisma.systemSetting.findMany();
  const stored = new Map(rows.map((r) => [r.key, r]));

  const settings = SETTINGS.map((def) => {
    const row = stored.get(def.key);
    const isSet = row !== undefined && row.value !== "";
    return {
      key: def.key,
      label: def.label,
      category: def.category,
      type: def.type,
      options: def.options ?? null,
      help: def.help ?? null,
      secret: def.secret ?? false,
      // A secret is never echoed; a non-secret falls back to its default.
      value: def.secret ? null : parseSetting(def, row?.value),
      isSet,
      updatedAt: row?.updatedAt ?? null,
    };
  });

  return jsonOk({ settings });
});

const writeSchema = z.object({
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

/** Applies a batch of setting changes. Unknown keys and invalid values are rejected. */
export const PATCH = withAuth("admin:config", async ({ actor, req, ip, userAgent }) => {
  const body = parseBody(writeSchema, await req.json());

  const problems: string[] = [];
  const accepted: { def: (typeof SETTINGS)[number]; text: string }[] = [];

  for (const [key, raw] of Object.entries(body.values)) {
    const def = SETTINGS_BY_KEY.get(key);
    if (!def) {
      problems.push(`Unknown setting "${key}"`);
      continue;
    }
    const error = validateSetting(def, raw);
    if (error) {
      problems.push(error);
      continue;
    }
    const text = typeof raw === "boolean" ? String(raw) : String(raw);
    // An empty value for a secret means "leave it as it is", not "clear it".
    if (def.secret && text === "") continue;
    accepted.push({ def, text });
  }

  if (problems.length > 0) return jsonError(problems.join("; "), 422);

  await prisma.$transaction(async (tx) => {
    for (const { def, text } of accepted) {
      await tx.systemSetting.upsert({
        where: { key: def.key },
        update: { value: text, updatedBy: actor.id },
        create: {
          key: def.key,
          value: text,
          type: def.type,
          isSecret: def.secret ?? false,
          label: def.label,
          category: def.category,
          updatedBy: actor.id,
        },
      });

      await writeAudit(
        {
          actorId: actor.id,
          actorEmail: actor.email,
          action: "SETTING_UPDATED",
          entityType: "SystemSetting",
          entityId: def.key,
          // A secret's value is never recorded; only the fact that it changed.
          after: { key: def.key, value: def.secret ? "[redacted]" : text },
          ip,
          userAgent,
        },
        tx,
      );
    }
  });

  return jsonOk({ updated: accepted.map((a) => a.def.key) });
});
