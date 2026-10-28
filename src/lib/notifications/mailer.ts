import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

/**
 * Mail delivery. In development the console transport is used so demos work
 * with no SMTP credentials and no network. The queue never depends on the
 * transport succeeding: a failure is recorded on the notification row and
 * retried later.
 */

let cached: Transporter | null = null;

function getTransport(): Transporter | null {
  if (env.EMAIL_TRANSPORT === "console") return null;
  if (!env.SMTP_HOST || !env.SMTP_USER) return null;
  if (!cached) {
    cached = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return cached;
}

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailResult = { delivered: boolean; transport: string; error?: string };

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const transport = getTransport();
  if (!transport) {
    console.info(`[mail:console] to=${message.to} subject="${message.subject}"`);
    return { delivered: true, transport: "console" };
  }
  try {
    await transport.sendMail({
      from: `"${env.FROM_NAME}" <${env.SMTP_FROM ?? env.SMTP_USER}>`,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html ?? `<p>${message.text.replace(/\n/g, "<br/>")}</p>`,
    });
    return { delivered: true, transport: "smtp" };
  } catch (error) {
    return { delivered: false, transport: "smtp", error: error instanceof Error ? error.message : "send failed" };
  }
}
