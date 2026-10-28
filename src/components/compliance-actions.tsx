"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Upload, X } from "lucide-react";

/** Submit or verify controls for one undertaking, with an inline remark field. */
export function ComplianceActions({
  undertakingId,
  status,
  canSubmit,
  canVerify,
  submissionId,
}: {
  undertakingId: string;
  status: string;
  canSubmit: boolean;
  canVerify: boolean;
  submissionId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request rejected");
      setOpen(false);
      setRemark("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request rejected");
    } finally {
      setBusy(false);
    }
  }

  const canAct = (canSubmit && (status === "OPEN" || status === "OVERDUE")) || (canVerify && status === "SUBMITTED");
  if (!canAct) return null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost btn-sm shrink-0">
        {canSubmit ? <Upload className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        {canSubmit ? "Submit evidence" : "Verify"}
      </button>
    );
  }

  return (
    <div className="w-full shrink-0 space-y-2 sm:w-64">
      <textarea
        value={remark}
        onChange={(e) => setRemark(e.target.value)}
        rows={2}
        placeholder="Remark (required when rejecting)"
        className="input resize-none text-xs"
      />
      {error && <p className="text-[11px] text-danger">{error}</p>}
      <div className="flex gap-2">
        {canSubmit ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void call(`/api/compliance/${undertakingId}/submit`, { remark })}
            className="btn-primary btn-sm flex-1"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Submit
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy || !submissionId}
              onClick={() => void call(`/api/compliance/${submissionId}/verify`, { decision: "ACCEPTED", remark })}
              className="btn-primary btn-sm flex-1"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Accept
            </button>
            <button
              type="button"
              disabled={busy || !submissionId || remark.trim().length < 3}
              onClick={() => void call(`/api/compliance/${submissionId}/verify`, { decision: "REJECTED", remark })}
              className="btn-danger btn-sm flex-1"
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </button>
          </>
        )}
      </div>
      <button type="button" onClick={() => setOpen(false)} className="w-full text-[11px] text-muted hover:text-ink">
        Cancel
      </button>
    </div>
  );
}
