"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Loader2, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export type JobHealth = {
  job: string;
  status: string;
  detail: string | null;
  lastRunAt: string;
  runCount: number;
  ageMinutes: number;
  stale: boolean;
};

export type FailedNotification = {
  id: string;
  kind: string;
  channel: string;
  title: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  user: { email: string; name: string } | null;
};

/**
 * Maintenance console. Every button maps to a recoverable, audited server
 * action — requeue a failed notification, requeue them all, or re-verify the
 * audit chain. There is no destructive action here by design.
 */
export function MaintenanceConsole({
  jobs,
  notifications,
  integrity,
  totals,
  failed,
}: {
  jobs: JobHealth[];
  notifications: Record<string, number>;
  integrity: { chainValid: boolean; checked: number; brokenAtId: string | null; reason: string | null; note: string };
  totals: { applications: number; auditEntries: number };
  failed: FailedNotification[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function run(action: string, id?: string) {
    setBusy(id ?? action);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { action, id } : { action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The action was rejected");
      const text =
        action === "verify-chain"
          ? json.valid
            ? `Chain verified across ${json.checked} entries.`
            : `Chain broken at entry ${json.brokenAtId}: ${json.reason}`
          : `${json.requeued} notification(s) requeued.`;
      setMessage({ tone: action === "verify-chain" && !json.valid ? "error" : "ok", text });
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "The action failed" });
    } finally {
      setBusy(null);
    }
  }

  const queued = notifications.QUEUED ?? 0;
  const sent = notifications.SENT ?? 0;
  const failedCount = notifications.FAILED ?? 0;

  return (
    <div className="space-y-5">
      {message && (
        <p
          role="status"
          className={
            message.tone === "ok"
              ? "rounded-xl border border-ok/30 bg-ok/5 px-3 py-2 text-xs text-ok"
              : "rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
          }
        >
          {message.text}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="animate-fade-up">
          <CardHeader title="Worker jobs" subtitle="A job that has not run in 30 minutes is flagged stale." />
          <CardBody className="space-y-3">
            {jobs.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">The worker has not reported a heartbeat yet.</p>
            ) : (
              jobs.map((j) => (
                <div key={j.job} className="flex items-center justify-between rounded-xl border border-line px-3.5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-ink">{j.job}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {formatDateTime(j.lastRunAt)} · {j.runCount} run(s)
                    </p>
                    {j.detail && <p className="mt-0.5 truncate text-[11px] text-muted">{j.detail}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={j.stale ? "warn" : "ok"} dot>
                      {j.stale ? "Stale" : "Fresh"}
                    </Badge>
                    <span className="text-[10px] text-muted">{j.ageMinutes}m ago</span>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card className="animate-fade-up">
          <CardHeader
            title="Notification queue"
            subtitle="Counts by delivery status across the whole platform."
            action={
              failedCount > 0 ? (
                <button type="button" onClick={() => run("retry-all-failed")} disabled={busy === "retry-all-failed"} className="btn-ghost btn-sm">
                  {busy === "retry-all-failed" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Retry all
                </button>
              ) : undefined
            }
          />
          <CardBody>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Queued" value={queued} tone="info" />
              <Stat label="Sent" value={sent} tone="ok" />
              <Stat label="Failed" value={failedCount} tone={failedCount > 0 ? "danger" : "neutral"} />
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="animate-fade-up">
        <CardHeader
          title="Audit chain integrity"
          subtitle={integrity.note}
          action={
            <button type="button" onClick={() => run("verify-chain")} disabled={busy === "verify-chain"} className="btn-ghost btn-sm">
              {busy === "verify-chain" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              Verify now
            </button>
          }
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={integrity.chainValid ? "ok" : "danger"} dot>
              {integrity.chainValid ? "Chain intact" : "Chain broken"}
            </Badge>
            <span className="text-xs text-muted">{integrity.checked} entries checked</span>
            {!integrity.chainValid && integrity.brokenAtId && (
              <span className="font-mono text-[11px] text-danger">first break: {integrity.brokenAtId}</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
            <div>
              <p className="text-[11px] text-muted">Applications</p>
              <p className="text-lg font-semibold tabular-nums text-ink">{totals.applications}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted">Audit entries</p>
              <p className="text-lg font-semibold tabular-nums text-ink">{totals.auditEntries}</p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Failed notifications (${failed.length})`} subtitle="Requeue one to have the worker try again on its next tick." />
        {failed.length === 0 ? (
          <CardBody>
            <p className="py-4 text-center text-xs text-muted">
              <Activity className="mx-auto mb-2 h-4 w-4 text-ok" />
              Nothing has failed. The queue is clean.
            </p>
          </CardBody>
        ) : (
          <div className="table-wrap border-0">
            <table className="w-full">
              <thead className="bg-canvas">
                <tr>
                  <th className="th">Recipient</th>
                  <th className="th">Notification</th>
                  <th className="th">Attempts</th>
                  <th className="th">Last error</th>
                  <th className="th th-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {failed.map((f) => (
                  <tr key={f.id} className="transition-colors hover:bg-canvas">
                    <td className="td">
                      <p className="text-xs text-ink">{f.user?.name ?? "—"}</p>
                      <p className="text-[11px] text-muted">{f.user?.email ?? ""}</p>
                    </td>
                    <td className="td">
                      <p className="text-xs text-ink">{f.title}</p>
                      <p className="text-[11px] text-muted">
                        {f.kind} · {f.channel}
                      </p>
                    </td>
                    <td className="td tabular-nums">{f.attempts}</td>
                    <td className="td max-w-[240px]">
                      <p className="truncate text-[11px] text-danger" title={f.lastError ?? ""}>
                        {f.lastError ?? "—"}
                      </p>
                    </td>
                    <td className="td td-right">
                      <button type="button" onClick={() => run("retry-notification", f.id)} disabled={busy === f.id} className="btn-ghost btn-sm">
                        {busy === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Retry
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "ok" | "info" | "danger" | "neutral" }) {
  return (
    <div className="rounded-xl border border-line px-3 py-3 text-center">
      <p className="text-lg font-semibold tabular-nums text-ink">{value}</p>
      <Badge tone={tone}>{label}</Badge>
    </div>
  );
}
