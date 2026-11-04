// The mount scenario's own probe (#340, not ported from drawerdeck's bench:
// drawerdeck has no mount scenario, so this is new). Unlike `../harness.ts`
// (the gesture bench's settle/motion probe), mounting needs no idle-time
// settle detector -- there is exactly one window per page load, from
// `markStart()` (called as the first line of every `client-entry-*.tsx`,
// before `createRoot`/`hydrateRoot` runs) to every rendered carousel
// instance publishing its own state.
//
// "Published," the same signal `../harness.ts` reads for the gesture bench
// (#340's mount lessons: "for carouseldeck, the Dots count; for each rival,
// its own API's equivalent"), is generalised here to N instances on one
// page: every `[data-bench-dots]`/`[data-carouseldeck-dots]` element on the
// page (one per carousel instance -- `mount-app.tsx` renders `n` of them)
// must report the full slide count before the page counts as mounted.
// `mount.spec.ts` polls this with `page.waitForFunction` -- never a fixed
// wall-clock window, which a CPU-throttled page can starve to only a frame
// or two of real progress (#340's own lesson).

declare global {
  interface Window {
    __mount: {
      markStart(): void;
      markPublished(): void;
      published(): boolean;
    };
    __mountConfig: { n: number; dirty: boolean };
  }
}

export function attachMountHarness(opts: { slideCount: number }): void {
  const { slideCount } = opts;
  window.__mount = {
    markStart: () => performance.mark('bench-mount-start'),
    markPublished: () => performance.mark('bench-mount-published'),
    published: () => {
      const bars = document.querySelectorAll<HTMLElement>(
        '[data-bench-dots], [data-carouseldeck-dots]'
      );
      const { n } = window.__mountConfig;
      if (bars.length !== n) return false;
      return Array.from(bars).every(
        (el) => el.getAttribute('data-count') === String(slideCount)
      );
    }
  };
}
