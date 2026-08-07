# alert-dialog

2026-08-07, golden pair via three-way merge (radix-nova ancestor, base-nova target), one trivial customization preserved (`font-heading` vs registry's `cn-font-heading` utility class, a project naming convention), merged clean with zero conflicts after fixing the ancestor's import-path normalization.

## Changed

- `src/app/_components/ui/alert-dialog.tsx`: `AlertDialog` from `radix-ui` -> `@base-ui/react/alert-dialog`. Anatomy changed from `Portal > Overlay > Content` to `Portal > Backdrop > Popup`. Depends on the already-migrated `button.tsx` (`AlertDialogAction`/`AlertDialogCancel` render as `Button`). Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

- `onOpenAutoFocus`/`onCloseAutoFocus` (event-based) are replaced by `initialFocus`/`finalFocus` (element/ref-based) if ever needed; not currently used by any consumer in this codebase.
- `onEscapeKeyDown`, `onPointerDownOutside`, `onInteractOutside` are consolidated differently; not currently used by any consumer.

## Verify by hand

- Trigger an alert dialog (e.g. a delete confirmation), confirm it traps focus, and confirm Cancel/Action buttons render and close it correctly.
