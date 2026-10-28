"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Pencil } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ROLE_LABELS, TYPE_LABELS } from "@/lib/constants";

export type PolicyRow = {
  id: string;
  level: number;
  afterWorkingDays: number;
  targetRole: string;
  channel: string;
  scope: string | null;
  regionId: string | null;
  isActive: boolean;
  description: string | null;
};

type Region = { id: string; name: string };

const ROLES = Object.keys(ROLE_LABELS);
const SCOPES = Object.keys(TYPE_LABELS);

/**
 * Creates and edits escalation rungs. The server owns the rules (permission,
 * unique level per scope/region, ladder order); this form only collects input
 * and surfaces whatever the server returns.
 */
export function EscalationEditor({ policies, regions }: { policies: PolicyRow[]; regions: Region[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [level, setLevel] = useState("1");
  const [afterWorkingDays, setAfterWorkingDays] = useState("3");
  const [targetRole, setTargetRole] = useState("REGIONAL_OFFICER");
  const [channel, setChannel] = useState("IN_APP");
  const [scope, setScope] = useState("");
  const [regionId, setRegionId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function reset() {
    setOpen(false);
    setEditingId(null);
    setLevel("1");
    setAfterWorkingDays("3");
    setTargetRole("REGIONAL_OFFICER");
    setChannel("IN_APP");
    setScope("");
    setRegionId("");
    setIsActive(true);
    setDescription("");
    setMessage(null);
  }

  function startCreate() {
    reset();
    setOpen(true);
    const next = Math.max(0, ...policies.map((p) => p.level)) + 1;
    setLevel(String(next));
  }

  function startEdit(p: PolicyRow) {
    setOpen(true);
    setEditingId(p.id);
    setLevel(String(p.level));
    setAfterWorkingDays(String(p.afterWorkingDays));
    setTargetRole(p.targetRole);
    setChannel(p.channel);
    setScope(p.scope ?? "");
    setRegionId(p.regionId ?? "");
    setIsActive(p.isActive);
    setDescription(p.description ?? "");
    setMessage(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/escalation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId ?? undefined,
          level: Number(level),
          afterWorkingDays: Number(afterWorkingDays),
          targetRole,
          channel,
          scope: scope || null,
          regionId: regionId || null,
          isActive,
          description: description || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save the policy");
      setMessage({ tone: "ok", text: editingId ? "Rung updated." : "Rung created." });
      reset();
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not save the policy" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-5 animate-fade-up">
      <CardHeader
        title="Escalation ladder"
        subtitle="A rung fires once a case is that many working days past its deadline"
        action={
          open ? (
            <button type="button" onClick={reset} className="btn-ghost btn-sm">
              Close
            </button>
          ) : (
            <button type="button" onClick={startCreate} className="btn-primary btn-sm">
              <Plus className="h-3.5 w-3.5" />
              Add rung
            </button>
          )
        }
      />
      <CardBody className="space-y-4">
        {open && (
          <form onSubmit={submit} className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="esc-level" className="label">
                  Level
                </label>
                <input
                  id="esc-level"
                  type="number"
                  min={1}
                  max={10}
                  required
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="esc-days" className="label">
                  After working days
                </label>
                <input
                  id="esc-days"
                  type="number"
                  min={0}
                  max={365}
                  required
                  value={afterWorkingDays}
                  onChange={(e) => setAfterWorkingDays(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="esc-role" className="label">
                  Target role
                </label>
                <select id="esc-role" value={targetRole} onChange={(e) => setTargetRole(e.target.value)} className="input">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="esc-channel" className="label">
                  Channel
                </label>
                <select id="esc-channel" value={channel} onChange={(e) => setChannel(e.target.value)} className="input">
                  <option value="IN_APP">In-app</option>
                  <option value="EMAIL">Email</option>
                </select>
              </div>
              <div>
                <label htmlFor="esc-scope" className="label">
                  Application type
                </label>
                <select id="esc-scope" value={scope} onChange={(e) => setScope(e.target.value)} className="input">
                  <option value="">All types</option>
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {TYPE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="esc-region" className="label">
                  Region
                </label>
                <select id="esc-region" value={regionId} onChange={(e) => setRegionId(e.target.value)} className="input">
                  <option value="">All regions</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-line"
                  />
                  Active
                </label>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label htmlFor="esc-desc" className="label">
                  Description
                </label>
                <input
                  id="esc-desc"
                  maxLength={300}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input"
                  placeholder="e.g. Escalate to the regional officer"
                />
              </div>
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full sm:w-auto">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {editingId ? "Save rung" : "Create rung"}
            </button>
          </form>
        )}

        {message && (
          <p className={`text-[11px] ${message.tone === "ok" ? "text-ok" : "text-danger"}`}>{message.text}</p>
        )}

        {policies.length > 0 && (
          <div className="space-y-1.5 border-t border-line pt-3">
            {policies.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
                <div className="min-w-0 text-[11px] text-muted">
                  <span className="font-semibold text-ink">L{p.level}</span> · after {p.afterWorkingDays} working day(s) ·{" "}
                  {ROLE_LABELS[p.targetRole] ?? p.targetRole} · {p.channel === "EMAIL" ? "Email" : "In-app"}
                  {p.scope ? ` · ${TYPE_LABELS[p.scope] ?? p.scope}` : ""}
                  {p.regionId ? ` · ${regions.find((r) => r.id === p.regionId)?.name ?? "region"}` : ""}
                  {p.isActive ? "" : " · inactive"}
                </div>
                <button type="button" onClick={() => startEdit(p)} disabled={busy} className="btn-ghost btn-sm">
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
