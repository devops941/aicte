import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 1) return "just now";
  if (Math.abs(mins) < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  return formatDate(d);
}

export function formatAge(minutes: number, withSuffix = true): string {
  const m = Math.max(0, Math.round(minutes));
  const suffix = withSuffix ? " ago" : "";
  if (m < 1) return withSuffix ? "just now" : "now";
  if (m < 60) return `${m}m${suffix}`;
  const hours = Math.round(m / 60);
  if (hours < 24) return `${hours}h${suffix}`;
  const days = Math.round(hours / 24);
  return `${days}d${suffix}`;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function humanise(value: string): string {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((part / whole) * 100)));
}

/**
 * Generates an official-style AICTE Permanent Institute ID.
 * Standard AICTE format: "1-" followed by 10 digits (e.g. 1-4829104821).
 */
export function generateAicteId(): string {
  // Runs in the browser (institution form), so use the global Web Crypto API —
  // available in both the browser and Node — rather than node:crypto.randomInt,
  // which is not polyfilled on the client.
  const buf = new Uint32Array(2);
  globalThis.crypto.getRandomValues(buf);
  const combined = (BigInt(buf[0]) << 32n) | BigInt(buf[1]);
  const digits = 1_000_000_000n + (combined % 9_000_000_000n);
  return `1-${digits}`;
}
