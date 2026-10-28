import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { regionAnalytics, stageAnalytics, officerWorkload, dashboardStats, workerHealth } from "@/lib/queries";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { RegionTrend, StageBars } from "@/components/charts";
import { SLA_LABELS } from "@/lib/constants";
import { humanise, percent } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const actor = await requirePageActor();
  const [stages, regions, workload, stats, health] = await Promise.all([
    stageAnalytics(actor),
    regionAnalytics(actor),
    officerWorkload(actor),
    dashboardStats(actor),
    workerHealth(),
  ]);

  const totalCases = regions.reduce((s, r) => s + r.total, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Analysis"
        title="Reports"
        description="Stage-wise average days, overdue counts, officer load and regional comparison, for review meetings."
        actions={
          <a href="/api/reports/export" className="btn-ghost" download>
            <Download className="h-4 w-4" />
            Export CSV
          </a>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Stage-wise average days" subtitle="Measured from completed stage transitions" />
          <CardBody>
            <StageBars data={stages} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Regional comparison" subtitle="Volume against overdue count" />
          <CardBody>
            <RegionTrend data={regions.map((r) => ({ name: r.code, total: r.total, overdue: r.overdue }))} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Bottlenecks by stage" subtitle="Where cases sit longest against their allowance" />
          <CardBody>
            {stages.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted">No completed transitions yet.</p>
            ) : (
              <div className="space-y-3">
                {stages.map((s) => {
                  const ratio = s.sla > 0 ? Math.round((s.avgDays / s.sla) * 100) : 0;
                  return (
                    <div key={s.stage} className="rounded-xl border border-line px-3.5 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium text-ink">{s.stage}</span>
                        <div className="flex items-center gap-2">
                          {s.breaches > 0 && <Badge tone="danger">{s.breaches} breach(es)</Badge>}
                          <span className="text-[11px] tabular-nums text-muted">
                            {s.avgDays}d avg / {s.sla}d allowed
                          </span>
                        </div>
                      </div>
                      <div className="mt-2">
                        <Progress value={Math.min(100, ratio)} tone={ratio >= 100 ? "danger" : ratio >= 80 ? "warn" : "ok"} showLabel />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Officer workload" subtitle="Open cases held, with the overdue share" />
          <CardBody>
            {workload.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted">No open assignments in scope.</p>
            ) : (
              <div className="space-y-3">
                {workload.map((w) => (
                  <div key={w.name} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-ink">{w.name}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted">
                          {w.open} open{w.overdue > 0 ? ` · ${w.overdue} overdue` : ""}
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <Progress value={percent(w.overdue, w.open)} tone={w.overdue > 0 ? "danger" : "ok"} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Region-wise summary" subtitle="Institutions, volume and on-time share" />
          <div className="table-wrap border-0">
            <table className="w-full">
              <thead className="bg-canvas">
                <tr>
                  <th className="th">Region</th>
                  <th className="th">Institutions</th>
                  <th className="th">Cases</th>
                  <th className="th">Overdue</th>
                  <th className="th">On-time share</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-canvas">
                    <td className="td font-medium text-ink">{r.name}</td>
                    <td className="td text-muted">{r.institutions}</td>
                    <td className="td tabular-nums text-ink">{r.total}</td>
                    <td className="td tabular-nums">
                      {r.overdue > 0 ? <span className="text-danger">{r.overdue}</span> : <span className="text-ok">0</span>}
                    </td>
                    <td className="td">
                      <div className="w-28">
                        <Progress value={r.total ? percent(r.onTime, r.total) : 100} tone={r.overdue > 0 ? "warn" : "ok"} showLabel />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Snapshot" subtitle="Current position across your scope" />
          <CardBody className="space-y-2.5">
            <Row label="Cases in scope" value={totalCases} />
            {Object.entries(stats.bySla).map(([k, v]) => (
              <Row key={k} label={SLA_LABELS[k] ?? k} value={v} />
            ))}
            <div className="border-t border-line pt-2.5">
              <Row label="Open clarifications" value={stats.openClarifications} />
              <Row label="Unassigned cases" value={stats.unassigned} />
            </div>
            <div className="border-t border-line pt-2.5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Job health</p>
              {health.map((h) => (
                <div key={h.job} className="flex items-center justify-between py-0.5">
                  <span className="text-[11px] text-muted">{humanise(h.job)}</span>
                  <Badge tone={h.stale ? "danger" : "ok"} dot>
                    {h.ageMinutes < 1 ? "now" : `${h.ageMinutes}m`}
                  </Badge>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-ink">{value}</span>
    </div>
  );
}
