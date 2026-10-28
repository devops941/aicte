"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, X } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export type InstitutionRow = {
  id: string;
  aicteId: string;
  name: string;
  state: string;
  district: string | null;
  city: string | null;
  regionId: string;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
};

type Region = { id: string; name: string; code: string };

const EMPTY = {
  aicteId: "",
  name: "",
  state: "",
  district: "",
  city: "",
  regionId: "",
  contactEmail: "",
  contactPhone: "",
};

/**
 * Create/edit form for an institution. Editing sends only the fields that
 * changed, so a concurrent edit to another field is not silently reverted.
 */
export function InstitutionForm({
  regions,
  editing,
  onDone,
}: {
  regions: Region[];
  editing: InstitutionRow | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(
    editing
      ? {
          aicteId: editing.aicteId,
          name: editing.name,
          state: editing.state,
          district: editing.district ?? "",
          city: editing.city ?? "",
          regionId: editing.regionId,
          contactEmail: editing.contactEmail ?? "",
          contactPhone: editing.contactPhone ?? "",
        }
      : { ...EMPTY, regionId: regions[0]?.id ?? "" },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...form,
        district: form.district || null,
        city: form.city || null,
        contactEmail: form.contactEmail || null,
        contactPhone: form.contactPhone || null,
        ...(editing ? { id: editing.id } : {}),
      };
      const res = await fetch("/api/admin/institutions", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The request was rejected");
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title={editing ? `Edit ${editing.name}` : "Register an institution"}
        subtitle="The AICTE id is unique; the region decides which officer sees its cases."
        action={
          editing ? (
            <button type="button" onClick={onDone} className="btn-ghost btn-sm" aria-label="Cancel editing">
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          ) : undefined
        }
      />
      <CardBody>
        <form onSubmit={onSubmit} className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="i-aicteId" className="label">
              AICTE id
            </label>
            <input id="i-aicteId" required minLength={3} maxLength={40} className="input" value={form.aicteId} onChange={(e) => set("aicteId", e.target.value)} />
          </div>
          <div>
            <label htmlFor="i-name" className="label">
              Institution name
            </label>
            <input id="i-name" required minLength={3} maxLength={200} className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label htmlFor="i-state" className="label">
              State
            </label>
            <input id="i-state" required minLength={2} className="input" value={form.state} onChange={(e) => set("state", e.target.value)} />
          </div>
          <div>
            <label htmlFor="i-region" className="label">
              Region
            </label>
            <select id="i-region" required className="input" value={form.regionId} onChange={(e) => set("regionId", e.target.value)}>
              <option value="">Select a region</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="i-city" className="label">
              City
            </label>
            <input id="i-city" className="input" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div>
            <label htmlFor="i-district" className="label">
              District
            </label>
            <input id="i-district" className="input" value={form.district} onChange={(e) => set("district", e.target.value)} />
          </div>
          <div>
            <label htmlFor="i-email" className="label">
              Contact email
            </label>
            <input id="i-email" type="email" className="input" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
          </div>
          <div>
            <label htmlFor="i-phone" className="label">
              Contact phone
            </label>
            <input id="i-phone" className="input" value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger sm:col-span-2">
              {error}
            </p>
          )}

          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {editing ? "Save changes" : "Register institution"}
            </button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

/** Activation toggle and edit trigger for one row. */
export function InstitutionRowActions({ row, onEdit }: { row: InstitutionRow; onEdit: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/institutions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          isActive: !row.isActive,
          reason: row.isActive ? "Deactivated from the admin console" : "Reactivated from the admin console",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The change was rejected");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The change failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-[10px] text-danger">{error}</span>}
      <button type="button" onClick={onEdit} className="btn-ghost btn-sm" aria-label={`Edit ${row.name}`}>
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={toggle} disabled={busy} className={row.isActive ? "btn-danger btn-sm" : "btn-ghost btn-sm"}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {row.isActive ? "Deactivate" : "Activate"}
      </button>
    </div>
  );
}
