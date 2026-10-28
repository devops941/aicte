import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "brand" | "ok" | "warn" | "danger" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  brand: "border-brand/25 bg-brand-soft text-brand-ink",
  ok: "border-ok/25 bg-ok/10 text-ok",
  warn: "border-warn/30 bg-warn/10 text-warn",
  danger: "border-danger/25 bg-danger/10 text-danger",
  info: "border-info/25 bg-info/10 text-info",
  neutral: "border-line bg-canvas text-muted",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  dot = false,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span className={cn("chip", TONES[tone], className)}>
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75", dotColor(tone))} />
          <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", dotColor(tone))} />
        </span>
      )}
      {children}
    </span>
  );
}

function dotColor(tone: Tone): string {
  switch (tone) {
    case "ok":
      return "bg-ok";
    case "warn":
      return "bg-warn";
    case "danger":
      return "bg-danger";
    case "info":
      return "bg-info";
    case "brand":
      return "bg-brand";
    default:
      return "bg-muted";
  }
}

export const STATUS_TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  IN_PROCESS: "brand",
  RETURNED_FOR_CLARIFICATION: "warn",
  SCHEDULED_EVC: "info",
  PENDING_DECISION: "warn",
  APPROVED: "ok",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
};

export const SLA_TONE: Record<string, Tone> = {
  ON_TRACK: "ok",
  DUE_SOON: "warn",
  OVERDUE: "danger",
  PAUSED: "info",
  MET: "ok",
  BREACHED: "danger",
};

export const RISK_TONE: Record<string, Tone> = {
  LOW: "ok",
  MEDIUM: "warn",
  HIGH: "danger",
};
