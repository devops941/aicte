"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TYPE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const TYPES = Object.keys(TYPE_LABELS);

export function NewApplicationForm() {
  const router = useRouter();
  const [type, setType] = useState("NEW_ENGINEERING");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [intakeRequested, setIntakeRequested] = useState("");
  const [courseName, setCourseName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{ value: string; confidence: number; factors: string[] } | null>(null);
  const [suggestBusy, setSuggestBusy] = useState(false);

  async function askSuggestion() {
    setSuggestBusy(true);
    try {
      const res = await fetch("/api/ai/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intakeRequested: intakeRequested ? Number(intakeRequested) : null,
          courseName: courseName || null,
          isNewInstitution: true,
        }),
      });
      const json = await res.json();
      if (res.ok) setSuggestion(json.data.suggestion);
    } finally {
      setSuggestBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title,
          summary: summary || null,
          intakeRequested: intakeRequested ? Number(intakeRequested) : null,
          courseName: courseName || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create the application");
      router.push(`/applications/${json.data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the application");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <div className="card card-pad animate-fade-up">
          <h2 className="text-sm font-semibold text-ink">Application details</h2>
          <p className="mt-0.5 text-xs text-muted">
            The routing, stage sequence and deadlines come from the workflow configured for the type you pick.
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label className="label">Application type</label>
              <div className="grid gap-2 sm:grid-cols-2">
                {TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      "rounded-xl border px-3.5 py-3 text-left text-xs font-medium transition-all duration-200",
                      type === t
                        ? "border-brand/50 bg-brand-soft text-brand-ink shadow-soft"
                        : "border-line bg-surface text-muted hover:border-brand/30 hover:text-ink",
                    )}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="title" className="label">
                Title
              </label>
              <input
                id="title"
                required
                minLength={5}
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input"
                placeholder="e.g. New B.Tech Programme Approval 2026-27"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="intake" className="label">
                  Intake requested
                </label>
                <input
                  id="intake"
                  type="number"
                  min={1}
                  value={intakeRequested}
                  onChange={(e) => setIntakeRequested(e.target.value)}
                  className="input"
                  placeholder="e.g. 120"
                />
              </div>
              <div>
                <label htmlFor="course" className="label">
                  Course name
                </label>
                <input
                  id="course"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  className="input"
                  placeholder="e.g. Computer Science and Engineering"
                />
              </div>
            </div>

            <div>
              <label htmlFor="summary" className="label">
                Summary
              </label>
              <textarea
                id="summary"
                rows={4}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="input resize-none"
                placeholder="A short description of what is being applied for."
              />
            </div>
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              <div className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/5 px-3.5 py-3 text-xs text-danger">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2">
          <button type="submit" disabled={busy || title.trim().length < 5} className="btn-primary">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Create draft
          </button>
          <button type="button" onClick={() => router.back()} className="btn-ghost">
            Cancel
          </button>
        </div>
      </div>

      <div className="space-y-5">
        <div className="card card-pad animate-fade-up">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Sparkles className="h-3.5 w-3.5 text-brand" />
                Suggested type
              </h3>
              <p className="mt-0.5 text-[11px] text-muted">
                A suggestion from the values you entered. You choose the final type.
              </p>
            </div>
            <button type="button" onClick={() => void askSuggestion()} disabled={suggestBusy} className="btn-ghost btn-sm">
              {suggestBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ask"}
            </button>
          </div>

          <AnimatePresence>
            {suggestion && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mt-3 rounded-xl border border-brand/25 bg-brand-soft px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone="brand">{TYPE_LABELS[suggestion.value] ?? suggestion.value}</Badge>
                    <span className="text-[11px] text-muted">{Math.round(suggestion.confidence * 100)}% confidence</span>
                  </div>
                  <ul className="mt-2 space-y-0.5">
                    {suggestion.factors.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-[11px] text-muted">
                        <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-brand" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setType(suggestion.value)}
                    className="mt-2.5 text-[11px] font-medium text-brand hover:underline"
                  >
                    Use this type
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="card card-pad animate-fade-up">
          <h3 className="text-sm font-semibold text-ink">What happens next</h3>
          <ol className="mt-3 space-y-2.5">
            {[
              "The application is created as a draft with a generated number.",
              "Submitting routes it to the first stage of the configured workflow.",
              "Each stage has its own allowance and owner role.",
              "If a remark or document is missing, the officer returns it to you.",
              "Deadlines are measured in working days, skipping weekends and holidays.",
            ].map((step, i) => (
              <li key={step} className="flex gap-2.5 text-xs text-muted">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] font-bold text-brand">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </form>
  );
}
