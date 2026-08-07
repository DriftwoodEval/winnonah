# switch

2026-08-07, golden pair via shadcn CLI (`shadcn add switch --overwrite`, base-nova), pristine wrapper, migrated clean.

## Changed

- `src/app/_components/ui/switch.tsx`: `Switch` from `radix-ui` -> `@base-ui/react/switch`. Prop surface (`checked`/`defaultChecked`/`onCheckedChange`) unchanged. Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

None observed.

## Verify by hand

- Toggle a switch and confirm the thumb animates and the checked state persists.
