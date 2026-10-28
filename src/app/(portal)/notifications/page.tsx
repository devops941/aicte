import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { notificationsFor } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { relativeTime, humanise } from "@/lib/utils";

export const metadata: Metadata = { title: "Alerts" };

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

export default async function NotificationsPage() {
  const actor = await requirePageActor();
  const rows = await notificationsFor(actor.id, 100);

  return (
    <div>
      <PageHeader
        eyebrow="Alerts"
        title="Notifications"
        description="Reminders, escalations and decisions addressed to you. Each alert is queued once and retried on failure."
      />

      <Card>
        <CardHeader title={`${rows.length} notification(s)`} subtitle="Most recent first" />
        {rows.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-5 w-5" />}
            title="No alerts yet"
            description="When a case you own approaches its deadline, you will see it here and in the topbar."
          />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((n) => (
              <div key={n.id} className="flex items-start gap-3.5 px-5 py-4 transition-colors hover:bg-canvas sm:px-6">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    n.readAt ? "bg-line" : "bg-brand"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{n.title}</span>
                    <Badge tone={KIND_TONE[n.kind] ?? "neutral"}>{humanise(n.kind)}</Badge>
                    {n.channel === "EMAIL" && <Badge tone="neutral">Email</Badge>}
                    {n.status === "FAILED" && <Badge tone="danger">Delivery failed</Badge>}
                  </div>
                  {n.body && <p className="mt-1 text-xs leading-relaxed text-muted">{n.body}</p>}
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted">
                    <span>{relativeTime(n.createdAt)}</span>
                    {n.attempts > 0 && <span>· {n.attempts} attempt(s)</span>}
                    {n.link && (
                      <Link href={n.link} className="font-medium text-brand hover:underline">
                        Open
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
