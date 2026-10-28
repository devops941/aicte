import { z } from "zod";
import { jsonOk, parseBody, withAuth } from "@/lib/api";
import { createApplication } from "@/lib/workflow/service";
import { listCases } from "@/lib/queries";

const createSchema = z.object({
  type: z.enum([
    "NEW_ENGINEERING",
    "EXTENSION_OF_APPROVAL",
    "INCREASE_IN_INTAKE",
    "NEW_COURSE",
    "CLOSURE",
    "OTHERS",
  ]),
  title: z.string().min(5).max(200),
  summary: z.string().max(2000).optional().nullable(),
  intakeRequested: z.coerce.number().int().positive().max(100000).optional().nullable(),
  courseName: z.string().max(160).optional().nullable(),
  institutionId: z.string().uuid().optional().nullable(),
});

export const GET = withAuth("application:read", async ({ actor, req }) => {
  const url = new URL(req.url);
  const list = (key: string) => url.searchParams.getAll(key).flatMap((v) => v.split(",")).filter(Boolean);
  const result = await listCases(actor, {
    status: list("status"),
    type: list("type"),
    slaState: list("slaState"),
    search: url.searchParams.get("search") ?? undefined,
    regionId: url.searchParams.get("regionId") ?? undefined,
    stageId: url.searchParams.get("stageId") ?? undefined,
    page: Number(url.searchParams.get("page") ?? 1),
    pageSize: Number(url.searchParams.get("pageSize") ?? 20),
    sort: (url.searchParams.get("sort") as "recent" | "oldest" | "due" | "overdue" | null) ?? "recent",
  });
  return jsonOk(result);
});

export const POST = withAuth("application:create", async ({ actor, req, ip, userAgent }) => {
  const body = parseBody(createSchema, await req.json());
  const created = await createApplication({ actor, ...body, ip, userAgent });
  return jsonOk(created, 201);
});
