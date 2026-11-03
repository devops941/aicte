import type { Metadata } from "next";
import { requirePageActor } from "@/lib/auth/session";
import { notificationsFor } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { NotificationsClient, type SerializedNotification } from "@/components/notifications-client";

export const metadata: Metadata = { title: "Alerts" };

export default async function NotificationsPage() {
  const actor = await requirePageActor();
  const rows = await notificationsFor(actor.id, 100);

  const serialized: SerializedNotification[] = rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    channel: n.channel,
    status: n.status,
    attempts: n.attempts,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Alerts"
        title="Notifications"
        description="Reminders, escalations and decisions addressed to you. Each alert is queued once and retried on failure."
      />
      <NotificationsClient initialRows={serialized} />
    </div>
  );
}
