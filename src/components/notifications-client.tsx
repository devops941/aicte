"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { relativeTime, humanise } from "@/lib/utils";

const KIND_TONE: Record<string, "brand" | "ok" | "warn" | "danger" | "info" | "neutral"> = {
  SLA_DUE_SOON: "warn",
  SLA_OVERDUE: "danger",
  ESCALATION: "danger",
  EVC_REMINDER: "info",
  CLARIFICATION_RAISED: "warn",
  CLARIFICATION_RESPONDED: "ok",
  DOCUMENT_EXPIRY: "warn",
  UNDERTAKING_DUE: "warn",
  ASSIGNMENT: "brand",
  DECISION: "ok",
};

export type SerializedNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  channel: string;
  status: string;
  attempts: number;
  readAt: string | null;
  createdAt: string;
};

export function NotificationsClient({
  initialRows,
}: {
  initialRows: SerializedNotification[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<SerializedNotification[]>(initialRows);
  const [busy, setBusy] = useState(false);

  const unreadCount = rows.filter((r) => !r.readAt).length;

  const handleMarkAllRead = async () => {
    if (busy || unreadCount === 0) return;
    setBusy(true);
    const nowIso = new Date().toISOString();
    setRows((prev) => prev.map((r) => ({ ...r, readAt: r.readAt ?? nowIso })));

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      router.refresh();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  };

  const handleMarkOneRead = async (id: string) => {
    const item = rows.find((r) => r.id === id);
    if (!item || item.readAt) return;

    const nowIso = new Date().toISOString();
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, readAt: nowIso } : r)));

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      router.refresh();
    } catch {
      // ignore
    }
  };

  return (
    <Card>
      <CardHeader
        title={`${rows.length} notification${rows.length === 1 ? "" : "s"}`}
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        action={
          unreadCount > 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink shadow-xs transition-colors hover:bg-canvas disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5 text-brand" />
              Mark all as read
            </button>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-5 w-5" />}
          title="No alerts yet"
          description="When a case you own approaches its deadline or requires your action, you will see it here."
        />
      ) : (
        <div className="divide-y divide-line">
          {rows.map((n) => {
            const isUnread = !n.readAt;
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3.5 px-5 py-4 transition-colors hover:bg-canvas sm:px-6 ${
                  isUnread ? "bg-brand/5" : ""
                }`}
              >
                <button
                  type="button"
                  title={isUnread ? "Mark as read" : "Read"}
                  onClick={() => handleMarkOneRead(n.id)}
                  className="mt-1 flex items-center justify-center p-0.5"
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full transition-transform ${
                      isUnread
                        ? "bg-brand ring-4 ring-brand/20 hover:scale-125"
                        : "bg-line"
                    }`}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-medium ${isUnread ? "text-ink font-semibold" : "text-ink"}`}>
                      {n.title}
                    </span>
                    <Badge tone={KIND_TONE[n.kind] ?? "neutral"}>{humanise(n.kind)}</Badge>
                    {n.channel === "EMAIL" && <Badge tone="neutral">Email</Badge>}
                    {n.status === "FAILED" && <Badge tone="danger">Delivery failed</Badge>}
                  </div>
                  {n.body && <p className="mt-1 text-xs leading-relaxed text-muted">{n.body}</p>}
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted">
                    <span>{relativeTime(new Date(n.createdAt))}</span>
                    {n.attempts > 0 && <span>· {n.attempts} attempt(s)</span>}
                    {n.link && (
                      <Link
                        href={n.link}
                        onClick={() => handleMarkOneRead(n.id)}
                        className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                      >
                        Open
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                    {isUnread && (
                      <button
                        type="button"
                        onClick={() => handleMarkOneRead(n.id)}
                        className="text-muted hover:text-ink hover:underline"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

