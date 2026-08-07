# toggle

2026-08-07, golden pair via shadcn CLI (`shadcn add toggle --overwrite`, base-nova), pristine wrapper, migrated clean.

## Changed

- `src/app/_components/ui/toggle.tsx`: `Toggle` from `radix-ui` -> `@base-ui/react/toggle`. Prop surface (`pressed`/`defaultPressed`/`onPressedChange`) unchanged. Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

None observed for this component's prop surface.

## Verify by hand

- Click a toggle button and confirm pressed/unpressed styling switches correctly.
