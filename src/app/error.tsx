"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="text-center animate-fade-up">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-lg font-semibold text-ink">Something went wrong</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
          The page could not be rendered. This has been logged. No state was changed.
        </p>
        <button type="button" onClick={reset} className="btn-primary mt-6">
          Try again
        </button>
      </div>
    </div>
  );
}
