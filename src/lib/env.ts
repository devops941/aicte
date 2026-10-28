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

export const env = parsed.data;

export const isProd = process.env.NODE_ENV === "production";
