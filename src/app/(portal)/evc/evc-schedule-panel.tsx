"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2, MapPin, Users } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export type SchedulableCase = { id: string; appNo: string; title: string; institution: { name: string } };
export type EligibleMember = { id: string; name: string; region: { name: string } | null };
export type EditableVisit = {
  id: string;
  applicationId: string;
  appNo: string;
  scheduledFor: string;
  status: string;
  venue: string | null;
  notes: string | null;
  memberIds: string[];
};

/**
 * Schedules a new visit or reschedules/cancels an existing one. The panel is
 * driven by props the server already scoped, so it can only offer cases and
 * members the caller is allowed to use. The server re-checks everything.
 */
export function EvcSchedulePanel({
  cases,
  members,
  visits,
}: {
  cases: SchedulableCase[];
  members: EligibleMember[];
  visits: EditableVisit[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [applicationId, setApplicationId] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [venue, setVenue] = useState("");
  const [notes, setNotes] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function reset() {
    setMode("idle");
    setEditingId(null);
    setApplicationId("");
    setScheduledFor("");
    setVenue("");
    setNotes("");
    setMemberIds([]);
    setMessage(null);
  }

  function startCreate() {
    reset();
    setMode("create");
  }

  function startEdit(v: EditableVisit) {
    setMode("edit");
    setEditingId(v.id);
    setApplicationId(v.applicationId);
    setScheduledFor(v.scheduledFor.slice(0, 16));
    setVenue(v.venue ?? "");
    setNotes(v.notes ?? "");
    setMemberIds(v.memberIds);
    setMessage(null);
  }

  function toggleMember(id: string) {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (memberIds.length === 0) {
      setMessage({ tone: "error", text: "Select at least one committee member." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const payload =
        mode === "edit"
          ? { id: editingId, scheduledFor: new Date(scheduledFor).toISOString(), venue: venue || null, notes: notes || null, memberIds }
          : {
              applicationId,
              scheduledFor: new Date(scheduledFor).toISOString(),
              venue: venue || null,
              notes: notes || null,
              memberIds,
            };
      const res = await fetch("/api/evc", {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save the visit");
      setMessage({ tone: "ok", text: mode === "edit" ? "Visit updated." : "Visit scheduled." });
      reset();
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not save the visit" });
    } finally {
      setBusy(false);
    }
  }

  async function cancelVisit(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/evc", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "CANCELLED" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not cancel the visit");
      setMessage({ tone: "ok", text: "Visit cancelled." });
      reset();
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not cancel the visit" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Schedule a visit"
        subtitle="Book an Expert Visit Committee, or reschedule and cancel an existing visit"
        action={
          mode === "idle" ? (
            <button type="button" onClick={startCreate} disabled={cases.length === 0} className="btn-primary btn-sm">
              <CalendarPlus className="h-3.5 w-3.5" />
              Schedule visit
            </button>
          ) : (
            <button type="button" onClick={reset} className="btn-ghost btn-sm">
              Close
            </button>
          )
        }
      />
      <CardBody className="space-y-4">
        {mode !== "idle" && (
          <form onSubmit={submit} className="space-y-3.5">
            <div>
              <label htmlFor="evc-case" className="label">
                Application
              </label>
              <select
                id="evc-case"
                required
                value={applicationId}
                onChange={(e) => setApplicationId(e.target.value)}
                disabled={mode === "edit"}
                className="input"
              >
                <option value="">Select a case at the EVC stage</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.appNo} — {c.institution.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="evc-when" className="label">
                  Date and time
                </label>
                <input
                  id="evc-when"
                  type="datetime-local"
                  required
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="evc-venue" className="label">
                  Venue
                </label>
                <input
                  id="evc-venue"
                  maxLength={200}
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  className="input"
                  placeholder="e.g. Institute campus, Chennai"
                />
              </div>
            </div>

            <fieldset>
              <legend className="label flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Committee members ({memberIds.length})
              </legend>
              <div className="mt-1 max-h-44 space-y-1.5 overflow-y-auto rounded-xl border border-line p-2">
                {members.length === 0 ? (
                  <p className="px-1 py-2 text-[11px] text-muted">No active EVC members are available.</p>
                ) : (
                  members.map((m) => (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs hover:bg-canvas"
                    >
                      <input
                        type="checkbox"
                        checked={memberIds.includes(m.id)}
                        onChange={() => toggleMember(m.id)}
                        className="h-4 w-4 rounded border-line"
                      />
                      <span className="text-ink">{m.name}</span>
                      {m.region?.name && <span className="text-[10px] text-muted">{m.region.name}</span>}
                    </label>
                  ))
                )}
              </div>
            </fieldset>

            <div>
              <label htmlFor="evc-notes" className="label">
                Notes
              </label>
              <textarea
                id="evc-notes"
                rows={2}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input"
                placeholder="Anything the committee should know"
              />
            </div>

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              {mode === "edit" ? "Save changes" : "Schedule visit"}
            </button>
          </form>
        )}

        {message && (
          <p className={`text-[11px] ${message.tone === "ok" ? "text-ok" : "text-danger"}`}>{message.text}</p>
        )}

        {visits.length > 0 && (
          <div className="space-y-2 border-t border-line pt-3">
            <p className="text-[11px] font-medium text-muted">Manage existing visits</p>
            {visits.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
                <div className="min-w-0">
                  <span className="font-mono text-[11px] font-semibold text-brand">{v.appNo}</span>
                  <p className="flex items-center gap-1.5 text-[11px] text-muted">
                    <MapPin className="h-3 w-3" />
                    {v.venue ?? "Venue not set"} · {v.memberIds.length} member(s)
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => startEdit(v)} disabled={busy} className="btn-ghost btn-sm">
                    Reschedule
                  </button>
                  <button type="button" onClick={() => void cancelVisit(v.id)} disabled={busy} className="btn-danger btn-sm">
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
