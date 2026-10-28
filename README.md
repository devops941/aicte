# AICTE Approval Workflow Platform

A decision-support platform for AICTE technical-institution approval cases. It
models the approval lifecycle end to end: submission, scrutiny, expert visit,
bureau review and the competent authority's decision, with SLA clocks, an
append-only audit trail and per-role access control.

The platform advises, it does not decide. No timer, rule or suggestion can
approve or reject a case — only an authorised official can.

## Features

- **Workflow engine** — configurable stages and guarded transitions per
  application type, with remarks, deadlines and notifications.
- **SLA calendar** — working-day clocks that pause for clarifications and
  respect regional holidays.
- **Analyze document** — every uploaded document is checked against an AICTE
  specification for its kind. Findings carry a severity and the clause they
  come from, so a reviewer sees why a document was flagged.
- **Audit trail** — hash-chained entries; a single edited or deleted row makes
  verification fail, naming the first bad entry.
- **RBAC and scoping** — officers see only the cases in their region.
- **Compliance, EVC visits, reports and notifications** for the full case
  lifecycle.

## Stack

- Next.js 15 (App Router) and TypeScript
- Tailwind CSS with Framer Motion
- Prisma with Neon Postgres
- Auth.js (credentials) with role in the JWT
- Vitest

## Getting started

```bash
npm install
cp .env.example .env        # then set DATABASE_URL and AUTH_SECRET
npx prisma db push
npx tsx prisma/seed.ts
npm run dev
```

The seed creates the roles, regions, workflows and demo accounts.

## Tests

```bash
npx vitest run
```

## Notes

`AI_PROVIDER=rules` is the default: every capability is implemented as
deterministic code, so the platform runs with no external model key. A model
provider can be registered behind the same interface.

All statutory decisions rest with the authorised official.
