import { runAllScans } from "@/lib/alerts/scanner";
import { jsonOk, jsonError } from "@/lib/api";
import { currentActor } from "@/lib/auth/session";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manual trigger for the alert engine, so a demo does not have to wait for the
 * cron tick. Requires either a system administrator session or the shared
 * worker token — never open to anonymous callers, since it queues real email.
 */
export async function POST(req: Request) {
  const token = req.headers.get("x-worker-token");
  const actor = await currentActor();

  const tokenOk = Boolean(token && token === env.WORKER_TOKEN);
  const adminOk = actor?.role === "SYSTEM_ADMIN";

  if (!tokenOk && !adminOk) {
    return jsonError("Not authorised to run the worker", 403);
  }

  const { results, totals } = await runAllScans();
  return jsonOk({ results, totals });
}
