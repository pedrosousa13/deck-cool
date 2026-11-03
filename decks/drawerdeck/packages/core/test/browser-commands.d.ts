// The custom `vitest/browser` commands `vitest.config.ts` defines (real,
// trusted `page.mouse` input for the non-modal hit area's drag tests,
// #312): declared here, not there, for two reasons. `tsconfig.test.json`
// includes this directory, not the repo root, so an augmentation in
// `vitest.config.ts` would never reach `fixtures.ts`'s own `commands.*`
// calls. And it augments `vitest/internal/browser`, not the documented
// `vitest/node` (where `BrowserCommandContext`, the config's own
// `commands` option, is typed): the runtime `commands` export in
// `vitest/browser` (what `fixtures.ts` actually calls) types its
// `BrowserCommands` from `vitest/internal/browser`, not `vitest/node`'s
// own re-export of it, so only augmenting that module's own declaration
// reaches the call site.
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
    /** Holds a real touch down at a page point (a Chrome DevTools Protocol
     * `Input.dispatchTouchEvent`, Chromium only -- `vitest.config.ts`'s own
     * comment on it, including why this takes a point, not a selector).
     * Throws on any other browser; the touch guard test (`index.test.ts`,
     * #332's momentum follow-up) catches that to fall back to a real
     * `tapAtPoint` there. */
    holdTouchDown: (x: number, y: number) => Promise<void>;
    /** Releases the touch `holdTouchDown` started. */
    releaseHeldTouch: () => Promise<void>;
    /** A real OS-level touch tap (Playwright's own `page.touchscreen`,
     * which needs the browser context's `hasTouch` option, already set
     * above) at a page point. */
    tapAtPoint: (x: number, y: number) => Promise<void>;
  }
}
