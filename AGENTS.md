# Agent Guide

This guide helps AI agents navigate and contribute to the codebase.

## Codebase Map

### Directory Roles

- **`src/app/`**: Next.js App Router (pages and layouts).
- **`src/app/_components/`**: React components, organized by feature (e.g., `client/`, `scheduling/`, `ui/`).
- **`src/server/api/routers/`**: tRPC backend routers.
- **`src/server/db/`**: Drizzle schema (`schema.ts`) and database configuration.
- **`src/lib/`**: Shared TypeScript utilities, types, and Zod validations.
- **`python/`**: Python-based data integration tools. Runs nightly on a timer.
  - **`python/main.py`**: Entry point for sync tasks.
  - **`python/utils/`**: Core logic for external integrations (Google, TherapyAppointment, OpenPhone).
- **`scripts/`**: TypeScript maintenance and migration scripts (run via `tsx`).

### Entry Points

- **Web App**: `src/app/page.tsx`
- **tRPC API**: `src/server/api/root.ts`
- **Python CLI**: `python/main.py`
- **Database Schema**: `src/server/db/schema.ts`

## Local Norms

### Tooling & Commands

- **Node.js**: Use `pnpm`.
- **Python**: Use `uv`. Run via `uv run main.py`.
- **Database**: Use Drizzle. Don't run Drizzle commands yourself, inform the user.
- **Linting/Formatting**:
  - Node: Biome (`pnpm check`). Note: `src/app/_components/ui` is excluded (shadcn/ui).
  - Python: Ruff (`uv run ruff check .`).
- **Hooks**: Lefthook manages git hooks. `next build` is checked on pre-push.

## Self-correction

- If the user gives a correction about how work should be done in this repo, add it to "Local norms" so future sessions inherit it.
