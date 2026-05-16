This is a T3 stack app (Next.js, tRPC, Drizzle ORM, NextAuth), as well as a Python API sidecar, and some Python scripts that run each night.

## Commands
- Use `pnpm check` to type-check and lint (not `pnpm tsc --noEmit`)
- Use `uvx ruff check . --fix && uvx ruff format .` for Python.
- Never run `pnpm db:*` commands yourself, leave to the user.

## Path Aliases
- `~/` → `src/`
- `@components/` → `src/app/_components/`
- `@ui/` → `src/app/_components/ui/`

## Data Layer
**Database**: MySQL (Docker), all tables use the `emr_` prefix (set in `src/server/db/schema.ts` via `mysqlTableCreator`). Schema types are inferred from Drizzle: `typeof tableName.$inferSelect`.
