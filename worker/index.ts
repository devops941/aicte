/**
 * Scheduled worker.
 *
 * Runs the alert engine on a cron schedule in a separate process from the web
 * app, sharing the same database. Every run writes a heartbeat row so the
 * dashboard can warn when the worker has stopped running — the failure mode
 * that would otherwise be silent.
 */
import "dotenv/config";
import cron from "node-cron";
import { runAllScans } from "../src/lib/alerts/scanner";
import { prisma } from "../src/lib/db";

const CRON_EXPRESSION = process.env.WORKER_CRON ?? "*/5 * * * *";
const runOnce = process.argv.includes("--once");

async function tick(label: string) {
  const started = Date.now();
  try {
    const { results, totals } = await runAllScans();
    const ms = Date.now() - started;
    console.log(
      `[worker ${label}] ${ms}ms queued=${totals.queued} dispatched=${totals.dispatched} failed=${totals.failed} escalated=${totals.escalated}`,
    );
    for (const r of results) {
      if (r.detail) console.log(`  ${r.job}: ${r.detail}`);
    }
  } catch (error) {
    console.error(`[worker ${label}] cycle failed:`, error instanceof Error ? error.message : error);
    await prisma.workerHeartbeat
      .upsert({
        where: { job: "worker-cycle" },
        update: { lastRunAt: new Date(), status: "ERROR", detail: error instanceof Error ? error.message : "unknown" },
        create: { job: "worker-cycle", status: "ERROR", detail: error instanceof Error ? error.message : "unknown" },
      })
      .catch(() => undefined);
  }
}

async function main() {
  if (runOnce) {
    await tick("once");
    await prisma.$disconnect();
    process.exit(0);
  }

  if (!cron.validate(CRON_EXPRESSION)) {
    console.error(`Invalid WORKER_CRON expression: ${CRON_EXPRESSION}`);
    process.exit(1);
  }

  console.log(`Worker started. Schedule: ${CRON_EXPRESSION}`);
  await tick("startup");

  const task = cron.schedule(CRON_EXPRESSION, () => void tick("cron"));

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, stopping worker.`);
    task.stop();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
