// An opt-in background indent (#274): a `Drawer.Root` prop, `indent`,
// taking a ref (or an element) to the consumer's own page wrapper, which
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
 * three-axis form a non-uniform one would. */
const readScale = (el: HTMLElement) =>
  Number.parseFloat(getComputedStyle(el).scale);

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
      expect(page.getAttribute('data-drawer-indent')).toBe('');

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
      expect(page.getAttribute('data-drawer-indent')).toBe('');

      await userEvent.click(screen.getByTestId('close-inner'));
      await expectSettledTo(
        () => screen.getByTestId('popup-inner').getAttribute('data-phase'),
        'closed'
      );
      await nextFrame();
      await nextFrame();
      expect(readScale(page)).toBeCloseTo(outerOnlyScale, 5);
      expect(page.getAttribute('data-drawer-indent')).toBe('');
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
    'closing by %s clears data-drawer-indent and --drawer-indent-progress, and restores the inline styles and timeline-scope this engine itself changed',
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
      expect(
        document.documentElement.style.getPropertyValue('timeline-scope')
      ).not.toBe('');

      await close();
      await expectSettledTo(
        () => popupOf('a').getAttribute('data-phase'),
        'closed'
      );
      await sleep(50);

      expect(page.hasAttribute('data-drawer-indent')).toBe(false);
      expect(page.style.getPropertyValue('--drawer-indent-progress')).toBe('');
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
    expect(page.style.getPropertyValue('transform-origin')).toBe('');
    expect(page.style.getPropertyValue('animation')).toBe('');
    expect(document.documentElement.getAttribute('style') ?? '').toBe(
      htmlBefore
    );
  });
});

describe('two non-nested drawers with indent, on separate targets, do not break each other', () => {
  it('opening and closing one leaves the other alone', async () => {
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

      await openDrawer('b');
      await nextFrame();
      await nextFrame();
      expect(pageA.hasAttribute('data-drawer-indent')).toBe(true);
      expect(pageB.hasAttribute('data-drawer-indent')).toBe(true);
      expect(readScale(pageA)).toBeCloseTo(0.95, 2);
      expect(readScale(pageB)).toBeCloseTo(0.95, 2);

      await userEvent.click(screen.getByTestId('close-a'));
      await expectSettledTo(
        () => popupOf('a').getAttribute('data-phase'),
        'closed'
      );
      await nextFrame();
      await nextFrame();
      expect(pageA.hasAttribute('data-drawer-indent')).toBe(false);
      expect(readScale(pageA)).toBe(1);
      // B's own binding, and its scale, are untouched by A's own close.
      expect(pageB.hasAttribute('data-drawer-indent')).toBe(true);
      expect(readScale(pageB)).toBeCloseTo(0.95, 2);

      await userEvent.click(screen.getByTestId('close-b'));
      await expectSettledTo(
        () => popupOf('b').getAttribute('data-phase'),
        'closed'
      );
      await nextFrame();
      expect(pageB.hasAttribute('data-drawer-indent')).toBe(false);
      // `documentElement`'s own shared `timeline-scope` is back to
      // whatever it was before either drawer ever touched it (empty:
      // neither test here gave it an inline value of its own).
      expect(
        document.documentElement.style.getPropertyValue('timeline-scope')
      ).toBe('');
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
    expect(page.style.getPropertyValue('--drawer-indent-progress')).toBe(
      '1.0000'
    );

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
