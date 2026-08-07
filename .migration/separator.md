# separator

2026-08-07, golden pair via shadcn CLI (`shadcn add separator --overwrite`, base-nova), pristine wrapper, migrated clean.

## Changed

- `src/app/_components/ui/separator.tsx`: `Separator` from `radix-ui` -> `@base-ui/react/separator`. The `decorative` prop is dropped per Base UI (accessibility role is always applied); no consumer in the app passed `decorative`, confirmed via grep. Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

- `decorative` prop no longer accepted. Not used anywhere in this codebase, no call-site impact.

## Verify by hand

- Visually confirm separators still render as thin lines in menus, button groups, and cards.
