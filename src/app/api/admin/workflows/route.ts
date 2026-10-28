import { jsonOk, withAuth } from "@/lib/api";
import { workflowList } from "@/lib/queries";

/**
 * Workflow definitions are read-only through the API for now. Editing stages
 * and SLA days is a deliberately versioned operation: running cases must stay
 * on the version they started with, so a change creates a new version rather
 * than mutating the one in flight.
 */
export const GET = withAuth("workflow:configure", async () => jsonOk(await workflowList()));
