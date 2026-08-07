# checkbox

2026-08-07, golden pair via three-way merge (radix-nova ancestor, base-nova target), pristine wrapper (only diverged from stock by resolved lucide icon), merged clean with zero conflicts.

## Changed

- `src/app/_components/ui/checkbox.tsx`: `Checkbox` from `radix-ui` -> `@base-ui/react/checkbox`. The project's `CheckIcon` (lucide) substitution for the registry's multi-icon-library `IconPlaceholder` abstraction survived the merge automatically since it was identical across both source variants relative to the ancestor. Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

- `checked="indeterminate"` string value is replaced by a separate boolean `indeterminate` prop in Base UI. No consumer in this codebase used `checked="indeterminate"` (confirmed via grep), so no call-site impact.

## Verify by hand

- Check/uncheck a checkbox in a form and confirm the check icon and border color states are correct.
