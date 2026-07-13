T3 stack app (Next.js, tRPC, Drizzle ORM, NextAuth) + a Python API sidecar + cron Python scripts.

## Code Style
- No AI-isms (filler, hedging, "as an AI") and no em dashes (use comma/colon/period) in code, comments, commits, docs.
- Prefer simple, readable code over clever/terse one-liners. DRY.

## Commands
- `mise run check` type-checks and lints everything (TS + Python); use `check:pnpm`/`check:ruff` to run just one side. Don't call `tsc`/`ruff` directly.
- Trust ruff over your own syntax assumptions.
- Never run `pnpm db:*` or DB migrations, leave to the user.

## Path Aliases
`~/` → `src/`, `@components/` → `src/app/_components/`, `@ui/` → `src/app/_components/ui/`

## Restrictions
- Never read gitignored files (grep/cat/etc. included).
- Never query or output sensitive data (PII, credentials, patient records), even for debugging.

## Data Layer
MySQL (Docker). Tables use `emr_` prefix (`mysqlTableCreator` in `src/server/db/schema.ts`). Types inferred via Drizzle: `typeof tableName.$inferSelect`.
