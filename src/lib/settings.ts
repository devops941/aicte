import { prisma } from "@/lib/db";

/**
 * Registry of configurable system settings.
 *
 * The registry is the single source of truth for what may be changed, what type
 * a value must have, and whether it is secret. The settings API validates every
 * write against it, so an unknown key or a wrongly typed value is rejected at
 * the boundary rather than surfacing later as a confusing failure.
 *
 * `secret: true` means the value must never be returned to a client in plain
 * text — the API reports only whether it is set. Credentials for SMTP live here
 * so an administrator can rotate them without a redeploy, but they are stored in
 * the database, not in the repository.
 */

export type SettingType = "string" | "number" | "boolean" | "enum";

export type SettingDef = {
  key: string;
  type: SettingType;
  label: string;
  category: "branding" | "time" | "notifications" | "email" | "storage" | "security" | "integrations" | "maintenance";
  default: string;
  options?: string[];
  secret?: boolean;
  help?: string;
  min?: number;
  max?: number;
};

export const SETTINGS: SettingDef[] = [
  { key: "APP_NAME", type: "string", label: "Application name", category: "branding", default: "AICTE Portal" },
  { key: "APP_ORG", type: "string", label: "Organisation name", category: "branding", default: "All India Council for Technical Education" },

  {
    key: "TIME_ZONE",
    type: "enum",
    label: "Display time zone",
    category: "time",
    default: "Asia/Kolkata",
    options: ["Asia/Kolkata", "UTC", "Asia/Dubai", "Europe/London", "America/New_York"],
    help: "Timestamps are stored in UTC and rendered in this zone.",
  },

  {
    key: "SLA_DUE_SOON_PERCENT",
    type: "number",
    label: "Due-soon threshold (%)",
    category: "notifications",
    default: "80",
    min: 10,
    max: 99,
    help: "A case is marked due soon once this share of its allowance is used.",
  },
  { key: "NOTIFY_EMAIL_ENABLED", type: "boolean", label: "Send email notifications", category: "notifications", default: "true" },

  { key: "SMTP_HOST", type: "string", label: "SMTP host", category: "email", default: "" },
  { key: "SMTP_PORT", type: "number", label: "SMTP port", category: "email", default: "587", min: 1, max: 65535 },
  { key: "SMTP_FROM", type: "string", label: "From address", category: "email", default: "" },
  { key: "FROM_NAME", type: "string", label: "From name", category: "email", default: "AICTE" },
  { key: "SMTP_USER", type: "string", label: "SMTP username", category: "email", default: "" },
  {
    key: "SMTP_PASS",
    type: "string",
    label: "SMTP password",
    category: "email",
    default: "",
    secret: true,
    help: "Write-only. The stored value is never returned to the browser.",
  },

  {
    key: "STORAGE_DRIVER",
    type: "enum",
    label: "File storage driver",
    category: "storage",
    default: "local",
    options: ["local", "imagekit"],
  },
  { key: "MAX_UPLOAD_MB", type: "number", label: "Maximum upload size (MB)", category: "storage", default: "10", min: 1, max: 100 },

  {
    key: "SESSION_MAX_AGE_HOURS",
    type: "number",
    label: "Session lifetime (hours)",
    category: "security",
    default: "8",
    min: 1,
    max: 72,
  },
  {
    key: "LOGIN_LOCK_THRESHOLD",
    type: "number",
    label: "Failed sign-ins before lockout",
    category: "security",
    default: "5",
    min: 3,
    max: 20,
  },

  { key: "AI_PROVIDER", type: "enum", label: "Advisory engine", category: "integrations", default: "rules", options: ["rules", "openai"] },

  {
    key: "MAINTENANCE_MODE",
    type: "boolean",
    label: "Maintenance mode",
    category: "maintenance",
    default: "false",
    help: "When on, the banner warns users that maintenance is in progress. It does not lock anyone out.",
  },
];

export const SETTINGS_BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));

/** Parses a stored string into its declared type. Falls back to the default. */
export function parseSetting(def: SettingDef, raw: string | undefined): string | number | boolean {
  const value = raw ?? def.default;
  switch (def.type) {
    case "number": {
      const n = Number(value);
      return Number.isFinite(n) ? n : Number(def.default);
    }
    case "boolean":
      return value === "true" || value === "1";
    default:
      return value;
  }
}

/** Validates a candidate value against its definition. Returns an error string or null. */
export function validateSetting(def: SettingDef, raw: unknown): string | null {
  const text = typeof raw === "boolean" ? String(raw) : String(raw ?? "");

  switch (def.type) {
    case "number": {
      const n = Number(text);
      if (!Number.isFinite(n)) return `${def.label} must be a number`;
      if (def.min !== undefined && n < def.min) return `${def.label} must be at least ${def.min}`;
      if (def.max !== undefined && n > def.max) return `${def.label} must be at most ${def.max}`;
      return null;
    }
    case "boolean":
      if (!["true", "false"].includes(text)) return `${def.label} must be true or false`;
      return null;
    case "enum":
      if (def.options && !def.options.includes(text)) {
        return `${def.label} must be one of: ${def.options.join(", ")}`;
      }
      return null;
    default:
      if (text.length > 500) return `${def.label} is too long`;
      return null;
  }
}

/**
 * Reads every setting, applying defaults for rows that have never been saved.
 * Secret values are included here because this runs server-side; callers that
 * return data to a client must redact them.
 */
export async function readSettings(): Promise<Record<string, string | number | boolean>> {
  const rows = await prisma.systemSetting.findMany();
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const out: Record<string, string | number | boolean> = {};
  for (const def of SETTINGS) {
    out[def.key] = parseSetting(def, stored.get(def.key));
  }
  return out;
}

/** Reads one setting with its default applied. */
export async function readSetting<T = string>(key: string): Promise<T> {
  const def = SETTINGS_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown setting ${key}`);
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return parseSetting(def, row?.value) as T;
}
