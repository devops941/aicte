"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus, X } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/constants";

type AssignUser = { id: string; name: string; email: string; role: string };
type Assignment = { id: string; role: string; user: { id: string; name: string; email: string } };

// Institution Admin is linked to its institution at user creation (Users & Roles),
// so it is NOT assigned here — this page is for the review team only. Ordered by
// the position each role holds in the application workflow.
const ASSIGNABLE_ROLES = ["REGIONAL_OFFICER", "EVC_MEMBER", "BUREAU_OFFICER", "AUDITOR"] as const;

/** What each role does when this institution's application moves through the workflow. */
const ROLE_INFO: Record<string, { stage: string; detail: string }> = {
  REGIONAL_OFFICER: { stage: "Scrutiny", detail: "Checks the submitted documents; returns for clarification or forwards the case." },
  EVC_MEMBER: { stage: "Expert Visit (EVC)", detail: "On-site / campus inspection and committee report." },
  BUREAU_OFFICER: { stage: "Bureau Review", detail: "Second-level review and recommendation before the decision." },
  AUDITOR: { stage: "Audit oversight", detail: "Read-only SLA and audit oversight. Does not verify or decide." },
};

/** Step-by-step team assignment for one institution: one card per role, each with
 *  its current members and a picker to add an eligible user of that role. */
export function InstitutionAssign({
  institutionId,
  assignments,
  users,
}: {
  institutionId: string;
  assignments: Assignment[];
  users: AssignUser[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});

  async function add(role: string) {
    const userId = picked[role];
    if (!userId) return;
    setBusy(`add:${role}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/institutions/${institutionId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not assign");
      setPicked((p) => ({ ...p, [role]: "" }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign");
    } finally {
      setBusy(null);
    }
  }

  async function remove(assignmentId: string) {
    setBusy(`remove:${assignmentId}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/institutions/${institutionId}/assignments?assignmentId=${assignmentId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not remove");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      {ASSIGNABLE_ROLES.map((role) => {
        const current = assignments.filter((a) => a.role === role);
        const assignedIds = new Set(current.map((a) => a.user.id));
        const available = users.filter((u) => u.role === role && !assignedIds.has(u.id));
        return (
          <Card key={role} className="animate-fade-up">
            <CardHeader
              title={ROLE_LABELS[role] ?? role}
              subtitle={`${ROLE_INFO[role]?.stage ?? ""} · ${current.length} assigned`}
            />
            <CardBody>
              <p className="mb-2.5 text-[11px] leading-relaxed text-muted">{ROLE_INFO[role]?.detail}</p>
              <div className="space-y-2">
                {current.length === 0 && <p className="text-[11px] text-muted">No one assigned yet.</p>}
                {current.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{a.user.name}</p>
                      <p className="truncate text-[11px] text-muted">{a.user.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(a.id)}
                      disabled={busy === `remove:${a.id}`}
                      className="btn-ghost btn-sm text-danger"
                      aria-label={`Remove ${a.user.name}`}
                    >
                      {busy === `remove:${a.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <select
                  className="input"
                  value={picked[role] ?? ""}
                  onChange={(e) => setPicked((p) => ({ ...p, [role]: e.target.value }))}
                  aria-label={`Select a ${ROLE_LABELS[role] ?? role}`}
                >
                  <option value="">
                    {available.length ? `Select a ${ROLE_LABELS[role] ?? role}…` : "No eligible users — create one first"}
                  </option>
                  {available.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => add(role)}
                  disabled={!picked[role] || busy === `add:${role}`}
                  className="btn-primary shrink-0"
                >
                  {busy === `add:${role}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  Assign
                </button>
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
