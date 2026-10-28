import { cn } from "@/lib/utils";

export function Progress({
  value,
  tone = "brand",
  className,
  showLabel = false,
}: {
  value: number;
  tone?: "brand" | "ok" | "warn" | "danger";
  className?: string;
  showLabel?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const bar: Record<string, string> = {
    brand: "bg-brand",
    ok: "bg-ok",
    warn: "bg-warn",
    danger: "bg-danger",
  };
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className={cn("h-full rounded-full transition-[width] duration-700 ease-out", bar[tone])}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted">{clamped}%</span>}
    </div>
  );
}
