/**
 * Next.js instrumentation — runs once when the server starts. It ensures the
 * admin account and workflow definitions exist so a freshly connected database
 * is immediately usable without a manual seed step. Idempotent: existing data
 * is skipped. Guarded to the Node.js runtime and skipped during build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { ensureSeedData } = await import("@/lib/seed/ensure");
    await ensureSeedData();
  } catch (error) {
    console.error("[auto-seed] failed:", error);
  }
}
