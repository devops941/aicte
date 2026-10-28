import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="text-center animate-fade-up">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <FileQuestion className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-lg font-semibold text-ink">Not found</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
          That page does not exist, or the case is outside your scope.
        </p>
        <Link href="/dashboard" className="btn-primary mt-6">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
