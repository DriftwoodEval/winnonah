# Project Guidelines

## Stack
- Next.js web app with Drizzle, tRPC, shadcn
- Python sidecar and API

## Commands
- Typechecking / Linting app: `pnpm check`
- Linting Python (from python directory): `uv run ruff check . && uv run ruff format .`

## Database Migrations
Do not run `pnpm db:push`, `drizzle-kit push`, or any other database migration commands. The user performs all database migrations themselves. After making schema changes, note that a migration is needed and move on.
