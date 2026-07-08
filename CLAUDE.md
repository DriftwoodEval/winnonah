This is a T3 stack app (Next.js, tRPC, Drizzle ORM, NextAuth), as well as a Python API sidecar, and some Python scripts that run each night.

## Code Style
- No AI-isms: avoid filler phrases, excessive hedging, or generic "as an AI" language in code comments, commit messages, and docs.
- No em dashes, use a comma, colon, or period instead.
- Avoid overly complex code or one-liners done just to be clever/terse. Prefer straightforward code that's easy to read over compact code that's hard to parse.
- Keep things simple and DRY: no premature abstractions, but don't repeat logic that already exists elsewhere.

## Commands
- Use `mise run check` to type-check and lint everything (TS + Python) — not `pnpm tsc --noEmit` or raw `ruff` calls
- `mise run check` depends on `mise run check:pnpm` and `mise run check:ruff`, which can be run individually if you only need one
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
