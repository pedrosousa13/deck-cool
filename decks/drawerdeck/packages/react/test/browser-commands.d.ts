// The custom `vitest/browser` commands `../../vitest.config.ts` defines
// (real, trusted `page.mouse` input for `sides.test.tsx`'s per-side drag
// test, #270): declared here, not there, for the same two reasons
// `@drawerdeck/core`'s own copy of this file
// (`packages/core/test/browser-commands.d.ts`) explains. `tsconfig.test.json`
// includes this directory, not the repo root or the other package's `test`
// directory, so an augmentation in `vitest.config.ts` -- or in core's own
// copy -- would never reach this package's own `commands.*` calls. And it
// augments `vitest/internal/browser`, not the documented `vitest/node`
// (where `BrowserCommandContext`, the config's own `commands` option, is
// typed): the runtime `commands` export in `vitest/browser` (what
// `sides.test.tsx` actually calls) types its `BrowserCommands` from
// `vitest/internal/browser`, not `vitest/node`'s own re-export of it, so
// only augmenting that module's own declaration reaches the call site.
declare module 'vitest/internal/browser' {
  interface BrowserCommands {
    /** A real OS-level mouse press (Playwright's own `page.mouse`, not a
     * hand-dispatched `PointerEvent`): on the element `selector` resolves
     * to, at `offsetX`/`offsetY` from its own top-left corner. Returns the
     * absolute point pressed, so a later `dragPointerMoveTo` keeps moving
     * the same (fixed) `x`. */
    dragPointerDown: (
      selector: string,
      offsetX: number,
      offsetY: number
    ) => Promise<{ x: number; y: number }>;
    /** Moves the held pointer `dragPointerDown` started to an absolute
     * point. */
    dragPointerMoveTo: (x: number, y: number) => Promise<void>;
    /** Releases the pointer `dragPointerDown` started. */
    dragPointerUp: () => Promise<void>;
  }
}
