# dropdown-menu

2026-08-07, golden pair via hand-resolution of a 4-conflict three-way merge (radix-nova ancestor, base-nova target). Customizations preserved: project's lucide icons (`CheckIcon`, `ChevronRightIcon`) in place of `IconPlaceholder`, and intentional removal of the registry's `cn-menu-target`/`cn-menu-translucent`/`cn-rtl-flip` utility classes.

## Changed

- `src/app/_components/ui/dropdown-menu.tsx`: `DropdownMenu` from `radix-ui` -> `@base-ui/react/menu` (Base UI's dropdown-menu and menu share the same `Menu` primitive). Anatomy changed from `Portal > Content` to `Portal > Positioner > Popup`. Part renames matching context-menu's pattern: `SubTrigger` -> `SubmenuTrigger`, `Sub` -> `SubmenuRoot`, `ItemIndicator` -> `CheckboxItemIndicator`/`RadioItemIndicator`. Hand-resolved all 4 merge conflicts by taking the base-nova structure with the project's icons and without the `cn-*` classes. `min-w-[96px]` on `DropdownMenuSubContent` turned out to already match the base-nova registry default, not a real customization. Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

- **Flagged, not patched**: `closeOnClick` defaults to `false` on `CheckboxItem`/`RadioItem` in Base UI. Not changed here per skill rule.

## Verify by hand

- Open dropdown menus across the app (header actions, table row actions), confirm submenus and checkbox/radio items work, and confirm the menu closes correctly on outside click.
