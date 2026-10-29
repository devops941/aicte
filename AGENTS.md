<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project notes (AICTE Approval Workflow Platform)

Stack: Next.js 16 (App Router, Turbopack), TypeScript, Prisma 7, Neon Postgres.
`DATABASE_URL` lives in `.env` (gitignored). No extra top-level folders — keep the
tree tidy; admin pages live under `src/app/(portal)/admin/` and their APIs under
`src/app/api/admin/`.

### Commands
- Dev server: `npx next dev -p 12000` (the preview proxy expects 12000, not 3000).
  Set `DEV_ORIGINS` to the tunnel host so HMR/font assets are not blocked and the
  client hydrates.
- Typecheck: `npx tsc --noEmit`. Tests: `npx vitest run` (single-threaded by
  design — the audit chain is global and append-only).
- Build: `NODE_ENV=production npx next build`. Building with `NODE_ENV=development`
  leaks into the build and makes prerendering `/_global-error` and `/` fail with
  `Cannot read properties of null (reading 'useContext')`; that is an env artifact,
  not a code bug.

### Conventions
- Request payload schemas live in `src/lib/admin-schemas.ts` and are strict
  (`z.strictObject`), so an unknown or misspelt field is rejected rather than
  silently dropped. Keep server-side validation there, not inline in routes.
- Layout: the portal shell is a fixed-height flex column (`h-screen` +
  `overflow-hidden`). `main` is the single scroll region, so the topbar and
  footer stay put and the content in the middle scrolls. Do not add
  `overflow-*` or `min-h-screen` to page-level wrappers.
- Tables use `.table-wrap` + `.th`/`.td`. `.table-wrap` is its own scroll
  container on both axes and is height-capped, so a wide table cannot bleed out
  of its card and a long one cannot push the toolbar out of view: the filter
  bar and the column header stay put and only the rows scroll. The header is
  sticky to the top of `.table-wrap`, so do not put a transform/animation on it
  or on an ancestor (a transformed ancestor becomes the containing block and
  silently breaks `position: sticky`). Right-aligned columns use
  `.th-right`/`.td-right`.
- Grid and flex items are given `min-width: 0` in `globals.css`. Without it the
  default `min-width: auto` lets a wide child (a nowrap table, or a `<select>`
  with long option labels) stretch its track past the viewport and break the
  surrounding grid.
- Filters and create actions share the `.toolbar` strip and the `CardHeader`
  `action` slot, so they align consistently across admin pages.
- Every state change is written through `writeAudit` inside the same transaction
  as the change, so the audit row and the data commit or roll back together.
  The chain is hash-linked; `seq` gaps are normal (rolled-back transactions do not
  rewind a Postgres sequence) and do not indicate tampering. Verify with
  `verifyAuditChain`.
- Secrets are never echoed: `GET /api/admin/settings` returns `value: null` for a
  secret and audit rows store `[redacted]`.
- Users are deactivated, not deleted, to preserve the audit trail.
- Tests that create users must delete their audit rows before the users:
  `AuditLog.actorId` is `onDelete: SetNull`, so deleting a user nulls `actorId`
  on every audit row it authored, which changes their hashes and breaks the
  append-only chain for every later entry (this cascades into
  `concurrency.test.ts` and `integration.test.ts`, which verify the whole chain).
  Clean up by `auditLog.deleteMany({ where: { actorEmail: { startsWith: PREFIX } } })`
  first, then delete the users.
