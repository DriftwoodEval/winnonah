# form

2026-08-07, transformation engine (hand-migrated), no golden pair available. This file is not in the current shadcn radix-nova/base-nova registry at all (`https://ui.shadcn.com/r/styles/radix-nova/form.json` returns an item with no `files`), so it predates or diverges from the current registry and was migrated by hand against `universal-patterns.md`.

## Changed

- `src/app/_components/ui/form.tsx`: replaced `import { type Label as LabelPrimitive, Slot as SlotPrimitive } from "radix-ui"` with `@base-ui/react/merge-props` (`mergeProps`) and `@base-ui/react/use-render` (`useRender`).
  - `FormLabel`'s prop type changed from `React.ComponentProps<typeof LabelPrimitive.Root>` to `React.ComponentProps<typeof Label>` (the already-migrated native-`<label>`-based `Label` wrapper it renders).
  - `FormControl` (`form.tsx:107-128`) previously used `SlotPrimitive.Slot` to merge `aria-describedby`/`aria-invalid`/`id` onto its single child unconditionally (the Radix Slot idiom, not the `asChild`-toggle idiom). Migrated to `useRender({ defaultTagName: "div", render: children, props: mergeProps(...) })`, keeping the same children-based calling convention (`<FormControl><Input/></FormControl>`) so no consumer call site changes. Followed the skill's documented pitfall: cast the `data-*`/`aria-*` object literal to `React.ComponentProps<"div">` before passing to `mergeProps`, since data-attributes fail excess-property checking otherwise.

## Left alone

None, single-file component. `react-hook-form` usage (`Controller`, `FormProvider`, `useFormContext`, `useFormState`) is untouched, it has nothing to do with Radix.

## Behavior changes

None. `FormControl`'s prop-merging behavior onto its single child is preserved exactly; it's still not exposing `asChild`/`render` as a public toggle (never did).

## Verify by hand

- Open a form with validation errors (e.g. edit client dialog) and confirm `aria-invalid`/`aria-describedby` still reach the underlying input, and error messages are announced correctly by screen readers if you have one to hand.
