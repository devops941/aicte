import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { currentActor } from "@/lib/auth/session";
import type { Actor } from "@/lib/auth/rbac";
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError, assertCan, type Permission } from "@/lib/auth/rbac";

/**
 * One place where route handlers authenticate, authorise and translate errors.
 * Handlers stay thin: parse with a schema, check a permission, call a service,
 * return JSON. Errors never leak internals — unexpected failures return a
 * generic message while the detail is logged server-side.
 */

export type HandlerContext = { actor: Actor; req: Request; ip: string | null; userAgent: string | null };

/**
 * Prisma returns BigInt for millisecond counters, and JSON.stringify throws on
 * BigInt. Response bodies go through this replacer so those values are emitted
 * as numbers, which is safe here: every counter is far below 2^53.
 */
function bigintSafe(_key: string, value: unknown) {
  return typeof value === "bigint" ? Number(value) : value;
}

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return new NextResponse(JSON.stringify({ ok: false, error: message, ...extra }, bigintSafe), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function jsonOk<T>(data: T, status = 200) {
  return new NextResponse(JSON.stringify({ ok: true, data }, bigintSafe), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function clientMeta(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null,
    userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
  };
}

export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ValidationError(`${first.path.join(".") || "input"}: ${first.message}`);
  }
  return result.data;
}

export function handleError(error: unknown) {
  if (error instanceof ZodError) {
    return jsonError(error.issues[0]?.message ?? "Invalid input", 422);
  }
  if (
    error instanceof ValidationError ||
    error instanceof ForbiddenError ||
    error instanceof UnauthorizedError ||
    error instanceof NotFoundError
  ) {
    return jsonError(error.message, error.status);
  }
  console.error("[api] unhandled error:", error);
  return jsonError("Something went wrong while processing the request.", 500);
}

/**
 * Wraps a handler with authentication and an optional permission check. Scope
 * is not applied here: services apply it in the query, because only they know
 * which table is being read.
 */
export function withAuth(
  permission: Permission | null,
  handler: (ctx: HandlerContext, params: Record<string, string>) => Promise<Response>,
) {
  return async (req: Request, context: { params: Promise<Record<string, string>> }) => {
    try {
      const actor = await currentActor();
      if (!actor) throw new UnauthorizedError();
      if (permission) assertCan(actor, permission);

      const params = context?.params ? await context.params : {};
      const meta = clientMeta(req);
      return await handler({ actor, req, ...meta }, params);
    } catch (error) {
      return handleError(error);
    }
  };
}
