# radio-group

2026-08-07, golden pair via shadcn CLI (`shadcn add radio-group --overwrite`, base-nova), pristine wrapper, migrated clean.

## Changed

- `src/app/_components/ui/radio-group.tsx`: `RadioGroup` from `radix-ui` -> `@base-ui/react/radio-group`, item primitive split into a separate `@base-ui/react/radio` import. `RadioGroupPrimitive.Item` -> `RadioPrimitive.Root`; `RadioGroupPrimitive.Indicator` -> `RadioPrimitive.Indicator`. Wrapper export names (`RadioGroup`, `RadioGroupItem`) unchanged. Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

None observed; value/onValueChange prop surface unchanged.

## Verify by hand

- Select radio options in a group and confirm only one can be active, with correct focus ring and checked indicator.
