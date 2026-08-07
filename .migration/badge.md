# badge

2026-08-07, golden pair via shadcn CLI (`shadcn add badge --overwrite`, base-nova), pristine wrapper, migrated clean.

## Changed

- `src/app/_components/ui/badge.tsx`: previously hand-rolled `asChild` via `radix-ui`'s `Slot`; now uses `@base-ui/react`'s `useRender` hook directly (registry's own pattern for non-primitive wrappers that still need polymorphic rendering) in place of `Slot.Root`. `asChild` prop is gone from the public API; use `render` instead. Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

- `asChild` -> `render` at any call site. `grep` found one usage inside `src/app/_components/ui/alert-dialog.tsx` and `src/app/_components/issues/issuesAlert.tsx`, tracked and fixed in the consumer sweep.

## Verify by hand

- Confirm badges render with correct variant colors across status pills in the app.
