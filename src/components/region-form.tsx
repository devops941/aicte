"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Loader2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

/** Adds a region. Institutions, users and holidays read regions from this table,
 *  so a new region appears in those dropdowns immediately. */
export function RegionForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/regions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not add the region");
      setMessage({ tone: "ok", text: `${name} added.` });
      setCode("");
      setName("");
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not add the region" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="h-fit animate-fade-up">
      <CardHeader title="Add a region" subtitle="A short code and a display name" />
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-3.5">
          <div>
            <label htmlFor="r-code" className="label">
              Code
            </label>
            <input
              id="r-code"
              required
              minLength={2}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="input"
              placeholder="e.g. SOUTH"
            />
          </div>
          <div>
            <label htmlFor="r-name" className="label">
              Name
            </label>
            <input
              id="r-name"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="e.g. Southern Region"
            />
          </div>

          {message && (
            <p className={`text-[11px] ${message.tone === "ok" ? "text-ok" : "text-danger"}`}>{message.text}</p>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            Add region
          </button>
        </form>
      </CardBody>
    </Card>
  );
}
