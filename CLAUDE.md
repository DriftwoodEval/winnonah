T3 stack app (Next.js, tRPC, Drizzle ORM, NextAuth) + a Python API sidecar + cron Python scripts.

## Code Style
- No AI-isms (filler, hedging, "as an AI") and no em dashes (use comma/colon/period) in code, comments, commits, docs.
- Prefer simple, readable code over clever/terse one-liners. DRY.

## Changelog
When making significant, user-facing changes, add an entry to `src/content/docs/changelog/index.mdx`. Use today's date, group bullets under `**New**`/`**Improved**`/`**Fixed**` in that order, and validate with `pnpm exec tsx scripts/validate-changelog.ts`. Write bullets in plain, user-friendly language describing what changed for the user, not implementation details (e.g. "Insurance review now shows the waiting badge even when you can't act on it," not "gated waiting badge render behind canUse flag").

## Commands
- `mise run check` type-checks and lints everything (TS + Python); use `check:pnpm`/`check:ruff` to run just one side. Don't call `tsc`/`ruff` directly.
- Trust ruff over your own syntax assumptions.
- Never run `pnpm db:*` or DB migrations, leave to the user.

## Home Page Widgets
The home page (`src/app/_components/home/HomePageContent.tsx`) renders a user-configurable grid of widgets. Widget ids are plain strings, not a type union. To add a widget:
1. Add an entry to `HOME_WIDGET_DEFS` in `src/lib/home-widgets.ts` (`id`, `label`, `permission`, `category`, `sizing`). Optionally add a default `{ cols, rows }` to `DEFAULT_WIDGET_CONFIG`.
2. Build the component (no props, fetches its own data via tRPC) in `src/app/_components/home/`. For compact list/table widgets with day-navigation, reuse `WidgetShell`, `DayNav`, `useSelectedDate`, `todayStr` exported from `DayAheadWidgets.tsx`.
3. Add a dispatch branch in `HomePageContent.tsx`'s `w.id === "..."` chain.

The widget picker (`HomeCustomizer.tsx`) and grid sizing (`GridWidgetCell.tsx`) are fully data-driven off `HOME_WIDGET_DEFS`, no changes needed there. Storage (`users.homeWidgets`, `getHomeWidgets`/`updateHomeWidgets` in `src/server/api/routers/users.ts`) accepts any string id already.

## Path Aliases
`~/` → `src/`, `@components/` → `src/app/_components/`, `@ui/` → `src/app/_components/ui/`

## Restrictions
- Never read gitignored files (grep/cat/etc. included).
- Never query or output sensitive data (PII, credentials, patient records), even for debugging.

## Data Layer
MySQL (Docker). Tables use `emr_` prefix (`mysqlTableCreator` in `src/server/db/schema.ts`). Types inferred via Drizzle: `typeof tableName.$inferSelect`.

### Date-only columns
Columns defined with `d.date()` (e.g. `dob`, `precertExpires`, `policyStartDate`, `failedDate`) are calendar dates with no time component, but mysql2 returns them as JS `Date` objects at UTC midnight. Formatting or comparing them with local-timezone getters (`format()` from date-fns, `.toLocaleDateString()` without `timeZone: "UTC"`, raw `isBefore`/`isAfter`) shifts the displayed day back by one for any user west of UTC. Always run these values through `getLocalDayFromUTCDate` (`src/lib/utils.ts`), or its wrapper `formatShortDate`, before formatting or comparing. This does not apply to `d.datetime()`/timestamp columns (`startTime`, `createdAt`, etc.), which are real instants and should convert to local time normally.
