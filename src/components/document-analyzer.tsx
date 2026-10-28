"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, Loader2, ShieldAlert, Sparkles, XCircle } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Finding = {
  code: string;
  severity: "BLOCKER" | "WARNING" | "INFO";
  message: string;
  clause: string;
  field?: string;
};

type Analysis = {
  kind: string;
  title: string;
  clause: string;
  verdict: "COMPLIANT" | "NEEDS_ATTENTION" | "INCOMPLETE" | "UNKNOWN_KIND";
  score: number;
  findings: Finding[];
  checks: { code: string; label: string; passed: boolean }[];
  isSuggestion: boolean;
  source: string;
};

const VERDICT_TONE: Record<Analysis["verdict"], Tone> = {
  COMPLIANT: "ok",
  NEEDS_ATTENTION: "warn",
  INCOMPLETE: "danger",
  UNKNOWN_KIND: "neutral",
};

const VERDICT_LABEL: Record<Analysis["verdict"], string> = {
  COMPLIANT: "Compliant with the specification",
  NEEDS_ATTENTION: "Needs attention",
  INCOMPLETE: "Incomplete — blockers found",
  UNKNOWN_KIND: "No specification on file",
};

const SEVERITY_TONE: Record<Finding["severity"], Tone> = {
  BLOCKER: "danger",
  WARNING: "warn",
  INFO: "info",
};

function SeverityIcon({ severity }: { severity: Finding["severity"] }) {
  if (severity === "BLOCKER") return <XCircle className="h-3.5 w-3.5 text-danger" />;
  if (severity === "WARNING") return <AlertTriangle className="h-3.5 w-3.5 text-warn" />;
  return <Info className="h-3.5 w-3.5 text-info" />;
}

/**
 * "Analyze document" panel. Runs the AICTE specification check for one stored
 * document and shows the findings, each with the clause it came from. The
 * result is advisory: it is labelled as a suggestion and changes no status.
 */
export function DocumentAnalyzer({
  applicationId,
  documentId,
  kind,
}: {
  applicationId: string;
  documentId: string;
  kind: string;
}) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [spec, setSpec] = useState<{ title: string; clause: string; validityMonths: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/documents/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The analysis could not be completed");
      setAnalysis(json.data.analysis);
      setSpec(json.data.spec);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The analysis could not be completed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-brand/25 bg-brand-soft/50 px-2.5 py-1.5",
          "text-[11px] font-semibold text-brand-ink transition-all hover:bg-brand-soft disabled:opacity-60",
        )}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {busy ? "Analysing" : "Analyze document"}
      </button>

      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 text-[11px] text-danger"
          >
            {error}
          </motion.p>
        )}

        {analysis && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="mt-3 space-y-3 rounded-xl border border-line bg-canvas/60 px-3.5 py-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={VERDICT_TONE[analysis.verdict]} dot>
                {VERDICT_LABEL[analysis.verdict]}
              </Badge>
              <span className="text-[11px] font-medium text-muted">
                {Math.round(analysis.score * 100)}% specification match
              </span>
              {analysis.isSuggestion && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                  <ShieldAlert className="h-3 w-3" />
                  Advisory only
                </span>
              )}
            </div>

            {/* Specification checks */}
            <div className="flex flex-wrap gap-1.5">
              {analysis.checks.map((c) => (
                <span
                  key={c.code}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium",
                    c.passed ? "border-ok/25 bg-ok/5 text-ok" : "border-danger/25 bg-danger/5 text-danger",
                  )}
                >
                  {c.passed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  {c.label}
                </span>
              ))}
            </div>

            {/* Findings, each citing its clause */}
            {analysis.findings.length === 0 ? (
              <p className="text-[11px] text-ok">
                No issues found against the {spec?.title ?? analysis.title} specification.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {analysis.findings.map((f) => (
                  <li key={f.code} className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">
                      <SeverityIcon severity={f.severity} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] leading-relaxed text-ink">{f.message}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted">
                        <Badge tone={SEVERITY_TONE[f.severity]} className="px-1.5 py-0 text-[9px]">
                          {f.severity}
                        </Badge>
                        {f.clause}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {spec && (
              <p className="border-t border-line pt-2 text-[10px] leading-relaxed text-muted">
                {spec.title}
                {spec.validityMonths ? ` · valid for ${spec.validityMonths} months` : ""} · {kind}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
