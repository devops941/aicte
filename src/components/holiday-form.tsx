"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

/** Adds a holiday to the calendar that drives the SLA calculator. */
export function HolidayForm({ regions }: { regions: { id: string; name: string }[] }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [regionId, setRegionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, label, regionId: regionId || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not add the holiday");
      setMessage({ tone: "ok", text: `${label} added to the calendar.` });
      setDate("");
      setLabel("");
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not add the holiday" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="h-fit animate-fade-up">
      <CardHeader title="Add a holiday" subtitle="National by default, or scope it to one region" />
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-3.5">
          <div>
            <label htmlFor="h-date" className="label">
              Date
            </label>
            <input
              id="h-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="h-label" className="label">
              Occasion
            </label>
            <input
              id="h-label"
              required
              minLength={2}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="input"
              placeholder="e.g. State Formation Day"
            />
          </div>
          <div>
            <label htmlFor="h-region" className="label">
              Applies to
            </label>
            <select id="h-region" value={regionId} onChange={(e) => setRegionId(e.target.value)} className="input">
              <option value="">All regions (national)</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {message && (
            <p className={`text-[11px] ${message.tone === "ok" ? "text-ok" : "text-danger"}`}>{message.text}</p>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            Add holiday
          </button>
        </form>
      </CardBody>
    </Card>
  );
}
