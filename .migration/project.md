# project

2026-08-07, whole-project migration from Radix UI to Base UI, complete.

## Dependency swap

- `components.json` style: `radix-nova` -> `base-nova`.
- Installed `@base-ui/react@1.7.0`.
- Removed `radix-ui@1.4.3` (no longer imported anywhere in `src/`).
- 24 UI wrappers migrated: button, label, separator, toggle, badge, avatar, checkbox, collapsible, context-menu, dropdown-menu, popover, progress, radio-group, scroll-area, select, switch, tabs, tooltip, accordion, button-group, toggle-group, alert-dialog, dialog, form.
  - `form.tsx` had no golden-pair registry entry (not in the current shadcn registry at all); migrated by hand using the `Slot`-idiom -> `useRender`/`mergeProps` pattern.
  - 6 wrappers (button-group, toggle-group, and several others during classification) turned out to be false-positive "customized" classifications caused by a bug in my own import-path normalization script during triage, not real project customizations; verified and corrected before migrating.

## Untouched (third-party, not Radix)

`command.tsx` (cmdk, only its `CommandDialog`'s `children` prop type was tightened since it consumes the now-migrated `Dialog`), `drawer.tsx` (vaul), `sonner.tsx`, `input-otp.tsx`, `calendar.tsx` (react-day-picker), `chart.tsx` (recharts), `multiple-selector.tsx`. Confirmed via `grep -rl "radix-ui\|@radix-ui" src` returning zero hits and via reviewing every file the automated `asChild` sweep touched.

## App-code consumer sweep

Typecheck went from 254 errors (immediately after wrapper migration) to 0. Categories fixed, file by file:

- **`asChild` -> `render`**: ~70 call sites across ~40 files, handled by a purpose-built script (`aschild_to_render.py`) that parses the JSX tree and hoists the child element into a `render` prop, with a special case for pass-through/Slot-forwarding components (`FormControl`) whose subtree must NOT be hoisted. The script initially mis-fired on `vaul`'s `Drawer` components (which also use an `asChild` prop, coincidentally) in `NavigationLinks.tsx` and `ResponsiveDialog.tsx`; caught during review and reverted to `asChild` since vaul is out of scope. Also hand-fixed nested Tooltip-wraps-Popover-wraps-Button triple compositions (`ClientsDashboard.tsx`, `HomeCustomizer.tsx`) into chained `render` props, since the script only handles one level.
- **`ScrollArea type="auto"`**: dropped, prop removed from Base UI (`AvailabilityList.tsx`, `issuesList.tsx`).
- **`Accordion`/`ToggleGroup` `type="single"|"multiple"`**: replaced with array-shaped `value`/`onValueChange` plus a `multiple` boolean where the group was actually controlled (`Dashboard.tsx`, `PermissionsField.tsx`, `DayAheadContent.tsx`, `WorkSummary.tsx`); simply dropped where the group was uncontrolled with manual per-item `onClick` handlers (`RichTextEditor.tsx`, 5 instances).
- **`Checkbox checked="indeterminate"`**: split into separate `checked`/`indeterminate` boolean props (`QuestionnairesTable.tsx`, `PermissionsField.tsx`).
- **`Select onValueChange` widened to `(value: string | null, ...)`**: ~12 call sites guarded against `null` (either via a short-circuit in the handler or widening the local state type), since Radix's `onValueChange` never fired with an empty value but Base UI's can.
- **Popover per-part dismiss callbacks removed**: `onFocusOutside`/`onPointerDownOutside` on `PopoverContent` moved to the `Popover` root's `onOpenChange(open, eventDetails)` with `eventDetails.reason` checks and `eventDetails.cancel()` (`date-time-picker.tsx`, `HeaderActions.tsx`).
- **`VisuallyHidden` (raw `radix-ui` import, no wrapper)**: found one direct usage in `ImageLightbox.tsx`; no Base UI equivalent exists, replaced with `className="sr-only"` directly on the already-migrated `DialogTitle`/`DialogDescription`.
- **`trigger?: React.ReactNode` props tightened to `React.ReactElement`**: `ResponsiveDialog.tsx`, `MergePreviewDialog.tsx`, `InsuranceReviewSubmitDialog.tsx`, `ManualAddressDialog.tsx` — these all forward a single element into a `DialogTrigger`/`PopoverTrigger`'s `render` prop, which requires a concrete `ReactElement`, not arbitrary `ReactNode`.

## Behavior changes (flagged across wrapper reports, not silently patched)

- Tabs: Base UI defaults to manual keyboard activation (Radix defaulted to automatic).
- Menus (context-menu, dropdown-menu): `closeOnClick` defaults `false` on Checkbox/Radio items (Radix closed on select).
- Tooltip: `disableHoverableContent` has no equivalent (unused in this codebase).
- Full list with per-component detail lives in each `.migration/<component>.md`.

## Final build

`mise run check` (tsc + biome + ruff + changelog validation) passes clean. `pnpm build` completes successfully (exit 0) with all 31 routes compiling.

**0 wrappers remain on Radix.**
