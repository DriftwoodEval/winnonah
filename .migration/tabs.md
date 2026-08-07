# tabs

2026-08-07, golden pair via shadcn CLI (`shadcn add tabs --overwrite`, base-nova), pristine wrapper, migrated clean.

## Changed

- `src/app/_components/ui/tabs.tsx`: `Tabs` from `radix-ui` -> `@base-ui/react/tabs`. Part rename: `TabsTrigger` -> `Tab` (wrapper export name unchanged), `TabsContent` -> `Panel` (wrapper export name unchanged). Added `aria-disabled` styling variants alongside existing `disabled` ones in the trigger's className (registry default). Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

- **Flagged, not patched**: Radix Tabs defaulted to automatic activation (arrow-key focus immediately switches the active tab). Base UI Tabs defaults to MANUAL activation (arrow keys move focus, Enter/Space commits the selection). No consumer in this codebase explicitly set `activationMode` (confirmed via grep), so this delta was implicit under Radix and is now implicit under Base UI's different default. A near-equivalent opt-in exists via `Tabs.List activateOnFocus`, intentionally not added since it wasn't requested.

## Verify by hand

- Click through tabs in a few places in the app (e.g. settings, dashboard) and confirm the correct panel shows.
- Focus a tab list with the keyboard and confirm arrow-key navigation now requires Enter/Space to activate a tab (this is the flagged behavior change, worth a sanity check for keyboard users).
