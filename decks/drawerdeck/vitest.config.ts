import { fileURLToPath, URL } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import type { BrowserCommandContext } from 'vitest/node';

// The `BrowserCommands` augmentation that types these three below (and the
// `commands.dragPointerDown(…)` calls in `packages/core/test/fixtures.ts`)
// lives in `packages/core/test/browser-commands.d.ts`, not here: this file
// is not part of either package's own `tsconfig`, so an augmentation here
// would not reach the test files that call them.
// The CDP session a `holdTouchDown` call opens, kept here (not returned
// through the command channel, which only carries JSON-serializable
// values) so the later `releaseHeldTouch` call in the same test can send
// its own `Input.dispatchTouchEvent` on it. One drawer test at a time ever
// holds a touch, so a single module-level slot is enough.
let heldTouchCdp:
  | Awaited<ReturnType<BrowserCommandContext['context']['newCDPSession']>>
  | undefined;

export default defineConfig({
  resolve: {
    // One copy of react and react-dom: Vite's own resolution can otherwise
    // load a second one for a test that imports them differently than
    // @testing-library/react's own internals do, breaking hooks (useState
    // then reads a hook dispatcher react-dom never set).
    dedupe: ['react', 'react-dom'],
    // Tests import the packages by name, as a consumer does, and run their
    // source rather than a stale `dist`. Anchored so a future subpath
    // export is not swallowed by the bare specifier's alias.
    alias: [
      {
        find: /^@drawerdeck\/core$/,
        replacement: fileURLToPath(
          new URL('./packages/core/src/index.ts', import.meta.url)
        )
      },
      {
        find: /^@drawerdeck\/react$/,
        replacement: fileURLToPath(
          new URL('./packages/react/src/index.tsx', import.meta.url)
        )
      }
    ]
  },
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}'],
    // React 18 and 19's tests run in `pnpm test:react-18`/`test:react-19`.
    exclude: ['packages/react-18/**'],
    setupFiles: ['packages/react/test/setup.ts'],
    // A real browser, not a DOM emulation: the drawer is a <dialog>,
    // native scroll-snap and `scrollend`, none of which happy-dom or jsdom
    // implements.
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: 'chromium' }, { browser: 'webkit' }],
      provider: playwright({ contextOptions: { hasTouch: true } }),
      commands: {
        // Real input for the non-modal hit area's drag tests (#312):
        // `userEvent` has no multi-step pointer API of its own (only
        // whole-gesture helpers like `click` and `dragAndDrop`'s single
        // source-to-target hop), so this drives Playwright's own
        // `page.mouse` directly, the same OS-level input a real drag is.
        // Split into three commands, not one that takes a whole gesture:
        // the test itself drives each step and reads the real, resulting
        // `scrollTop` back between them (`realMouseDrag` in `fixtures.ts`),
        // since how far a given `page.mouse` delta actually moves the
        // pointer is not 1:1 with the CSS pixels asked for here.
        async dragPointerDown(context, selector, offsetX, offsetY) {
          const frame = await context.frame();
          const box = await frame.locator(selector).boundingBox();
          if (!box) {
            throw new Error(`dragPointerDown: no element matches ${selector}`);
          }
          const x = box.x + offsetX;
          const y = box.y + offsetY;
          await context.page.mouse.move(x, y);
          await context.page.mouse.down();
          return { x, y };
        },
        async dragPointerMoveTo(context, x, y) {
          await context.page.mouse.move(x, y);
        },
        async dragPointerUp(context) {
          await context.page.mouse.up();
        },
        // Real input for the two nested interrupt-listener tests
        // (`nested.test.tsx`, #332): a hand-dispatched `new Event(type)`
        // through `dispatchEvent` never goes through the browser's own
        // dispatch at all, so it cannot prove anything about a real
        // gesture reaching (or not reaching) a drawer nested above
        // another. These two go through Playwright instead, the same way
        // `dragPointerDown` above does.
        async tapAt(context, selector, offsetX, offsetY) {
          const frame = await context.frame();
          const box = await frame.locator(selector).boundingBox();
          if (!box) {
            throw new Error(`tapAt: no element matches ${selector}`);
          }
          await context.page.touchscreen.tap(box.x + offsetX, box.y + offsetY);
        },
        async wheelAt(context, selector, offsetX, offsetY, deltaX, deltaY) {
          const frame = await context.frame();
          const box = await frame.locator(selector).boundingBox();
          if (!box) {
            throw new Error(`wheelAt: no element matches ${selector}`);
          }
          await context.page.mouse.move(box.x + offsetX, box.y + offsetY);
          await context.page.mouse.wheel(deltaX, deltaY);
        },
        // Holds a real touch down at a page point, for the touch guard on
        // the early-close margin (`index.test.ts`, #332's momentum
        // follow-up): `tapAt`, above, is all Playwright's own
        // `page.touchscreen` offers -- "limited to emulating tap gestures"
        // (its own doc), a single touchstart+touchend with no control over
        // what happens between them. Holding one down across an assertion
        // needs the Chrome DevTools Protocol directly, the same real input
        // `tap()` itself sends under the hood on Chromium, just not glued
        // to an immediate release. CDP sessions only exist on Chromium
        // (`BrowserContext.newCDPSession`'s own doc: "CDP sessions are only
        // supported on Chromium-based browsers"), so there is no public,
        // non-dispatch way to hold a touch down in WebKit at all --
        // `index.test.ts`'s own comment on its WebKit branch explains what
        // it tests instead. Takes the page point directly, not a selector
        // `boundingBox` resolves (`tapAt`'s own approach): a `<dialog>`
        // opened with `showModal()` -- the top layer -- read as not
        // `isVisible()` to Playwright's own WebKit automation in this
        // harness, so a locator anywhere inside one, even just for its own
        // `boundingBox`, cannot be trusted to resolve here at all. The
        // caller reads the point off the real, live `getBoundingClientRect`
        // instead (`index.test.ts`'s own comment on that).
        async holdTouchDown(context, x, y) {
          heldTouchCdp = await context.context.newCDPSession(context.page);
          await heldTouchCdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ x, y }]
          });
        },
        // Releases the touch `holdTouchDown` started.
        async releaseHeldTouch() {
          if (!heldTouchCdp) {
            throw new Error('releaseHeldTouch: no touch is held');
          }
          const cdp = heldTouchCdp;
          heldTouchCdp = undefined;
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: []
          });
          await cdp.detach().catch(() => {});
        },
        // A real tap (`page.touchscreen.tap`) at a page point directly,
        // the same reason `holdTouchDown`, above, takes one instead of a
        // selector.
        async tapAtPoint(context, x, y) {
          await context.page.touchscreen.tap(x, y);
        }
      }
    }
  }
});
