# dialog

2026-08-07, golden pair via three-way merge (radix-nova ancestor, base-nova target), two customizations preserved (project's lucide `XIcon` in place of the registry's multi-library `IconPlaceholder`, and `font-heading` vs `cn-font-heading` naming), one real structural conflict hand-resolved.

## Changed

- `src/app/_components/ui/dialog.tsx`: `Dialog` from `radix-ui` -> `@base-ui/react/dialog`. Anatomy changed from `Portal > Overlay > Content` to `Portal > Backdrop > Popup`. The close button's `DialogPrimitive.Close asChild><Button>...` composition is now `DialogPrimitive.Close render={<Button/>}>` (asChild -> render); this hunk conflicted in the merge because both the registry's structural change and the project's icon substitution touched the same lines, hand-resolved by combining base's `render` structure with the project's `XIcon`. Depends on the already-migrated `button.tsx`. Leftover scan clean: `grep -n "radix-ui\|@radix-ui\|IconPlaceholder\|<<<<<<<" src/app/_components/ui/dialog.tsx` returns nothing.

## Left alone

None, single-file component.

## Behavior changes

- `onOpenAutoFocus`/`onCloseAutoFocus` -> `initialFocus`/`finalFocus`; not currently used by any consumer.
- `onEscapeKeyDown`, `onPointerDownOutside`, `onInteractOutside` consolidated differently; not currently used by any consumer.

## Verify by hand

- Open a dialog (e.g. edit client, manual address entry), confirm the close (X) button works, focus is trapped, and Escape/outside-click close it.
