# accordion

2026-08-07, golden pair via three-way merge (radix-nova ancestor, base-nova target), pristine wrapper (only diverged from stock by resolved lucide icons), merged clean with zero conflicts.

## Changed

- `src/app/_components/ui/accordion.tsx`: `Accordion` from `radix-ui` -> `@base-ui/react/accordion`. Project's `ChevronDownIcon`/`ChevronUpIcon` (lucide) substitutions for `IconPlaceholder` survived the merge automatically. Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

- **Flagged, needs consumer sweep**: `type="single"`/`type="multiple"` and `collapsible` props are dropped by Base UI; `value`/`defaultValue` are always arrays, and `multiple` (boolean) replaces `type="multiple"`. Consumers using these props: `Dashboard.tsx:601,656`, `PermissionsField.tsx:101`, `WorkSummary.tsx:338,373`, `DayAheadContent.tsx:469`. Fixed in the consumer sweep, not here.

## Verify by hand

- Expand/collapse accordion sections in settings and dashboard views, confirm single vs multi-open behavior matches what each call site intended.
