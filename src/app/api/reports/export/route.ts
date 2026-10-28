import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { currentActor } from "@/lib/auth/session";
import { listCases } from "@/lib/queries";
import { SLA_LABELS, STATUS_LABELS, TYPE_LABELS } from "@/lib/constants";
import { can } from "@/lib/auth/rbac";
import { csvWithBom, toCsv } from "@/lib/csv";

/**
 * CSV export of the case list, honouring the same scope as the on-screen list.
 * Quoting and formula-injection escaping live in `@/lib/csv` so the same rules
 * apply to every export rather than being re-implemented per route.
 */
export async function GET(req: Request) {
  const actor = await currentActor();
  if (!actor || !can(actor.role, "report:read")) {
    return jsonError("Not authorised", 403);
  }

  const url = new URL(req.url);
  const list = (key: string) => url.searchParams.getAll(key).flatMap((v) => v.split(",")).filter(Boolean);

  const { rows: listRows } = await listCases(actor, {
    status: list("status"),
    type: list("type"),
    slaState: list("slaState"),
    regionId: url.searchParams.get("regionId") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    pageSize: 1000,
    page: 1,
  });

  const header = [
    "Application No",
    "Title",
    "Type",
    "Institution",
    "State",
    "Status",
    "Current Stage",
    "SLA State",
    "Owner",
    "Submitted",
    "Deadline",
    "Documents",
    "Clarifications",
  ];

  const rows: unknown[][] = [header];
  for (const r of listRows) {
    rows.push([
      r.appNo,
      r.title,
      TYPE_LABELS[r.type] ?? r.type,
      r.institution.name,
      r.institution.state,
      STATUS_LABELS[r.status] ?? r.status,
      r.currentStage?.name ?? "",
      SLA_LABELS[r.slaState] ?? r.slaState,
      r.assignments[0]?.user.name ?? "Unassigned",
      r.submittedAt?.toISOString().slice(0, 10) ?? "",
      r.slaDueAt?.toISOString().slice(0, 10) ?? "",
      r._count.documents,
      r._count.clarifications,
    ]);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csvWithBom(toCsv(rows)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="aicte-cases-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

export const dynamic = "force-dynamic";
