This is a T3 stack app (Next.js, tRPC, Drizzle ORM, NextAuth), as well as a Python API sidecar, and some Python scripts that run each night.

## Commands
- Use `pnpm check` to type-check and lint (not `pnpm tsc --noEmit`)
- Use `uvx ruff check . --fix && uvx ruff format .` for Python.
- Trust ruff's output over your own assumptions about Python syntax validity; if ruff accepts code silently, don't flag it as a syntax error.
- Never run `pnpm db:*` commands yourself, leave to the user.

## Path Aliases
- `~/` → `src/`
- `@components/` → `src/app/_components/`
- `@ui/` → `src/app/_components/ui/`

## Restrictions
- Never read the contents of gitignored files, including via `grep`/`rg`/`cat` or any other tool. Treat them as off-limits.
- Never query or output sensitive data (e.g. PII, credentials, patient records) from the database, even for debugging.

## Data Layer
**Database**: MySQL (Docker), all tables use the `emr_` prefix (set in `src/server/db/schema.ts` via `mysqlTableCreator`). Schema types are inferred from Drizzle: `typeof tableName.$inferSelect`.
