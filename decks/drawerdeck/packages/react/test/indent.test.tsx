// An opt-in background indent (#274): a `Drawer.Root` prop, `indent`,
// taking a ref to the consumer's own page wrapper, which
// `@drawerdeck/core` scales back in step with this drawer's own open
// progress, from open through the end of its own close -- `data-drawer-
// indent` and a registered `--drawer-indent-progress`. Every open, close
// and drag here is real input (`userEvent`, or the `dragPointerDown`/
// `dragPointerMoveTo`/`dragPointerUp` commands for the drag tests), the
// same reason `nested.test.tsx` insists on it: the top layer and a real
// scroll timeline are both things only real input, not a hand-dispatched
// event, actually exercises.
import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  useRef
} from 'react';
import { createPortal } from 'react-dom';
import { render, screen } from '@testing-library/react';
import { commands, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Drawer from '@drawerdeck/react';
import {
  expectSettledTo,
  mockReducedMotion,
  nextFrame,
  sleep
} from './fixtures';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.style.margin = '';
  document.body.style.height = '';
  window.scrollTo(0, 0);
  // A safety net against this file's own tests leaking into each other,
  // not a substitute for a test's own before/after comparison: every
  // test below still captures and checks `documentElement`'s own style
  // itself, within its own run.
  document.documentElement.style.removeProperty('timeline-scope');
});

/** One drawer, with `indent` wired to `pageRef`: every part gets its own
 * `data-testid`, suffixed with `id` (the same shape `nested.test.tsx`'s
 * own `Level` uses), so more than one of these can render side by side
 * without ambiguous selectors. `portal`, if true, renders this drawer's
 * own `Drawer.Popup` through `createPortal(…, document.body)` instead of
 * as a plain child of its own `Drawer.Root`: #274's own research found
 * the indent binding resolves regardless (unlike `--drawer-nested-
 * progress`, which `timeline-scope` only ever reaches from a genuine DOM
 * descendant), since `documentElement`, not this drawer's own dialog, is
 * the shared ancestor the indent's own timeline-scope lifts to. */
function IndentDrawer({
  id,
  indent,
  portal,
  content,
  ...rootProps
}: {
  id: string;
  portal?: boolean;
  content?: ReactNode;
} & ComponentProps<typeof Drawer.Root>) {
  const popup = (
    <Drawer.Popup data-testid={`popup-${id}`}>
      <Drawer.Viewport>
        <Drawer.Panel data-testid={`panel-${id}`}>
          <Drawer.Handle data-testid={`handle-${id}`} />
          <Drawer.Content>
            {/* Short on purpose, the same reason `nested.test.tsx`'s own
                `Level` keeps its content short: `Drawer.Close` needs to
                stay inside the one snap point a real `userEvent.click`
                can actually reach. */}
            {content ?? <p>Content {id}.</p>}
          </Drawer.Content>
          <Drawer.Close data-testid={`close-${id}`}>Close {id}</Drawer.Close>
        </Drawer.Panel>
      </Drawer.Viewport>
    </Drawer.Popup>
  );
  return (
    <Drawer.Root {...rootProps} indent={indent}>
      <Drawer.Trigger data-testid={`open-${id}`}>Open {id}</Drawer.Trigger>
      {portal ? createPortal(popup, document.body) : popup}
    </Drawer.Root>
  );
}

/** The consumer's own page wrapper (`RootProps.indent`'s own doc): flush
 * against the document's own top-left corner (`position: relative` at the
 * default static offset, the first thing this file ever renders, with the
 * body's own default margin zeroed in `afterEach`'s own counterpart,
 * below -- `beforeEach` is not needed since every test sets it itself,
 * only the tests that actually scroll the page need it at all), so the
 * pixel values `activateIndent` (`@drawerdeck/core`) writes to its own
 * `transform-origin` land in real document coordinates, the same
 * assumption #274's own research measured against. */
function Page({
  pageRef,
  tall
}: {
  pageRef: RefObject<HTMLDivElement | null>;
  tall?: boolean;
}) {
  return (
    <div
      data-testid="page"
      ref={pageRef}
      style={{
        position: 'relative',
        width: 300,
        height: tall ? 4000 : 300,
        background: 'tomato'
      }}
    />
  );
}

async function openDrawer(id: string) {
  await userEvent.click(screen.getByTestId(`open-${id}`));
  await expectSettledTo(() => popupOf(id).getAttribute('data-phase'), 'open');
}

const popupOf = (id: string) =>
  screen.getByTestId(`popup-${id}`) as HTMLDialogElement;

/** The maintainer's own one-line recipe (the acceptance criteria, #274):
 * `scale: calc(1 - 0.05 * var(--drawer-indent-progress))`. Scoped to a
 * unique marker attribute and removed again once the test is done with
 * it, the same local pattern `nested.test.tsx`'s own `withTransformTransition`
 * and `withNestedScaleRecipe` use. */
function withIndentRecipe(el: HTMLElement): () => void {
  const marker = `data-test-${Math.random().toString(36).slice(2)}`;
  el.setAttribute(marker, '');
  const style = document.createElement('style');
  style.textContent = `
    [${marker}] { scale: calc(1 - 0.05 * var(--drawer-indent-progress, 0)); }
  `;
  document.head.append(style);
  return () => {
    style.remove();
    el.removeAttribute(marker);
  };
}

/** The computed `scale` CSS property, as a plain number: `getComputedStyle`
 * serializes a uniform `scale()` as one token, never the two- or
 * three-axis form a non-uniform one would. `'none'` -- its own initial
 * value, read before any rule ever sets it, or once `data-drawer-indent`
 * is removed again and a recipe keyed on it stops matching -- reads as
 * `1`, the same "unscaled" value a matched rule settles on anyway. */
const readScale = (el: HTMLElement) => {
  const scale = getComputedStyle(el).scale;
  return scale === 'none' ? 1 : Number.parseFloat(scale);
};

describe('the indent binds to a native scroll timeline', () => {
  it('resolves a non-null CSSAnimation.timeline once open', async () => {
    mockReducedMotion();
    const Harness = () => {
      const pageRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <Page pageRef={pageRef} />
          <IndentDrawer id="a" indent={pageRef} />
        </>
      );
    };
    render(<Harness />);
    await openDrawer('a');

    const page = screen.getByTestId('page');
    const animation = page
      .getAnimations()
      .find(
        (a): a is CSSAnimation =>
          a instanceof CSSAnimation &&
          a.animationName === 'drawerdeck-indent-progress-bottom'
      );
    expect(animation).toBeDefined();
    expect(animation!.timeline).not.toBeNull();
  });

  it('still resolves with Drawer.Popup rendered through a React portal', async () => {
    mockReducedMotion();
    const Harness = () => {
      const pageRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <Page pageRef={pageRef} />
          <IndentDrawer id="a" indent={pageRef} portal />
        </>
      );
    };
    render(<Harness />);
    await openDrawer('a');

    // Really not a descendant: `createPortal` put the dialog on
    // `document.body`, a sibling of `page`, never an ancestor of it --
    // unlike `--drawer-nested-progress`, which `timeline-scope` only ever
    // reaches from a genuine DOM descendant of the dialog behind it, this
    // drawer's own indent timeline is scoped on `documentElement`, which
    // is a shared ancestor of the Viewport and the page either way.
    expect(document.body.contains(popupOf('a'))).toBe(true);

    const page = screen.getByTestId('page');
    const animation = page
      .getAnimations()
      .find(
        (a): a is CSSAnimation =>
          a instanceof CSSAnimation &&
          a.animationName === 'drawerdeck-indent-progress-bottom'
      );
    expect(animation).toBeDefined();
    expect(animation!.timeline).not.toBeNull();
  });
});

describe('the indent follows a real drag and settles at the open value', () => {
  it("a real drag toward closed moves the target's own scale monotonically, and dragging back to open before release restores it", async () => {
    mockReducedMotion();
    const Harness = () => {
      const pageRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <Page pageRef={pageRef} />
          <IndentDrawer id="a" indent={pageRef} />
        </>
      );
    };
    render(<Harness />);
    await openDrawer('a');

    const page = screen.getByTestId('page');
    const restore = withIndentRecipe(page);
    try {
      await nextFrame();
      await nextFrame();
      const atOpenScale = readScale(page);
      expect(atOpenScale).toBeCloseTo(0.95, 2);

      const start = await commands.dragPointerDown(
        '[data-testid="handle-a"]',
        5,
        5
      );
      const scales: number[] = [atOpenScale];
      let y = start.y;
      for (let i = 0; i < 40; i++) {
        y += 20;
        await commands.dragPointerMoveTo(start.x, y);
        await nextFrame();
        scales.push(readScale(page));
      }

      // Monotonic: dragging toward closed only ever scales the page back
      // toward 1, never further in, and never oscillates.
      for (let i = 1; i < scales.length; i++) {
        expect(scales[i]).toBeGreaterThanOrEqual(scales[i - 1] - 0.002);
      }
      expect(scales[scales.length - 1]).toBeGreaterThan(atOpenScale + 0.01);

      // Back up to very nearly the position the drag started at, before
      // releasing: restores the open scale with no special-cased
      // "restore", the same way a real drag does for `--drawer-nested-
      // progress` (`nested.test.tsx`).
      for (let i = 0; i < 40; i++) {
        y -= 20;
        await commands.dragPointerMoveTo(start.x, y);
        await nextFrame();
      }
      await commands.dragPointerUp();

      await expectSettledTo(
        () => popupOf('a').getAttribute('data-phase'),
        'open'
      );
      await nextFrame();
      await nextFrame();
      expect(readScale(page)).toBeCloseTo(0.95, 2);
    } finally {
      restore();
    }
  });
});

describe('the indent does not shift the page when it was already scrolled before opening', () => {
  it('leaves a marker at the viewport center within 2px, closed vs. open', async () => {
    mockReducedMotion();
    document.body.style.margin = '0';
    const Harness = () => {
      const pageRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <Page pageRef={pageRef} tall />
          <Drawer.Root indent={pageRef}>
            {/* Pinned, not wherever normal flow would put it after a
                4000px-tall page: a real `userEvent.click` scrolls an
                off-screen target into view first, which would move
                `window.scrollY` out from under this test's own `before`
                measurement, for a reason that has nothing to do with the
                indent itself. */}
            <Drawer.Trigger
              data-testid="open-a"
              style={{ position: 'fixed', top: 0, left: 0 }}
            >
              Open a
            </Drawer.Trigger>
            <Drawer.Popup data-testid="popup-a">
              <Drawer.Viewport>
                <Drawer.Panel data-testid="panel-a">
                  <Drawer.Content>
                    <p>Content.</p>
                  </Drawer.Content>
                  <Drawer.Close data-testid="close-a">Close a</Drawer.Close>
                </Drawer.Panel>
              </Drawer.Viewport>
            </Drawer.Popup>
          </Drawer.Root>
        </>
      );
    };
    render(<Harness />);

    const page = screen.getByTestId('page');
    const restore = withIndentRecipe(page);
    const marker = document.createElement('div');
    try {
      window.scrollTo(0, 2000);
      await nextFrame();
      // The marker sits at the real, current viewport's own center, in
      // document coordinates, the exact point `activateIndent`
      // (`@drawerdeck/core`) sets `transform-origin` to at the moment
      // this drawer opens: a uniform `scale()` around that point leaves
      // it the one place on the page that does not move.
      const centerX = window.scrollX + window.innerWidth / 2;
      const centerY = window.scrollY + window.innerHeight / 2;
      Object.assign(marker.style, {
        position: 'absolute',
        left: `${centerX}px`,
        top: `${centerY}px`,
        width: '2px',
        height: '2px'
      });
      page.append(marker);

      const before = marker.getBoundingClientRect();
      await openDrawer('a');
      await nextFrame();
      await nextFrame();
      const after = marker.getBoundingClientRect();

      expect(Math.abs(after.left - before.left)).toBeLessThan(2);
      expect(Math.abs(after.top - before.top)).toBeLessThan(2);
    } finally {
      marker.remove();
      restore();
    }
  });
});

describe('nesting: only the outermost open drawer indents the page', () => {
  it("a nested inner Root's own indent is ignored, and the outer's own indent stays correct", async () => {
    mockReducedMotion();
    const Harness = () => {
      const pageRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <Page pageRef={pageRef} />
          <IndentDrawer
            id="outer"
            indent={pageRef}
            content={
              <>
                <p>Outer content.</p>
                <Drawer.Root indent={pageRef}>
                  <Drawer.Trigger data-testid="open-inner">
                    Open inner
                  </Drawer.Trigger>
                  <Drawer.Popup data-testid="popup-inner">
                    <Drawer.Viewport>
                      <Drawer.Panel data-testid="panel-inner">
                        <Drawer.Content>
                          <p>Inner content.</p>
                        </Drawer.Content>
                        <Drawer.Close data-testid="close-inner">
                          Close inner
                        </Drawer.Close>
                      </Drawer.Panel>
                    </Drawer.Viewport>
                  </Drawer.Popup>
                </Drawer.Root>
              </>
            }
          />
        </>
      );
    };
    render(<Harness />);

    const page = screen.getByTestId('page');
    const restore = withIndentRecipe(page);
    try {
      await openDrawer('outer');
      await nextFrame();
      await nextFrame();
      const outerOnlyScale = readScale(page);
      expect(outerOnlyScale).toBeCloseTo(0.95, 2);
      // The attribute's own value is this drawer's own side (#274 review:
      // the adopted stylesheet's own animation rule is keyed on it,
      // `[data-drawer-indent=bottom]`), not an empty marker.
      expect(page.getAttribute('data-drawer-indent')).toBe('bottom');

      await userEvent.click(screen.getByTestId('open-inner'));
      await expectSettledTo(
        () => screen.getByTestId('popup-inner').getAttribute('data-phase'),
        'open'
      );
      await nextFrame();
      await nextFrame();

      // Unchanged: the inner Root's own `indent` never reached
      // `@drawerdeck/core` at all (`@drawerdeck/react`'s own `RootProps.
      // indent` doc), so nothing about the page's own indent state moved
      // when it opened.
      expect(readScale(page)).toBeCloseTo(outerOnlyScale, 5);
      expect(page.getAttribute('data-drawer-indent')).toBe('bottom');

      await userEvent.click(screen.getByTestId('close-inner'));
      await expectSettledTo(
        () => screen.getByTestId('popup-inner').getAttribute('data-phase'),
        'closed'
      );
      await nextFrame();
      await nextFrame();
      expect(readScale(page)).toBeCloseTo(outerOnlyScale, 5);
      expect(page.getAttribute('data-drawer-indent')).toBe('bottom');
    } finally {
      restore();
    }
  });
});

describe('close and unmount restore the target exactly', () => {
  it.each([
    [
      'the close button',
      async () => {
        await userEvent.click(screen.getByTestId('close-a'));
      }
    ],
    [
      'Escape',
      async () => {
        await userEvent.keyboard('{Escape}');
      }
    ]
  ] as const)(
    'closing by %s clears data-drawer-indent and --drawer-indent-progress, and leaves no inline style behind on the target or html',
    async (_label, close) => {
      mockReducedMotion();
      const Harness = () => {
        const pageRef = useRef<HTMLDivElement>(null);
        return (
          <>
            <Page pageRef={pageRef} />
            <IndentDrawer id="a" indent={pageRef} />
          </>
        );
      };
      render(<Harness />);

      const page = screen.getByTestId('page');
      const htmlBefore = document.documentElement.getAttribute('style') ?? '';
      const pageStyleBefore = page.getAttribute('style') ?? '';

      await openDrawer('a');
      await nextFrame();

      expect(page.hasAttribute('data-drawer-indent')).toBe(true);
      // `timeline-scope` on `<html>` comes from the adopted stylesheet's
      // own `:root:has([data-drawer-indent])` rule (#274 review), never an
      // inline write any more: `getComputedStyle`, not `.style`, is what
      // resolves it, and `<html>`'s own inline `style` attribute (checked
      // again, unchanged, after the close below) never moves at all.
      expect(
        getComputedStyle(document.documentElement).getPropertyValue(
          'timeline-scope'
        )
      ).toBe('--drawer-indent');
      expect(document.documentElement.getAttribute('style') ?? '').toBe(
        htmlBefore
      );

      await close();
      await expectSettledTo(
        () => popupOf('a').getAttribute('data-phase'),
        'closed'
      );
      await sleep(50);

      expect(page.hasAttribute('data-drawer-indent')).toBe(false);
      expect(page.hasAttribute('data-ending-style')).toBe(false);
      // Nothing inline any more, not even transiently (#274 review): the
      // transform-origin and the native animation both come from the
      // adopted stylesheet's own rule, keyed on `data-drawer-indent`'s own
      // presence, never written on the target's own `style` -- only the
      // three custom properties this engine itself owns are ever set, and
      // all three clear here, with no pre-existing inline value to
      // restore underneath them.
      expect(page.style.getPropertyValue('--drawer-indent-progress')).toBe('');
      expect(page.style.getPropertyValue('--drawer-indent-origin')).toBe('');
      expect(page.style.getPropertyValue('--drawer-indent-range')).toBe('');
      expect(page.style.getPropertyValue('transform-origin')).toBe('');
      expect(page.style.getPropertyValue('animation')).toBe('');
      expect(page.style.getPropertyValue('animation-timeline')).toBe('');
      expect(page.style.getPropertyValue('animation-range')).toBe('');
      expect(page.getAttribute('style') ?? '').toBe(pageStyleBefore);
      expect(document.documentElement.getAttribute('style') ?? '').toBe(
        htmlBefore
      );
    }
  );

  it('a real drag past the closed point restores the target the same way', async () => {
    mockReducedMotion();
    const Harness = () => {
      const pageRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <Page pageRef={pageRef} />
          <IndentDrawer id="a" indent={pageRef} />
        </>
      );
    };
    render(<Harness />);

    const page = screen.getByTestId('page');
    const htmlBefore = document.documentElement.getAttribute('style') ?? '';

    await openDrawer('a');
    await nextFrame();
    expect(page.hasAttribute('data-drawer-indent')).toBe(true);

    const start = await commands.dragPointerDown(
      '[data-testid="handle-a"]',
      5,
      5
    );
    let y = start.y;
    for (let i = 0; i < 60; i++) {
      y += 20;
      await commands.dragPointerMoveTo(start.x, y);
      await nextFrame();
    }
    await commands.dragPointerUp();
    await expectSettledTo(
      () => popupOf('a').getAttribute('data-phase'),
      'closed'
    );
    await sleep(50);

    expect(page.hasAttribute('data-drawer-indent')).toBe(false);
    expect(page.style.getPropertyValue('--drawer-indent-progress')).toBe('');
    expect(page.style.getPropertyValue('--drawer-indent-origin')).toBe('');
    expect(page.style.getPropertyValue('--drawer-indent-range')).toBe('');
    expect(page.style.getPropertyValue('transform-origin')).toBe('');
    expect(document.documentElement.getAttribute('style') ?? '').toBe(
      htmlBefore
    );
  });

  it('unmounting while open leaves no attribute, inline style or timeline-scope entry on the target', async () => {
    mockReducedMotion();
    const Harness = () => {
      const pageRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <Page pageRef={pageRef} />
          <IndentDrawer id="a" indent={pageRef} />
        </>
      );
    };
    const view = render(<Harness />);

    const page = screen.getByTestId('page');
    const htmlBefore = document.documentElement.getAttribute('style') ?? '';

    await openDrawer('a');
    await nextFrame();
    expect(page.hasAttribute('data-drawer-indent')).toBe(true);

    view.unmount();

    expect(page.hasAttribute('data-drawer-indent')).toBe(false);
    expect(page.style.getPropertyValue('--drawer-indent-progress')).toBe('');
    expect(page.style.getPropertyValue('--drawer-indent-origin')).toBe('');
    expect(page.style.getPropertyValue('--drawer-indent-range')).toBe('');
    expect(page.style.getPropertyValue('transform-origin')).toBe('');
    expect(page.style.getPropertyValue('animation')).toBe('');
    expect(document.documentElement.getAttribute('style') ?? '').toBe(
      htmlBefore
    );
  });
});

describe('two non-nested drawers with indent, on separate targets: only one owns the indent at a time', () => {
  // Changed on purpose (#274 review, a maintainer's own ruling): the
  // registry this used to be ref-counted, so two sibling drawers with
  // `indent` set could both indent their own target at once. A single
  // page-wide owner replaces it -- the first (so, in practice, the
  // outermost) drawer to want it keeps it until it releases, and a second
  // one does nothing in the meantime, recovering on its own the moment the
  // owner lets go, with no extra prop or call needed.
  it('B does nothing while A owns the indent, and picks it up the moment A closes', async () => {
    mockReducedMotion();
    const Harness = () => {
      const pageRefA = useRef<HTMLDivElement>(null);
      const pageRefB = useRef<HTMLDivElement>(null);
      return (
        <>
          <div
            data-testid="page-a"
            ref={pageRefA}
            style={{ position: 'relative' }}
          />
          <div
            data-testid="page-b"
            ref={pageRefB}
            style={{ position: 'relative' }}
          />
          {/* Non-modal, both: a modal drawer's own top layer makes the
              rest of the page inert, including the other drawer's own
              trigger, which has nothing to do with the indent itself.
              Different sides, so their two panels occupy different
              screen regions instead of both covering the same bottom
              strip, which would let one's own Viewport (clipped to its
              own panel, but still `position: fixed; inset: 0` on its
              own dialog) intercept a click meant for the other's. */}
          <IndentDrawer id="a" indent={pageRefA} modal={false} side="bottom" />
          <IndentDrawer id="b" indent={pageRefB} modal={false} side="top" />
        </>
      );
    };
    render(<Harness />);

    const pageA = screen.getByTestId('page-a');
    const pageB = screen.getByTestId('page-b');
    const restoreA = withIndentRecipe(pageA);
    const restoreB = withIndentRecipe(pageB);
    try {
      await openDrawer('a');
      await nextFrame();
      await nextFrame();
      expect(pageA.hasAttribute('data-drawer-indent')).toBe(true);
      expect(pageB.hasAttribute('data-drawer-indent')).toBe(false);
      expect(readScale(pageA)).toBeCloseTo(0.95, 2);
      expect(readScale(pageB)).toBe(1);

      // B opens while A already owns the indent: B's own target does
      // nothing at all -- no attribute, no scale -- even though B itself
      // is genuinely open.
      await openDrawer('b');
      await nextFrame();
      await nextFrame();
      expect(pageA.hasAttribute('data-drawer-indent')).toBe(true);
      expect(pageB.hasAttribute('data-drawer-indent')).toBe(false);
      expect(readScale(pageA)).toBeCloseTo(0.95, 2);
      expect(readScale(pageB)).toBe(1);

      // A closes, releasing the owner: B, still open the whole time,
      // claims it on its own, with nothing of its own having changed.
      await userEvent.click(screen.getByTestId('close-a'));
      await expectSettledTo(
        () => popupOf('a').getAttribute('data-phase'),
        'closed'
      );
      await nextFrame();
      await nextFrame();
      expect(pageA.hasAttribute('data-drawer-indent')).toBe(false);
      expect(readScale(pageA)).toBe(1);
      expect(pageB.hasAttribute('data-drawer-indent')).toBe(true);
      expect(readScale(pageB)).toBeCloseTo(0.95, 2);

      await userEvent.click(screen.getByTestId('close-b'));
      await expectSettledTo(
        () => popupOf('b').getAttribute('data-phase'),
        'closed'
      );
      await nextFrame();
      expect(pageB.hasAttribute('data-drawer-indent')).toBe(false);
      // `<html>`'s own `timeline-scope` is the adopted stylesheet's
      // `:root:has([data-drawer-indent])` rule, not an inline write: with
      // neither target carrying the attribute any more, it no longer
      // matches, the same as before either drawer ever opened.
      expect(
        getComputedStyle(document.documentElement).getPropertyValue(
          'timeline-scope'
        )
      ).toBe('none');
    } finally {
      restoreA();
      restoreB();
    }
  });
});

describe('the no-scroll-timeline fallback', () => {
  it('writes --drawer-indent-progress directly, following the open and a real scroll frame', async () => {
    mockReducedMotion();
    const realSupports = CSS.supports.bind(CSS);
    vi.spyOn(CSS, 'supports').mockImplementation((prop: string) =>
      prop.includes('animation-timeline') ? false : realSupports(prop)
    );
    const Harness = () => {
      const pageRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <Page pageRef={pageRef} />
          <IndentDrawer id="a" indent={pageRef} />
        </>
      );
    };
    render(<Harness />);

    const page = screen.getByTestId('page');
    await openDrawer('a');
    await nextFrame();

    expect(page.hasAttribute('data-drawer-indent')).toBe(true);
    // Changed on purpose (#274 review): the fallback now reuses
    // `onProgressChange`'s own dedupe path, writing the plain number
    // straight through (`${full}`) rather than its own separate
    // `toFixed(4)` formatting.
    expect(page.style.getPropertyValue('--drawer-indent-progress')).toBe('1');

    const start = await commands.dragPointerDown(
      '[data-testid="handle-a"]',
      5,
      5
    );
    await commands.dragPointerMoveTo(start.x, start.y + 40);
    // The fallback writes on a real scroll frame (`onScroll`'s own
    // `requestAnimationFrame`, @drawerdeck/core), not synchronously with
    // the pointer move itself: the programmatic `scrollTop` write that
    // moves the drag fires a native `scroll` event as its own queued
    // task, which this waits out before the next animation frame can
    // run `updateProgress`.
    await sleep(100);
    await nextFrame();
    await nextFrame();
    const midDrag = Number.parseFloat(
      page.style.getPropertyValue('--drawer-indent-progress')
    );
    expect(midDrag).toBeLessThan(1);
    expect(midDrag).toBeGreaterThanOrEqual(0);
    await commands.dragPointerMoveTo(start.x, start.y);
    await nextFrame();
    await commands.dragPointerUp();

    await expectSettledTo(
      () => popupOf('a').getAttribute('data-phase'),
      'open'
    );
    await userEvent.click(screen.getByTestId('close-a'));
    await expectSettledTo(
      () => popupOf('a').getAttribute('data-phase'),
      'closed'
    );
    expect(page.hasAttribute('data-drawer-indent')).toBe(false);
    expect(page.style.getPropertyValue('--drawer-indent-progress')).toBe('');
  });
});

describe('easing with a button close, Escape and an outside press, not only a drag (#274 review)', () => {
  // Not `mockReducedMotion()` anywhere in this block, on purpose: these
  // tests are about the motion itself (the guide's own recipe: a
  // registered --drawer-indent-on factor, transitioned, dropped to 0 by
  // data-ending-style -- see the "A background indent" guide), so they
  // need the Panel's own real CSS transition to actually run, not the
  // JS-side `instant` shortcut `mockReducedMotion` forces.
  const PANEL_TRANSITION = `
    [data-drawerdeck-panel] { transition: transform 300ms linear; }
    [data-drawerdeck-panel][data-starting-style],
    [data-drawerdeck-panel][data-ending-style] { transform: translateY(100%); }
  `;
  const INDENT_RECIPE = `
    @property --drawer-indent-on {
      syntax: '<number>';
      inherits: false;
      initial-value: 0;
    }
    [data-drawer-indent] {
      --drawer-indent-on: 1;
      scale: calc(1 - 0.05 * var(--drawer-indent-progress) * var(--drawer-indent-on));
      transition: --drawer-indent-on 300ms linear;
    }
    [data-drawer-indent][data-ending-style] {
      --drawer-indent-on: 0;
    }
  `;
  let styleEl: HTMLStyleElement | undefined;
  afterEach(() => {
    styleEl?.remove();
    styleEl = undefined;
  });

  function installRecipe() {
    styleEl = document.createElement('style');
    styleEl.textContent = PANEL_TRANSITION + INDENT_RECIPE;
    document.head.append(styleEl);
  }

  /** Samples `readScale(target)` every animation frame until `stop()` is
   * called: the per-frame trail every assertion below checks for a
   * monotonic ease, never a jump. */
  function sampleScalePerFrame(target: HTMLElement) {
    const scales: number[] = [];
    let running = true;
    const loop = () => {
      if (!running) return;
      scales.push(readScale(target));
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return { scales, stop: () => (running = false) };
  }

  /** `scales` must move only toward `end` from `start` (allowing a hair of
   * real sampling jitter), covering most of the real span between them,
   * and never in one single frame: the largest step between two
   * consecutive samples stays within a small multiple of "one frame's
   * share" of the whole span, rather than one frame covering the entire
   * 0.05 jump a scroll-driven `--drawer-indent-progress` alone -- with no
   * easing factor transitioning it -- would show on a CSS-driven open or
   * close (#274 review, this round's own bug on `main` before this fix). */
  function expectMonotonicEase(
    scales: number[],
    start: number,
    end: number,
    // `false` for the opening test only: `settleEnter` (`@drawerdeck/core`)
    // re-measures once the entrance's own jump lands the Panel at its real
    // position, which can nudge `--drawer-indent-range` by enough to show
    // one small, single-frame blip on open that has nothing to do with
    // the bug this test exists to rule out (a *full*-span jump, at the
    // very end of a close, with no easing factor transitioning it at
    // all). The close side, where the bug actually was, shows no such
    // blip, so it keeps the strict check.
    checkMaxStep = true
  ) {
    expect(scales.length).toBeGreaterThan(4);
    const direction = Math.sign(end - start);
    for (let i = 1; i < scales.length; i++) {
      const delta = (scales[i] - scales[i - 1]) * direction;
      expect(delta).toBeGreaterThanOrEqual(-0.03);
    }
    const span = Math.abs(end - start);
    expect(Math.abs(scales[0] - start)).toBeLessThan(span * 0.5);
    expect(Math.abs(scales[scales.length - 1] - end)).toBeLessThan(span * 0.5);
    if (!checkMaxStep) return;
    const steps = scales.length - 1;
    const fairShare = span / steps;
    const maxStep = Math.max(
      ...scales.slice(1).map((s, i) => Math.abs(s - scales[i]))
    );
    expect(maxStep).toBeLessThan(fairShare * 6 + 0.01);
  }

  it('opening with a trigger eases the page in, with no separate starting-style rule', async () => {
    installRecipe();
    const Harness = () => {
      const pageRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <Page pageRef={pageRef} />
          <IndentDrawer id="a" indent={pageRef} />
        </>
      );
    };
    render(<Harness />);
    const page = screen.getByTestId('page');

    const { scales, stop } = sampleScalePerFrame(page);
    await userEvent.click(screen.getByTestId('open-a'));
    await expectSettledTo(
      () => popupOf('a').getAttribute('data-phase'),
      'open'
    );
    stop();

    expectMonotonicEase(scales, 1, 0.95, false);
  });

  it.each([
    [
      'the close button',
      async () => {
        await userEvent.click(screen.getByTestId('close-a'));
      }
    ],
    [
      'Escape',
      async () => {
        await userEvent.keyboard('{Escape}');
      }
    ],
    [
      'an outside press',
      async () => {
        await commands.tapAt('[data-testid="popup-a"]', 20, 20);
      }
    ]
  ] as const)(
    'closing with %s eases the page back out, not a jump at the very end',
    async (_label, close) => {
      installRecipe();
      const Harness = () => {
        const pageRef = useRef<HTMLDivElement>(null);
        return (
          <>
            <Page pageRef={pageRef} />
            <IndentDrawer id="a" indent={pageRef} snapPoints={[0.5]} />
          </>
        );
      };
      render(<Harness />);
      const page = screen.getByTestId('page');

      await userEvent.click(screen.getByTestId('open-a'));
      await expectSettledTo(
        () => popupOf('a').getAttribute('data-phase'),
        'open'
      );
      // Settles the entrance's own transition out before sampling the
      // exit: this test is about the close alone.
      await sleep(400);

      const { scales, stop } = sampleScalePerFrame(page);
      await close();
      await expectSettledTo(
        () => popupOf('a').getAttribute('data-phase'),
        'closed'
      );
      stop();

      expectMonotonicEase(scales, 0.95, 1);
    }
  );
});

describe("transform-origin is the viewport's own center relative to the target's own box, whatever the target's own position (#274 review)", () => {
  it.each([
    [
      'the target flush at the document origin, page scrolled 1000px',
      0,
      1000,
      false
    ],
    ['the target 800px down the page, scrolled 1000px', 800, 1000, false],
    ['the target 800px down the page, not scrolled', 800, 0, false],
    ['a centered 320px card (the demo shape)', 200, 0, true]
  ] as const)(
    '%s: a marker at the viewport center shifts under 1px, closed vs. open',
    async (_label, topOffset, scrollY, centered) => {
      mockReducedMotion();
      document.body.style.margin = '0';
      const Harness = () => {
        const pageRef = useRef<HTMLDivElement>(null);
        return (
          <>
            <div style={{ height: topOffset }} />
            <div
              data-testid="page"
              ref={pageRef}
              style={{
                position: 'relative',
                height: 4000,
                width: centered ? 320 : '100%',
                margin: centered ? '0 auto' : 0,
                background: 'tomato'
              }}
            />
            <Drawer.Root indent={pageRef}>
              {/* Pinned, not wherever normal flow would put it after a
                  4000px-tall page: a real click on an off-screen trigger
                  scrolls it into view first, moving `window.scrollY` out
                  from under this test's own measurement for a reason that
                  has nothing to do with the indent itself. */}
              <Drawer.Trigger
                data-testid="open-a"
                style={{ position: 'fixed', top: 0, left: 0 }}
              >
                Open a
              </Drawer.Trigger>
              <Drawer.Popup data-testid="popup-a">
                <Drawer.Viewport>
                  <Drawer.Panel data-testid="panel-a">
                    <Drawer.Content>
                      <p>Content.</p>
                    </Drawer.Content>
                    <Drawer.Close data-testid="close-a">Close a</Drawer.Close>
                  </Drawer.Panel>
                </Drawer.Viewport>
              </Drawer.Popup>
            </Drawer.Root>
          </>
        );
      };
      render(<Harness />);

      const page = screen.getByTestId('page');
      const restore = withIndentRecipe(page);
      const marker = document.createElement('div');
      try {
        window.scrollTo(0, scrollY);
        await nextFrame();
        const pr = page.getBoundingClientRect();
        // The marker sits at the real, current viewport's own center, in
        // this page element's own local coordinates: a uniform `scale()`
        // around the correct origin leaves it the one point that does not
        // move at all.
        marker.style.position = 'absolute';
        marker.style.width = '2px';
        marker.style.height = '2px';
        marker.style.left = `${innerWidth / 2 - pr.left - 1}px`;
        marker.style.top = `${innerHeight / 2 - pr.top - 1}px`;
        page.append(marker);

        const before = marker.getBoundingClientRect();
        await openDrawer('a');
        await nextFrame();
        await nextFrame();
        const after = marker.getBoundingClientRect();

        expect(Math.abs(after.left - before.left)).toBeLessThan(1);
        expect(Math.abs(after.top - before.top)).toBeLessThan(1);
      } finally {
        marker.remove();
        restore();
      }
    }
  );
});

/** Stands in for the on-screen keyboard, the same shape `packages/core/
 * test/keyboard.test.ts` uses: a plain `EventTarget` with settable
 * `height`/`offsetTop`/`scale`, installed as `window.visualViewport`
 * before the drawer mounts, so the engine's own permanent resize listener
 * attaches to it too, then driven by dispatching a real `resize` event by
 * hand (the one real interface fires). */
class FakeVisualViewport extends EventTarget {
  height = window.innerHeight;
  offsetTop = 0;
  scale = 1;
  width = window.innerWidth;
  offsetLeft = 0;
}

describe('the indent reaches exactly its fully-open value once the keyboard expands the drawer (#327, #274 review)', () => {
  it('scales to 0.95 at the largest snap point, not short of it', async () => {
    mockReducedMotion();
    const realVisualViewport = window.visualViewport;
    const fake = new FakeVisualViewport();
    Object.defineProperty(window, 'visualViewport', {
      value: fake,
      configurable: true
    });
    try {
      const Harness = () => {
        const pageRef = useRef<HTMLDivElement>(null);
        return (
          <>
            <Page pageRef={pageRef} />
            <IndentDrawer
              id="a"
              indent={pageRef}
              snapPoints={[0.5, 1]}
              content={
                <>
                  {/* Unstyled, like the demo's own panel when a consumer
                      gives it no explicit height: the Panel's own natural
                      extent grows with Content's, including the
                      `padding-bottom` the keyboard inset adds -- the exact
                      shape that left the engine's own cached
                      `--drawer-indent-range` stale on `main` before this
                      fix, scoped to a `maxScroll` smaller than the one
                      actually in effect once the inset changed the
                      layout under it. */}
                  {Array.from({ length: 60 }, (_, i) => (
                    <p key={i} style={{ margin: 0, height: 24 }}>
                      Row {i}
                    </p>
                  ))}
                  <input data-testid="field-a" />
                </>
              }
            />
          </>
        );
      };
      render(<Harness />);

      const page = screen.getByTestId('page');
      const restore = withIndentRecipe(page);
      try {
        await openDrawer('a');
        await nextFrame();
        await nextFrame();

        // Focused directly, not a real click: the field sits below
        // Content's own locked fold at this snap point, so a real,
        // trusted click's own auto-scroll-into-view (Playwright's) never
        // settles on an element Content itself refuses to scroll to yet
        // -- the same reason `@drawerdeck/core`'s own keyboard tests
        // (`packages/core/test/keyboard.test.ts`) focus a field directly
        // too. `preventScroll` keeps this deterministic across browsers.
        const field = screen.getByTestId('field-a');
        field.focus({ preventScroll: true });
        expect(document.activeElement).toBe(field);

        fake.height = window.innerHeight - 300;
        fake.dispatchEvent(new Event('resize'));
        await sleep(200);
        await nextFrame();
        await nextFrame();

        expect(popupOf('a').getAttribute('data-phase')).toBe('open');
        const progress = Number.parseFloat(
          getComputedStyle(page).getPropertyValue('--drawer-indent-progress')
        );
        expect(progress).toBeCloseTo(1, 2);
        expect(readScale(page)).toBeCloseTo(0.95, 2);
      } finally {
        restore();
      }
    } finally {
      Object.defineProperty(window, 'visualViewport', {
        value: realVisualViewport,
        configurable: true
      });
    }
  });
});

describe('#249 still holds with indent configured: no JS while a real wheel scroll drags it', () => {
  it('counts zero setProperty/setAttribute/requestAnimationFrame calls during a real wheel scroll', async () => {
    mockReducedMotion();
    const Harness = () => {
      const pageRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <Page pageRef={pageRef} />
          <IndentDrawer
            id="a"
            indent={pageRef}
            snapPoints={[0.5, 1]}
            content={
              <>
                {Array.from({ length: 80 }, (_, i) => (
                  <p key={i} style={{ margin: 0, height: 24 }}>
                    Row {i}
                  </p>
                ))}
              </>
            }
          />
        </>
      );
    };
    render(<Harness />);

    const page = screen.getByTestId('page');
    const restore = withIndentRecipe(page);
    try {
      await openDrawer('a');
      await nextFrame();

      const setPropertySpy = vi.spyOn(
        CSSStyleDeclaration.prototype,
        'setProperty'
      );
      const setAttributeSpy = vi.spyOn(Element.prototype, 'setAttribute');
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

      await commands.wheelAt('[data-testid="panel-a"]', 20, 20, 0, 60);
      await sleep(100);

      expect(setPropertySpy).not.toHaveBeenCalled();
      expect(setAttributeSpy).not.toHaveBeenCalled();
      expect(rafSpy).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});
