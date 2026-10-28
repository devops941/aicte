"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  MessageSquareWarning,
  Pause,
  Play,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Badge, RISK_TONE, SLA_TONE, STATUS_TONE } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DocumentAnalyzer } from "@/components/document-analyzer";
import { Progress } from "@/components/ui/progress";
import { ACTION_LABELS, CHECKLIST_BY_TYPE, SLA_LABELS, STATUS_LABELS, TYPE_LABELS } from "@/lib/constants";
import { cn, formatDate, formatDateTime, humanise } from "@/lib/utils";

type Stage = {
  id: string;
  code: string;
  name: string;
  sequence: number;
  slaWorkingDays: number;
  isInitial: boolean;
  isTerminal: boolean;
  assigneeRole: string;
};

type Action = { action: string; label: string | null; requiresRemark: boolean; requiredRole: string };

type HistoryRow = {
  id: string;
  action: string;
  remark: string | null;
  enteredAt: string;
  exitedAt: string | null;
  daysInStage: number | null;
  slaMet: boolean | null;
  stage: { name: string; code: string } | null;
  actor: { name: string; role: string } | null;
};

type Clarification = {
  id: string;
  reason: string;
  response: string | null;
  status: string;
  dueAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  raisedBy: { name: string; role: string } | null;
  respondedBy: { name: string; role: string } | null;
};

export function CaseDetail({
  application,
  stages,
  actions,
  sla,
  history,
  clarifications,
  documents,
  evcSchedules,
  canRespond,
  canUpload,
}: {
  application: {
    id: string;
    appNo: string;
    title: string;
    type: string;
    status: string;
    summary: string | null;
    submittedAt: string | null;
    slaDueAt: string | null;
    slaPausedAt: string | null;
    currentStageId: string | null;
    institution: { name: string; aicteId: string; state: string };
  };
  stages: Stage[];
  actions: Action[];
  sla: { state: string; elapsed: number; remaining: number; percent: number };
  history: HistoryRow[];
  clarifications: Clarification[];
  documents: { id: string; kind: string; label: string | null; fileName: string; createdAt: string; expiresAt: string | null }[];
  evcSchedules: { id: string; scheduledFor: string; status: string; memberIds: string[]; venue: string | null }[];
  canRespond: boolean;
  canUpload: boolean;
}) {
  const router = useRouter();
  const [remark, setRemark] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ text: string; citations: string[] } | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [risk, setRisk] = useState<{ value: string; factors: string[] } | null>(null);
  const [riskBusy, setRiskBusy] = useState(false);

  const checklist = CHECKLIST_BY_TYPE[application.type] ?? [];
  const submittedKinds = new Set(documents.map((d) => d.kind));
  const missing = checklist.filter((c) => !submittedKinds.has(c.kind));
  const currentStage = stages.find((s) => s.id === application.currentStageId);
  const openClarification = clarifications.find((c) => c.status === "OPEN");

  const selectedAction = actions.find((a) => a.action === pending);

  async function submitAction(action: string) {
    const def = actions.find((a) => a.action === action);
    if (def?.requiresRemark && remark.trim().length < 3) {
      setError("This action requires a remark of at least 3 characters.");
      return;
    }
    setPending(action);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${application.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, remark: remark.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The move was rejected");
      setNotice(`Moved to ${json.data.toStage}. ${json.data.notificationsQueued} notification(s) queued.`);
      setRemark("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The move was rejected");
    } finally {
      setPending(null);
    }
  }

  async function loadSummary() {
    setSummaryBusy(true);
    try {
      const res = await fetch("/api/ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: application.id }),
      });
      const json = await res.json();
      if (res.ok) setSummary(json.data.summary);
    } finally {
      setSummaryBusy(false);
    }
  }

  async function loadRisk() {
    setRiskBusy(true);
    try {
      const res = await fetch("/api/ai/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: application.id }),
      });
      const json = await res.json();
      if (res.ok) setRisk(json.data.risk);
    } finally {
      setRiskBusy(false);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const kind = (e.target.dataset.kind as string) || "SUPPORTING_DOC";
    setUploadBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      const res = await fetch(`/api/applications/${application.id}/documents`, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload rejected");
      setNotice(`${json.data.document.fileName} uploaded. Pre-check is advisory only.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload rejected");
    } finally {
      setUploadBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card card-pad">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-brand">{application.appNo}</span>
              <Badge tone={STATUS_TONE[application.status] ?? "neutral"}>{STATUS_LABELS[application.status] ?? application.status}</Badge>
              <Badge tone={SLA_TONE[sla.state] ?? "neutral"} dot>
                {SLA_LABELS[sla.state] ?? sla.state}
              </Badge>
              {risk && <Badge tone={RISK_TONE[risk.value] ?? "neutral"}>{risk.value} delay risk</Badge>}
            </div>
            <h1 className="mt-2 text-lg font-semibold tracking-tight text-ink sm:text-xl">{application.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {application.institution.name} · {application.institution.aicteId} · {application.institution.state}
            </p>
            <p className="mt-0.5 text-xs text-muted">{TYPE_LABELS[application.type] ?? application.type}</p>
          </div>

          <div className="shrink-0 space-y-2 lg:w-72">
            <div className="rounded-xl border border-line bg-canvas px-3.5 py-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted">
                  {sla.state === "PAUSED" ? <Pause className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                  {currentStage?.name ?? "No stage"}
                </span>
                <span className="font-medium text-ink">{formatDate(application.slaDueAt)}</span>
              </div>
              <div className="mt-2.5">
                <Progress
                  value={sla.state === "PAUSED" ? 0 : sla.percent * 100}
                  tone={sla.state === "OVERDUE" ? "danger" : sla.state === "DUE_SOON" ? "warn" : "ok"}
                  showLabel
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                {sla.state === "PAUSED"
                  ? "Clock paused while the institution responds"
                  : `${sla.elapsed} working day(s) used, ${Math.max(0, sla.remaining)} remaining`}
              </p>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => void loadSummary()} disabled={summaryBusy} className="btn-ghost btn-sm flex-1">
                {summaryBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Summary
              </button>
              <button type="button" onClick={() => void loadRisk()} disabled={riskBusy} className="btn-ghost btn-sm flex-1">
                {riskBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertCircle className="h-3.5 w-3.5" />}
                Risk
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {summary && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 rounded-xl border border-brand/25 bg-brand-soft px-4 py-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-ink">
                  <Sparkles className="h-3.5 w-3.5" />
                  Suggested summary — not saved as a remark
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink">{summary.text}</p>
                {summary.citations.length > 0 && (
                  <p className="mt-2 text-[10px] text-muted">
                    Sources: {summary.citations.map((c) => c.slice(0, 8)).join(", ")}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {risk && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-3 rounded-xl border border-line bg-canvas px-4 py-3">
                <p className="text-[11px] font-semibold text-ink">Delay risk: {risk.value} — contributing factors</p>
                <ul className="mt-1.5 space-y-0.5">
                  {risk.factors.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[11px] text-muted">
                      <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-brand" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {notice && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-4">
              <div className="flex items-start gap-2.5 rounded-xl border border-ok/25 bg-ok/5 px-3.5 py-3 text-xs text-ok">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{notice}</span>
              </div>
            </motion.div>
          )}
          {error && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-4">
              <div className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/5 px-3.5 py-3 text-xs text-danger">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Workflow route */}
          <Card>
            <CardHeader title="Workflow route" subtitle="Stages for this application type, with the case's current position" />
            <CardBody>
              <ol className="relative space-y-1">
                {stages.map((stage, i) => {
                  const reached = history.some((h) => h.stage?.code === stage.code);
                  const current = stage.id === application.currentStageId;
                  const row = history.find((h) => h.stage?.code === stage.code);
                  return (
                    <li key={stage.id} className="relative flex gap-3.5 pb-4 last:pb-0">
                      {i < stages.length - 1 && (
                        <span
                          className={cn(
                            "absolute left-[13px] top-7 h-full w-px",
                            reached ? "bg-brand/40" : "bg-line",
                          )}
                        />
                      )}
                      <span
                        className={cn(
                          "relative z-10 mt-0.5 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors",
                          current
                            ? "border-brand bg-brand text-white shadow-glow"
                            : reached
                              ? "border-brand/40 bg-brand-soft text-brand-ink"
                              : "border-line bg-surface text-muted",
                        )}
                      >
                        {reached && !current ? <CheckCircle2 className="h-3.5 w-3.5" /> : stage.sequence + 1}
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("text-sm font-medium", current ? "text-brand-ink" : reached ? "text-ink" : "text-muted")}>
                            {stage.name}
                          </span>
                          {current && <Badge tone="brand">Current</Badge>}
                          {stage.isTerminal && <Badge tone="neutral">Terminal</Badge>}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {stage.assigneeRole.replace(/_/g, " ").toLowerCase()} · allowance {stage.slaWorkingDays} working day(s)
                          {row?.daysInStage !== null && row?.daysInStage !== undefined && ` · took ${row.daysInStage} day(s)`}
                          {row?.slaMet === false && " · allowance exceeded"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardBody>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader title="Case timeline" subtitle="Every stage, action, remark and alert in one place" />
            <CardBody>
              {history.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted">No recorded activity yet.</p>
              ) : (
                <ol className="space-y-3.5">
                  {[...history].reverse().map((h) => (
                    <li key={h.id} className="flex gap-3.5">
                      <span className="mt-1 flex h-2 w-2 shrink-0 rounded-full bg-brand" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-ink">{ACTION_LABELS[h.action] ?? humanise(h.action)}</span>
                          {h.stage && <Badge tone="neutral">{h.stage.name}</Badge>}
                          {h.slaMet === false && <Badge tone="danger">Breach</Badge>}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {h.actor?.name ?? "System"} · {h.actor?.role ? humanise(h.actor.role) : "automated"} ·{" "}
                          {formatDateTime(h.enteredAt)}
                        </p>
                        {h.remark && (
                          <p className="mt-1.5 rounded-lg border border-line bg-canvas px-3 py-2 text-xs leading-relaxed text-ink">
                            {h.remark}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>

          {/* Clarifications */}
          {clarifications.length > 0 && (
            <Card>
              <CardHeader title="Clarification threads" subtitle="Requests to the institution and their answers" />
              <CardBody className="space-y-3">
                {clarifications.map((c) => (
                  <div key={c.id} className="rounded-xl border border-line px-3.5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge tone={c.status === "OPEN" ? "warn" : "ok"} dot>
                        {humanise(c.status)}
                      </Badge>
                      <span className="text-[11px] text-muted">
                        Raised {formatDate(c.createdAt)}
                        {c.dueAt && ` · due ${formatDate(c.dueAt)}`}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-ink">{c.reason}</p>
                    <p className="mt-1 text-[11px] text-muted">by {c.raisedBy?.name ?? "Officer"}</p>
                    {c.response && (
                      <div className="mt-2.5 rounded-lg border border-ok/25 bg-ok/5 px-3 py-2">
                        <p className="text-[11px] font-semibold text-ok">Institution response</p>
                        <p className="mt-1 text-xs leading-relaxed text-ink">{c.response}</p>
                        <p className="mt-1 text-[11px] text-muted">
                          {c.respondedBy?.name ?? "Institution"} · {formatDateTime(c.respondedAt)}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {/* Documents */}
          <Card>
            <CardHeader
              title="Documents"
              subtitle={`${documents.length} uploaded · ${missing.filter((m) => m.mandatory).length} mandatory item(s) outstanding`}
            />
            <CardBody className="space-y-3">
              {missing.length > 0 && (
                <div className="rounded-xl border border-warn/25 bg-warn/5 px-3.5 py-3">
                  <p className="text-[11px] font-semibold text-ink">Checklist outstanding</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {missing.map((m) => (
                      <Badge key={m.kind} tone={m.mandatory ? "warn" : "neutral"}>
                        {m.label}
                        {m.mandatory && " · mandatory"}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {documents.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted">No documents uploaded yet.</p>
              ) : (
                <div className="space-y-2">
                  {documents.map((d) => (
                    <div key={d.id} className="rounded-xl border border-line px-3.5 py-2.5">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 shrink-0 text-brand" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-ink">{d.label ?? d.kind}</p>
                          <p className="truncate text-[11px] text-muted">
                            {d.fileName} · {formatDate(d.createdAt)}
                            {d.expiresAt && ` · expires ${formatDate(d.expiresAt)}`}
                          </p>
                        </div>
                      </div>
                      <DocumentAnalyzer applicationId={application.id} documentId={d.id} kind={d.kind} />
                    </div>
                  ))}
                </div>
              )}

              {canUpload && (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-3 text-xs font-medium text-muted transition-colors hover:border-brand/40 hover:bg-brand-soft/40 hover:text-brand-ink">
                  {uploadBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploadBusy ? "Uploading" : "Upload a document"}
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.docx,.xlsx"
                    onChange={onUpload}
                    data-kind={missing[0]?.kind ?? "SUPPORTING_DOC"}
                    disabled={uploadBusy}
                  />
                </label>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Action panel */}
        <div className="space-y-5">
          <Card className="lg:sticky lg:top-20">
            <CardHeader title="Available actions" subtitle="Only moves configured for your role are shown" />
            <CardBody className="space-y-3">
              {openClarification && canRespond && (
                <div className="rounded-xl border border-warn/30 bg-warn/5 px-3.5 py-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
                    <MessageSquareWarning className="h-3.5 w-3.5 text-warn" />
                    Awaiting your response
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{openClarification.reason}</p>
                </div>
              )}

              <div>
                <label htmlFor="remark" className="label">
                  Remark
                </label>
                <textarea
                  id="remark"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={4}
                  placeholder="Record your reasoning. Required for scrutiny, return, forwarding and decisions."
                  className="input resize-none"
                />
                {selectedAction?.requiresRemark && remark.trim().length < 3 && (
                  <p className="mt-1.5 text-[11px] text-warn">This action requires a remark.</p>
                )}
              </div>

              {actions.length === 0 ? (
                <div className="rounded-xl border border-line bg-canvas px-3.5 py-4 text-center">
                  <p className="text-xs font-medium text-ink">No actions available</p>
                  <p className="mt-1 text-[11px] text-muted">
                    Either the case is closed, or no move at this stage is configured for your role.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {actions.map((a) => {
                    const isDestructive = ["REJECT", "WITHDRAW"].includes(a.action);
                    const isReturn = a.action === "RETURN_FOR_CLARIFICATION";
                    return (
                      <button
                        key={a.action}
                        type="button"
                        onClick={() => void submitAction(a.action)}
                        disabled={pending !== null}
                        className={cn(
                          "w-full",
                          isDestructive ? "btn-danger" : isReturn ? "btn-ghost border-warn/40 text-warn hover:bg-warn/5" : "btn-primary",
                        )}
                      >
                        {pending === a.action ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowRight className="h-4 w-4" />
                        )}
                        {a.label ?? ACTION_LABELS[a.action] ?? humanise(a.action)}
                      </button>
                    );
                  })}
                </div>
              )}

              <p className="border-t border-line pt-3 text-[10px] leading-relaxed text-muted">
                Every action is recorded in the append-only audit trail. No timer or suggestion can approve or
                reject a case — only an authorised official can.
              </p>
            </CardBody>
          </Card>

          {evcSchedules.length > 0 && (
            <Card>
              <CardHeader title="EVC visits" subtitle="Scheduled expert committee visits" />
              <CardBody className="space-y-2">
                {evcSchedules.map((e) => (
                  <div key={e.id} className="rounded-xl border border-line px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-ink">{formatDate(e.scheduledFor)}</span>
                      <Badge tone={e.status === "COMPLETED" ? "ok" : e.status === "CANCELLED" ? "danger" : "info"}>
                        {humanise(e.status)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      {e.memberIds.length} member(s){e.venue ? ` · ${e.venue}` : ""}
                    </p>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
