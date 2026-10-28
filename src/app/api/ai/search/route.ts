import { z } from "zod";
import { jsonOk, parseBody, withAuth } from "@/lib/api";
import { interpretQuery } from "@/lib/ai";
import { listCases, regionOptions } from "@/lib/queries";

const schema = z.object({ query: z.string().min(2).max(200) });

/**
 * Natural-language search. The query is translated into the same structured
 * filter the case list uses — never into SQL — and the actor's scope is applied
 * afterwards, so a regional officer cannot search their way into another region.
 */
export const POST = withAuth("application:read", async ({ actor, req }) => {
  const body = parseBody(schema, await req.json());
  const regions = await regionOptions();
  const filter = interpretQuery(body.query, regions.map((r) => r.name));

  const regionId = filter.regionName
    ? regions.find((r) => r.name === filter.regionName)?.id
    : undefined;

  const result = await listCases(actor, {
    status: filter.status,
    type: filter.type,
    slaState: filter.overdueOnly ? ["OVERDUE"] : filter.dueSoonOnly ? ["DUE_SOON"] : undefined,
    regionId,
    pageSize: 25,
  });

  return jsonOk({ filter, result });
});
