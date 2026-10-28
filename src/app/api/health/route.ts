import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonOk, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Liveness probe. Reports database reachability and worker freshness. */
export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const heartbeats = await prisma.workerHeartbeat.findMany({ orderBy: { job: "asc" } });
    const now = Date.now();
    const jobs = heartbeats.map((h) => ({
      job: h.job,
      status: h.status,
      lastRunAt: h.lastRunAt,
      ageMinutes: Math.round((now - h.lastRunAt.getTime()) / 60000),
    }));
    return jsonOk({
      database: "reachable",
      latencyMs: Date.now() - started,
      worker: {
        healthy: jobs.some((j) => j.ageMinutes <= 30),
        jobs,
      },
    });
  } catch (error) {
    console.error("[health] database check failed:", error);
    return jsonError("Database unreachable", 503, { database: "unreachable" });
  }
}
