import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "brand",
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "brand" | "ok" | "warn" | "danger" | "info";
  delay?: number;
}) {
  const toneRing: Record<string, string> = {
    brand: "text-brand bg-brand-soft",
    ok: "text-ok bg-ok/10",
    warn: "text-warn bg-warn/10",
    danger: "text-danger bg-danger/10",
    info: "text-info bg-info/10",
  };
  return (
    <div
      className="card card-pad animate-fade-up transition-all duration-300 hover:shadow-lift"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        </div>
        {icon && <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", toneRing[tone])}>{icon}</span>}
      </div>
    </div>
  );
}
