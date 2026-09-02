T3 stack app (Next.js, tRPC, Drizzle ORM, NextAuth) + a Python API sidecar + cron Python scripts.

## Code Style
- No AI-isms (filler, hedging, "as an AI") and no em dashes (use comma/colon/period) in code, comments, commits, docs.
- Prefer simple, readable code over clever/terse one-liners. DRY.
- Code comments explain the current state of the code, not what changed or why it used to be different. A reader without the diff should get full value from the comment.
- Use our named color tokens, never raw Tailwind palette colors (`bg-red-500`, `text-amber-600`, etc.). The tokens are defined in `src/styles/globals.css`: semantic (`success`, `warning`, `error`, `primary`, `destructive`, `muted`, `accent`, `border`, `card`, `popover`, each with a `-foreground` where it applies) and brand (`brand-green`, `brand-teal`, `brand-tan`, `brand-cream`). Semantic tokens have Tailwind utilities (`bg-success`, `border-warning/40`); the brand tokens beyond `brand-green` (which is `primary`) are CSS vars only, reach them with `var(--brand-teal)`. If nothing fits, add a token to `globals.css` rather than hardcoding a palette color.

## Changelog
When making significant, user-facing changes, add an entry to `src/content/docs/changelog/index.mdx`. Use today's date, group bullets under `**New**`/`**Improved**`/`**Fixed**` in that order, and validate with `pnpm exec tsx scripts/validate-changelog.ts`. Write bullets in plain, user-friendly language describing what changed for the user, not implementation details (e.g. "Insurance review now shows the waiting badge even when you can't act on it," not "gated waiting badge render behind canUse flag").

## Docs
When a change alters behavior an existing docs page under `src/content/docs/` describes (a renamed label, a changed rule, a removed or added step, a workflow that now works differently), update that page in the same change. Grep the docs for the feature name or UI label to find affected pages. Docs are written for non-technical staff: describe what the user sees and does, not the implementation. Validate with `mise run check:docs`.

Category folders can nest one or more levels; each folder (including subfolders) can carry a `_category.json` (`title`, `position`). Moving a page changes its URL, so update every `/docs/...` cross-link that points at it (the validator fails the build on a dead one).

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
Columns defined with `d.date({ mode: "string" })` (e.g. `dob`, `precertExpires`, `policyStartDate`, `failedDate`) are calendar dates with no time component, typed as plain `"YYYY-MM-DD"` strings, not `Date` objects. Never wrap them in `new Date(...)`, `toLocaleDateString()`, or date-fns functions: that reintroduces a UTC-midnight round-trip and shifts the displayed day for any user west of UTC. Use the string-native helpers in `src/lib/utils.ts` instead: `parseDateOnly` (year/month/day parts), `compareDateOnly` (sort comparator), `formatShortDate`/`formatDateOnlyLong`/`formatDateOnlyMedium` (display), and `dateOnlyToLocalDate`/`localDateToDateOnly` only at the boundary with UI components that require a `Date` (date pickers, date-fns comparisons).

### True-instant (timestamp) columns and business timezone
Columns defined with `d.timestamp()` (e.g. `startTime`, `endTime`, `confirmedAt`, `sentAt`, `createdAt`) are genuine UTC instants, both in the DB and as read via `mysql2` (pool configured with `timezone: "Z"` in `src/server/db/index.ts`). The practice's timezone is `BUSINESS_TIMEZONE` in `src/lib/constants.ts` ("America/New_York"), also mirrored in `python/utils/constants.py` and exposed to the `questionnaires` repo via the `business_timezone` field on the shared config (`py-config` API). Never hardcode a timezone string, and never treat these columns as if they were already business-local: convert explicitly.
- Display: `formatInBusinessTime(date, pattern)` (wraps `date-fns-tz`'s `formatInTimeZone`) or `formatShortInstantDate`/`getLocalDayFromUTCDate`.
- Calendar/grid math needing numeric hour/day getters: `toBusinessZonedTime(date)`, whose local getters (`.getHours()`, `.getDate()`, etc.) reflect business time regardless of the server/browser's own timezone.
- Constructing a UTC instant from business-local wall-clock input (e.g. a day-boundary query): `date-fns-tz`'s `fromZonedTime(dateString, BUSINESS_TIMEZONE)` (see `getDayAhead` in `src/server/api/routers/appointments.ts`).

On the Python side (`winnonah/python/utils/timezone.py` and `questionnaires/utils/timezone.py`, kept in sync), the same conventions apply via `business_to_utc`/`utc_to_business`/`now_utc`/`now_business`. `emr_appointment.startTime`/`endTime` are written by `python/utils/appointments.py` from TherapyAppointment CSV exports, which are naive business-local wall-clock time: always localize via `business_to_utc` before inserting, never write a naive value directly.
