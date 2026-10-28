"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Save } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type SettingView = {
  key: string;
  label: string;
  category: string;
  type: string;
  options: string[] | null;
  help: string | null;
  secret: boolean;
  value: string | number | boolean | null;
  isSet: boolean;
  updatedAt: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  branding: "Branding",
  time: "Time & calendar",
  notifications: "Notifications",
  email: "Email delivery",
  storage: "File storage",
  security: "Security",
  integrations: "Integrations",
  maintenance: "Maintenance",
};

/**
 * Settings editor. Secret fields render as a write-only box: the current value
 * is never sent to the browser, and leaving the box blank means "keep the
 * existing secret" rather than "clear it".
 */
export function SettingsForm({ settings }: { settings: SettingView[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const s of settings) {
      initial[s.key] = s.secret ? "" : s.value === null || s.value === undefined ? "" : String(s.value);
    }
    return initial;
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const categories = [...new Set(settings.map((s) => s.category))];

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const values: Record<string, string> = {};
      for (const s of settings) {
        // Skip untouched secrets so the stored credential is preserved.
        if (s.secret && draft[s.key] === "") continue;
        values[s.key] = draft[s.key];
      }
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The settings were rejected");
      setMessage({ tone: "ok", text: `${json.updated.length} setting(s) saved.` });
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "The settings could not be saved" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-5">
      {message && (
        <p
          role="status"
          className={
            message.tone === "ok"
              ? "rounded-xl border border-ok/30 bg-ok/5 px-3 py-2 text-xs text-ok"
              : "rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
          }
        >
          {message.text}
        </p>
      )}

      {categories.map((category) => (
        <Card key={category} className="animate-fade-up">
          <CardHeader title={CATEGORY_LABELS[category] ?? category} subtitle="Changes take effect immediately and are recorded in the audit trail." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {settings
              .filter((s) => s.category === category)
              .map((s) => (
                <div key={s.key} className={s.type === "string" && !s.secret ? "sm:col-span-2" : ""}>
                  <div className="mb-1 flex items-center gap-2">
                    <label htmlFor={`set-${s.key}`} className="label mb-0">
                      {s.label}
                    </label>
                    {s.secret && (
                      <Badge tone={s.isSet ? "ok" : "neutral"} dot>
                        {s.isSet ? "Configured" : "Not set"}
                      </Badge>
                    )}
                  </div>

                  {s.type === "boolean" ? (
                    <select
                      id={`set-${s.key}`}
                      className="input"
                      value={draft[s.key]}
                      onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                    >
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  ) : s.type === "enum" && s.options ? (
                    <select
                      id={`set-${s.key}`}
                      className="input"
                      value={draft[s.key]}
                      onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                    >
                      {s.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`set-${s.key}`}
                      type={s.secret ? "password" : s.type === "number" ? "number" : "text"}
                      className="input"
                      autoComplete={s.secret ? "new-password" : "off"}
                      placeholder={s.secret ? (s.isSet ? "Leave blank to keep the current value" : "Not configured") : undefined}
                      value={draft[s.key]}
                      onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                    />
                  )}

                  {s.help && <p className="mt-1 text-[11px] leading-relaxed text-muted">{s.help}</p>}
                </div>
              ))}
          </CardBody>
        </Card>
      ))}

      <div className="sticky bottom-4 flex items-center gap-3">
        <button type="submit" disabled={busy} className="btn-primary shadow-lg">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save settings
        </button>
        {!busy && message?.tone === "ok" && (
          <span className="flex items-center gap-1 text-xs text-ok">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
