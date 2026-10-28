import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock,
  FileStack,
  Gauge,
  MessageSquareWarning,
  UserX,
} from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import {
  dashboardStats,
  officerWorkload,
  regionAnalytics,
  stageAnalytics,
  listCases,
  workerHealth,
} from "@/lib/queries";
import { Badge, RISK_TONE, SLA_TONE, STATUS_TONE } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { PageHeader } from "@/components/ui/page-header";
import { FadeIn, Stagger, StaggerItem } from "@/components/ui/motion";
import { RegionTrend, SlaDonut, StageBars, StatusBars, WorkloadBars } from "@/components/charts";
import { SLA_LABELS, STATUS_LABELS } from "@/lib/constants";
import { formatDate, humanise } from "@/lib/utils";
import { delayRisk } from "@/lib/ai";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const actor = await requirePageActor();

  const [stats, stages, regions, workload, recent, health] = await Promise.all([
    dashboardStats(actor),
    stageAnalytics(actor),
    regionAnalytics(actor),
    officerWorkload(actor),
    listCases(actor, { pageSize: 8, sort: "due" }),
    workerHealth(),
  ]);

  const slaData = Object.entries(stats.bySla)
    .filter(([k]) => ["ON_TRACK", "DUE_SOON", "OVERDUE", "PAUSED"].includes(k))
    .map(([key, value]) => ({ key, name: SLA_LABELS[key] ?? key, value }));

  const statusData = Object.entries(stats.byStatus)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({ name: STATUS_LABELS[key] ?? key, value }))
    .sort((a, b) => b.value - a.value);

  const staleJobs = health.filter((h) => h.stale);
  const isInstitution = actor.role === "INSTITUTION_ADMIN";

  const urgent = recent.rows.filter((r) => r.slaState === "OVERDUE" || r.slaState === "DUE_SOON");

  return (
    <div>
      <PageHeader
        eyebrow={isInstitution ? "Institution view" : "Officer view"}
        title={`Good to see you, ${actor.name.split(" ").slice(-1)[0]}`}
        description={
          isInstitution
            ? "Your applications, outstanding obligations and any requests awaiting a response."
            : "Pendency across your scope, cases nearing their deadline and where work is piling up."
        }
        actions={
          <Link href={isInstitution ? "/applications" : "/cases"} className="btn-primary">
            {isInstitution ? "View applications" : "Open case list"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      {staleJobs.length > 0 && (
        <FadeIn className="mb-5">
          <div className="flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn/5 px-4 py-3.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <div className="text-xs">
              <p className="font-semibold text-ink">The scheduled worker has not run recently</p>
              <p className="mt-0.5 text-muted">
                {staleJobs.map((j) => `${j.job} (${j.ageMinutes}m ago)`).join(", ")}. Deadlines are not being
                checked, so reminders and escalations will not fire.
              </p>
            </div>
          </div>
        </FadeIn>
      )}

      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <Stat
            label={isInstitution ? "My applications" : "Cases in scope"}
            value={stats.total}
            hint={`${stats.bySla.ON_TRACK ?? 0} on track`}
            icon={<FileStack className="h-4 w-4" />}
          />
        </StaggerItem>
        <StaggerItem>
          <Stat
            label="Overdue"
            value={stats.overdue}
            hint={stats.overdue > 0 ? "Past the prescribed timeline" : "Nothing past deadline"}
            tone={stats.overdue > 0 ? "danger" : "ok"}
            icon={<Clock className="h-4 w-4" />}
            delay={60}
          />
        </StaggerItem>
        <StaggerItem>
          <Stat
            label="Due soon"
            value={stats.dueSoon}
            hint="80% or more of the allowance used"
            tone="warn"
            icon={<Gauge className="h-4 w-4" />}
            delay={120}
          />
        </StaggerItem>
        <StaggerItem>
          <Stat
            label={isInstitution ? "Awaiting your reply" : "Open clarifications"}
            value={stats.openClarifications}
            hint={stats.unassigned > 0 ? `${stats.unassigned} case(s) unassigned` : "All cases have an owner"}
            tone={stats.openClarifications > 0 ? "warn" : "ok"}
            icon={<MessageSquareWarning className="h-4 w-4" />}
            delay={180}
          />
        </StaggerItem>
      </Stagger>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <FadeIn className="lg:col-span-2" delay={0.05}>
          <Card>
            <CardHeader
              title="Stage-wise average days against allowance"
              subtitle="Where cases sit longest relative to the prescribed timeline"
            />
            <CardBody>
              <StageBars data={stages} />
            </CardBody>
          </Card>
        </FadeIn>

        <FadeIn delay={0.1}>
          <Card className="h-full">
            <CardHeader title="SLA position" subtitle="Live classification across your scope" />
            <CardBody>
              <SlaDonut data={slaData} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                {slaData.map((d) => (
                  <div key={d.key} className="flex items-center justify-between rounded-lg bg-canvas px-2.5 py-1.5">
                    <span className="text-[11px] text-muted">{d.name}</span>
                    <span className="text-[11px] font-semibold tabular-nums text-ink">{d.value}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </FadeIn>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <FadeIn delay={0.12}>
          <Card className="h-full">
            <CardHeader title="Cases by status" subtitle="Distribution across the workflow" />
            <CardBody>
              <StatusBars data={statusData} />
            </CardBody>
          </Card>
        </FadeIn>

        <FadeIn delay={0.16}>
          <Card className="h-full">
            <CardHeader title="Officer workload" subtitle="Open cases held, with overdue share" />
            <CardBody>
              <WorkloadBars data={workload.slice(0, 8).map((w) => ({ name: w.name, open: w.open, overdue: w.overdue }))} />
            </CardBody>
          </Card>
        </FadeIn>

        <FadeIn delay={0.2}>
          <Card className="h-full">
            <CardHeader title="Regional comparison" subtitle="Volume and overdue count" />
            <CardBody>
              <RegionTrend data={regions.map((r) => ({ name: r.code, total: r.total, overdue: r.overdue }))} />
            </CardBody>
          </Card>
        </FadeIn>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <FadeIn className="lg:col-span-2" delay={0.22}>
          <Card>
            <CardHeader
              title="Nearest deadlines"
              subtitle="Sorted by the deadline, not by when they were last touched"
              action={
                <Link href={isInstitution ? "/applications" : "/cases"} className="text-xs font-medium text-brand hover:underline">
                  View all
                </Link>
              }
            />
            {recent.rows.length === 0 ? (
              <EmptyState
                icon={<FileStack className="h-5 w-5" />}
                title="No applications yet"
                description={
                  isInstitution
                    ? "Start by creating an application. It will move through the configured stages automatically."
                    : "Nothing is pending in your scope right now."
                }
              />
            ) : (
              <div className="divide-y divide-line">
                {recent.rows.map((row) => {
                  const risk = delayRisk({
                    stageAgeWorkingDays: 0,
                    slaWorkingDays: row.currentStage?.slaWorkingDays ?? 10,
                    openCasesForOwner: workload.find((w) => w.name === row.assignments[0]?.user.name)?.open ?? 0,
                    clarificationsRaised: row._count.clarifications,
                    avgStageDaysForType: stages.find((s) => s.stage === row.currentStage?.name)?.avgDays ?? 0,
                  });
                  return (
                    <Link
                      key={row.id}
                      href={`${isInstitution ? "/applications" : "/cases"}/${row.id}`}
                      className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-canvas sm:px-6"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-semibold text-brand">{row.appNo}</span>
                          <Badge tone={SLA_TONE[row.slaState] ?? "neutral"} dot>
                            {SLA_LABELS[row.slaState] ?? row.slaState}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-sm font-medium text-ink">{row.title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {row.institution.name} · {row.currentStage?.name ?? "Not yet routed"}
                        </p>
                      </div>
                      <div className="hidden shrink-0 text-right sm:block">
                        <p className="text-xs font-medium text-ink">{formatDate(row.slaDueAt)}</p>
                        <p className="text-[11px] text-muted">Deadline</p>
                      </div>
                      <div className="hidden shrink-0 lg:block">
                        <Badge tone={RISK_TONE[risk.value] ?? "neutral"}>{risk.value} risk</Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </FadeIn>

        <FadeIn delay={0.26}>
          <Card className="h-full">
            <CardHeader title="Needs attention" subtitle="Overdue and due-soon cases" />
            <CardBody className="space-y-2.5">
              {urgent.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <CheckCircle2 className="h-8 w-8 text-ok" />
                  <p className="text-xs font-medium text-ink">Nothing is past deadline</p>
                  <p className="text-[11px] text-muted">Every case in scope is inside its allowance.</p>
                </div>
              ) : (
                urgent.slice(0, 5).map((row) => (
                  <Link
                    key={row.id}
                    href={`${isInstitution ? "/applications" : "/cases"}/${row.id}`}
                    className="block rounded-xl border border-line px-3.5 py-3 transition-all hover:border-brand/40 hover:bg-brand-soft/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold text-brand">{row.appNo}</span>
                      <Badge tone={SLA_TONE[row.slaState] ?? "neutral"}>{SLA_LABELS[row.slaState]}</Badge>
                    </div>
                    <p className="mt-1.5 truncate text-xs font-medium text-ink">{row.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {row.currentStage?.name} · due {formatDate(row.slaDueAt)}
                    </p>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>
        </FadeIn>
      </div>

      <FadeIn delay={0.3} className="mt-5">
        <Card>
          <CardHeader
            title="Scheduled job health"
            subtitle="A silent worker means no reminders and no escalations"
            action={
              <Badge tone={staleJobs.length > 0 ? "danger" : "ok"} dot>
                {staleJobs.length > 0 ? "Attention needed" : "Healthy"}
              </Badge>
            }
          />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {health.map((job) => (
                <div key={job.job} className="rounded-xl border border-line px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-ink">{humanise(job.job)}</span>
                    <Badge tone={job.stale ? "danger" : job.status === "OK" ? "ok" : "neutral"} dot>
                      {job.status}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted">
                    Last run {job.ageMinutes < 1 ? "just now" : `${job.ageMinutes}m ago`} · {job.runCount} runs
                  </p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </FadeIn>
    </div>
  );
}
