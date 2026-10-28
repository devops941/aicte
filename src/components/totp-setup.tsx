"use client";

import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Two-factor setup. The secret is generated server-side and only stored once a
 * code has been verified, so a half-finished setup cannot lock anyone out.
 */
export function TotpSetup() {
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function start() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile/totp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "begin" }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not start setup");
      setSecret(json.data.secret);
      setUri(json.data.uri);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not start setup" });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile/totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", secret, code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "That code was not accepted");
      setMessage({ tone: "ok", text: "Two-factor authentication is now enabled." });
      setSecret(null);
      setUri(null);
      setCode("");
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "That code was not accepted" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader title="Two-factor authentication" subtitle="Optional now; an SSO adapter can be added later" />
      <CardBody className="space-y-3.5">
        {!secret ? (
          <>
            <div className="flex items-center gap-2.5">
              <Badge tone="neutral">Not configured</Badge>
            </div>
            <p className="text-[11px] leading-relaxed text-muted">
              Add a time-based code from an authenticator app. Recommended for officers who record decisions.
            </p>
            <button type="button" onClick={() => void start()} disabled={busy} className="btn-ghost w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Set up authenticator
            </button>
          </>
        ) : (
          <>
            <p className="text-[11px] text-muted">Add this secret to your authenticator app, then enter a code to confirm.</p>
            <code className="block break-all rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-[11px] text-ink">
              {secret}
            </code>
            {uri && <p className="break-all text-[10px] text-muted">{uri}</p>}
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              className="input text-center tracking-[0.4em]"
            />
            <button type="button" onClick={() => void confirm()} disabled={busy || code.length < 6} className="btn-primary w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Confirm and enable
            </button>
          </>
        )}
        {message && <p className={`text-[11px] ${message.tone === "ok" ? "text-ok" : "text-danger"}`}>{message.text}</p>}
      </CardBody>
    </Card>
  );
}
