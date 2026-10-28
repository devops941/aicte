import type { Metadata } from "next";
import { CalendarClock, MapPin, Users } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { evcList } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime, humanise } from "@/lib/utils";

export const metadata: Metadata = { title: "EVC Visits" };

const TONE: Record<string, "info" | "ok" | "danger" | "warn"> = {
  PROPOSED: "warn",
  SCHEDULED: "info",
  COMPLETED: "ok",
  CANCELLED: "danger",
};

export default async function EvcPage() {
  const actor = await requirePageActor();
  const rows = await evcList(actor);

  const upcoming = rows.filter((r) => r.scheduledFor >= new Date() && r.status !== "CANCELLED");
  const past = rows.filter((r) => r.scheduledFor < new Date() || r.status === "COMPLETED");

  return (
    <div>
      <PageHeader
        eyebrow="Expert Visit Committee"
        title="EVC visits"
        description="Scheduled visits in your scope. Members are reminded 7 days and 1 day before the visit."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={`Upcoming (${upcoming.length})`} subtitle="Sorted by the earliest visit" />
          {upcoming.length === 0 ? (
            <EmptyState icon={<CalendarClock className="h-5 w-5" />} title="No upcoming visits" description="Nothing is scheduled in your scope right now." />
          ) : (
            <CardBody className="space-y-3">
              {upcoming.map((e) => (
                <div key={e.id} className="rounded-xl border border-line px-4 py-3.5 transition-all hover:border-brand/40 hover:shadow-soft">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-semibold text-brand">{e.application.appNo}</span>
                    <Badge tone={TONE[e.status] ?? "neutral"} dot>
                      {humanise(e.status)}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-ink">{e.application.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{e.application.institution.name}</p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] text-muted">
                    <span className="flex items-center gap-1.5">
                      <CalendarClock className="h-3 w-3" />
                      {formatDateTime(e.scheduledFor)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3 w-3" />
                      {e.memberIds.length} member(s)
                    </span>
                    {e.venue && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" />
                        {e.venue}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title={`Completed and past (${past.length})`} subtitle="Record of visits that have happened" />
          {past.length === 0 ? (
            <EmptyState icon={<CalendarClock className="h-5 w-5" />} title="No past visits" />
          ) : (
            <CardBody className="space-y-2">
              {past.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
                  <div className="min-w-0">
                    <span className="font-mono text-[11px] font-semibold text-brand">{e.application.appNo}</span>
                    <p className="truncate text-xs text-ink">{e.application.institution.name}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={TONE[e.status] ?? "neutral"}>{humanise(e.status)}</Badge>
                    <p className="mt-1 text-[10px] text-muted">{formatDateTime(e.scheduledFor)}</p>
                  </div>
                </div>
              ))}
            </CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}
