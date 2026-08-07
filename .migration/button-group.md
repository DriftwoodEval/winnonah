# button-group

2026-08-07, golden pair via three-way merge (radix-nova ancestor, base-nova target), pristine wrapper (initial diff was a false positive from an import-path normalization bug in my own classification script, not a real customization), merged clean.

## Changed

- `src/app/_components/ui/button-group.tsx`: `ButtonGroupText`'s `asChild`/`Slot` composition (from `radix-ui`) replaced with `@base-ui/react`'s `useRender`/`mergeProps` pattern (registry's standard approach for non-primitive polymorphic wrappers). `asChild` prop is gone; use `render` instead. Depends on the already-migrated `separator.tsx`. Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

- `asChild` -> `render` on `ButtonGroupText`. No consumer in this codebase used `ButtonGroupText`'s `asChild` (confirmed via grep), so no call-site impact.

## Verify by hand

- Confirm button groups render with correct rounded corners at the group edges and separators between segments.
