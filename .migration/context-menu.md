# context-menu

2026-08-07, golden pair via hand-resolution of a 5-conflict three-way merge (radix-nova ancestor, base-nova target). Customizations preserved: project's lucide icons (`ChevronRightIcon`, `CheckIcon`) in place of the registry's `IconPlaceholder`, and intentional removal of the registry's `cn-menu-target`/`cn-menu-translucent`/`cn-rtl-flip` utility classes (unused visual-effect classes not present in this project's CSS).

## Changed

- `src/app/_components/ui/context-menu.tsx`: `ContextMenu` from `radix-ui` -> `@base-ui/react/context-menu`. Anatomy changed from `Portal > Content` to `Portal > Positioner > Popup`. Part renames: `Content` -> `Positioner`+`Popup`, `SubTrigger` -> `SubmenuTrigger`, `Sub` -> `SubmenuRoot`, `ItemIndicator` -> `CheckboxItemIndicator`/`RadioItemIndicator` (split by item type). Hand-resolved all 5 merge conflicts by taking the base-nova structure with the project's icons and without the `cn-*` classes. Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

- `ContextMenu.Root`'s `modal` prop is removed; not used by the single consumer (`ClientHeader.tsx`).
- `ContextMenuTrigger`'s `disabled` prop is removed; not used anywhere in this codebase.
- **Flagged, not patched**: `closeOnClick` defaults to `false` on `CheckboxItem`/`RadioItem` in Base UI (Radix closed on select). Not changed here per skill rule (only patch if requested).

## Verify by hand

- Right-click the client header to open the context menu, confirm submenu hover/click opens correctly, and confirm checkbox/radio items in the menu (if any) show the check indicator.
