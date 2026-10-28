"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Pencil, ShieldCheck, UserPlus, X } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

const ROLES = [
  "INSTITUTION_ADMIN",
  "REGIONAL_OFFICER",
  "BUREAU_OFFICER",
  "EVC_MEMBER",
  "COMPETENT_AUTHORITY",
  "SYSTEM_ADMIN",
  "SUPER_ADMIN",
  "AUDITOR",
] as const;

const ROLE_LABELS: Record<string, string> = {
  INSTITUTION_ADMIN: "Institution Admin",
  REGIONAL_OFFICER: "Regional Officer",
  BUREAU_OFFICER: "Bureau Officer",
  EVC_MEMBER: "EVC Member",
  COMPETENT_AUTHORITY: "Competent Authority",
  SYSTEM_ADMIN: "System Admin",
  SUPER_ADMIN: "Super Admin",
  AUDITOR: "Auditor",
};

export type EditableUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  designation: string | null;
  phone: string | null;
  regionId: string | null;
  institutionId: string | null;
  isActive: boolean;
};

type Option = { id: string; name: string; code?: string };

/** Create or edit one account. Role rules are enforced again on the server. */
export function UserForm({
  regions,
  institutions,
  editing,
  actorRole,
  onDone,
}: {
  regions: Option[];
  institutions: Option[];
  editing: EditableUser | null;
  actorRole: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    email: editing?.email ?? "",
    name: editing?.name ?? "",
    role: editing?.role ?? "REGIONAL_OFFICER",
    password: "",
    regionId: editing?.regionId ?? "",
    institutionId: editing?.institutionId ?? "",
    designation: editing?.designation ?? "",
    phone: editing?.phone ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // A System Admin cannot mint a Super Admin; the option is hidden and the API
  // refuses it as well, so the rule holds even against a hand-crafted request.
  const roleOptions = ROLES.filter((r) => r !== "SUPER_ADMIN" || actorRole === "SUPER_ADMIN");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        role: form.role,
        regionId: form.regionId || null,
        institutionId: form.institutionId || null,
        designation: form.designation || null,
        phone: form.phone || null,
      };
      if (editing) {
        payload.id = editing.id;
      } else {
        payload.email = form.email;
        payload.password = form.password;
      }
      const res = await fetch("/api/admin/users", {
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
        title={editing ? `Edit ${editing.name}` : "Create an account"}
        subtitle="Role and scope decide what the account can see. Changes are audited."
        action={
          <button type="button" onClick={onDone} className="btn-ghost btn-sm">
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        }
      />
      <CardBody>
        <form onSubmit={onSubmit} className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="u-name" className="label">
              Full name
            </label>
            <input id="u-name" required minLength={2} className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label htmlFor="u-email" className="label">
              Email
            </label>
            <input
              id="u-email"
              type="email"
              required
              disabled={Boolean(editing)}
              className="input disabled:opacity-60"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          {!editing && (
            <div>
              <label htmlFor="u-password" className="label">
                Initial password
              </label>
              <input
                id="u-password"
                type="password"
                required
                minLength={8}
                className="input"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
          )}
          <div>
            <label htmlFor="u-role" className="label">
              Role
            </label>
            <select id="u-role" className="input" value={form.role} onChange={(e) => set("role", e.target.value)}>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="u-designation" className="label">
              Designation
            </label>
            <input id="u-designation" className="input" value={form.designation} onChange={(e) => set("designation", e.target.value)} />
          </div>
          <div>
            <label htmlFor="u-phone" className="label">
              Phone
            </label>
            <input id="u-phone" className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <label htmlFor="u-region" className="label">
              Region
            </label>
            <select id="u-region" className="input" value={form.regionId} onChange={(e) => set("regionId", e.target.value)}>
              <option value="">None</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="u-institution" className="label">
              Institution
            </label>
            <select id="u-institution" className="input" value={form.institutionId} onChange={(e) => set("institutionId", e.target.value)}>
              <option value="">None</option>
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger sm:col-span-2">
              {error}
            </p>
          )}

          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {editing ? "Save changes" : "Create account"}
            </button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

/** Per-row actions: edit, activate/deactivate, and password reset. */
export function UserRowActions({ user, onEdit }: { user: EditableUser; onEdit: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<string | null>(null);

  async function call(method: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The request was rejected");
      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    const json = await call("PATCH", { id: user.id, isActive: !user.isActive });
    if (json) router.refresh();
  }

  async function reset() {
    const json = await call("PUT", { id: user.id });
    if (json?.password) {
      setIssued(json.password as string);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {issued && (
        <div className="rounded-lg border border-warn/30 bg-warn/5 px-2 py-1 text-right">
          <p className="text-[10px] text-warn">New password — shown once</p>
          <code className="font-mono text-[11px] text-ink">{issued}</code>
        </div>
      )}
      {error && <span className="text-[10px] text-danger">{error}</span>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onEdit} className="btn-ghost btn-sm" aria-label={`Edit ${user.name}`}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={reset} disabled={busy} className="btn-ghost btn-sm" aria-label={`Reset password for ${user.name}`}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={toggle} disabled={busy} className={user.isActive ? "btn-danger btn-sm" : "btn-ghost btn-sm"}>
          <ShieldCheck className="h-3.5 w-3.5" />
          {user.isActive ? "Disable" : "Enable"}
        </button>
      </div>
    </div>
  );
}
