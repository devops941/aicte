import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  ADMIN_USERNAME: z.string().default("admin"),
  ADMIN_PASSWORD: z.string().default("Admin@123"),
  ADMIN_EMAIL: z.string().default("admin@gmail.com"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  BACKEND_URL: z.string().default("http://localhost:5000"),
  JWT_ACCESS_SECRET: z.string().min(16),
  AUTH_SECRET: z.string().min(16).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  FROM_NAME: z.string().default("AICTE"),
  STORAGE_DRIVER: z.enum(["local", "imagekit"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./var/uploads"),
  IMAGEKIT_PUBLIC_KEY: z.string().optional(),
  IMAGEKIT_PRIVATE_KEY: z.string().optional(),
  IMAGEKIT_URL_ENDPOINT: z.string().optional(),
  EMAIL_TRANSPORT: z.enum(["console", "smtp"]).default("console"),
  AI_PROVIDER: z.enum(["rules", "openai"]).default("rules"),
  WORKER_CRON: z.string().default("*/5 * * * *"),
  WORKER_TOKEN: z.string().default("local-worker-token"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

/**
 * Refuses to start production with development defaults. The schema supplies
 * fallbacks so a local checkout runs with no .env, but those fallbacks are
 * public knowledge: a deployment that inherited WORKER_TOKEN="local-worker-token"
 * would expose the worker trigger, which queues real email, to anyone who knows
 * the string. This check turns that misconfiguration into a startup failure
 * instead of a silent hole.
 *
 * It is skipped during `next build`, which also runs with NODE_ENV=production
 * and evaluates these modules while collecting page data. Build machines do not
 * hold runtime secrets, so the check belongs at server start, not at build.
 */
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

if (process.env.NODE_ENV === "production" && !isBuildPhase) {
  const problems: string[] = [];
  if (!process.env.WORKER_TOKEN || parsed.data.WORKER_TOKEN === "local-worker-token") {
    problems.push("WORKER_TOKEN must be set to a private value in production");
  }
  if (!process.env.AUTH_SECRET || parsed.data.AUTH_SECRET === undefined) {
    problems.push("AUTH_SECRET must be set in production");
  }
  if (problems.length > 0) {
    throw new Error(`Invalid production configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
}

export const env = parsed.data;

export const isProd = process.env.NODE_ENV === "production";
