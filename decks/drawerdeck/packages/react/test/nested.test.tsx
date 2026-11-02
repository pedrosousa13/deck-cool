// Nested drawers (#272): a drawer opened from inside an open drawer stacks
// above it, the drawer behind exposes its state for CSS
// (`data-nested-open`, `--drawer-nested`), Escape closes only the topmost,
// closing an outer drawer with an inner one still open closes the inner
// one first, and focus returns to the button (inside the outer) that
// opened the inner one once it closes. Every open, close and keypress here
// is real input (`userEvent`, or the `dragPointerDown`/`dragPointerMoveTo`/
// `dragPointerUp` commands for the one drag test): `@drawerdeck/core`'s
// own `nestedCount` guard (in `onCancel`/`onDocumentKeyDown`/`onGapClick`)
// and the browser's own top layer are both things only real input, not a
// hand-dispatched event, actually exercises.
import { type ComponentProps, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { act, render, screen } from '@testing-library/react';
import { commands, page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Drawer from '@drawerdeck/react';
import {
  expectSettledTo,
  mockReducedMotion,
  nextFrame,
  sleep,
  viewportOf
} from './fixtures';

const popupAt = (n: number) =>
  document.querySelector<HTMLDialogElement>(`[data-testid="popup-${n}"]`)!;
const panelAt = (n: number) =>
  document.querySelector<HTMLElement>(`[data-testid="panel-${n}"]`)!;

/** A stand-in for `window.visualViewport`, the same shape
 * `packages/core/test/keyboard.test.ts` uses: a plain `EventTarget` with
 * settable `height`/`offsetTop`/`scale`, installed in place of the real one
 * so a test can fire its own 'resize'/'scroll' without a real on-screen
 * keyboard. */
class FakeVisualViewport extends EventTarget {
  height: number;
  offsetTop = 0;
  scale = 1;
  constructor(height: number) {
    super();
    this.height = height;
  }
  resize() {
    this.dispatchEvent(new Event('resize'));
  }
  scroll() {
    this.dispatchEvent(new Event('scroll'));
  }
}

/** The *computed* `--drawer-nested`, never the inline style alone: with no
 * portal, a nested level's own dialog is a real DOM descendant of the one
 * behind it, so a custom property an ancestor's dialog sets on itself
 * cascades down through inheritance to one that never set its own copy at
 * all. `popupAt(n).style.getPropertyValue(...)` only ever reads what this
 * element's own inline style holds, which would read empty for an inherited
 * value exactly the same as for a genuinely absent one. It cannot tell
 * "this drawer has nothing nested above it" from "this drawer inherited its
 * parent's own, stale count", which is exactly the shape of the regression
 * this engine must not have (#272: the topmost drawer in a three-level
 * stack inheriting a middle drawer's `--drawer-nested: 1` through the DOM
 * once the actual topmost one closed). */
const nestedVar = (popup: HTMLDialogElement) =>
  getComputedStyle(popup).getPropertyValue('--drawer-nested').trim();

/** The same real-transition recipe `drawer.test.tsx` uses for its own
 * interrupted-exit tests, local here too: a `<style>` scoped to a unique
 * marker attribute that gives `el` an actual CSS transition tied to
 * `data-starting-style`/`data-ending-style`, so a test can sample a real
 * mid-flight transform instead of an instant, `prefers-reduced-motion`
 * jump. Removed again once the test is done with it. */
function withTransformTransition(
  el: HTMLElement,
  durationMs: number
): () => void {
  const marker = `data-test-${Math.random().toString(36).slice(2)}`;
  el.setAttribute(marker, '');
  const style = document.createElement('style');
  style.textContent = `
    [${marker}] { transform: translateY(0); transition: transform ${durationMs}ms linear; }
    [${marker}][data-starting-style], [${marker}][data-ending-style] { transform: translateY(100%); }
  `;
  document.head.append(style);
  return () => {
    style.remove();
    el.removeAttribute(marker);
  };
}

/** One level of an N-deep nested stack: `Drawer.Trigger` for level `n + 1`
 * sits inside level `n`'s own `Drawer.Content`, the same place a consumer's
 * demo puts it (the "Nested drawers" guide), so it is only reachable once
 * level `n` is actually open -- never a portal for the trigger itself.
 * `portalAt`, if given, renders *that* level's own `Drawer.Popup` through
 * `createPortal(…, document.body)` instead of as a plain child of its own
 * `Drawer.Root` (so it ends up a sibling of every other level's dialog in
 * the real DOM, not a descendant of level `n - 1`'s Panel): what #272 asks
 * to check holds either way (the native top layer, and this package's own
 * context-based nesting, neither of which reads the DOM to find the
 * relationship). `onEvent` fires `(level, open, reason)` for every level's
 * own `onOpenChange`, in addition to the given `onOpenChange` on `rootProps`
 * (used for level 1 alone, by the cascade tests, below). */
function Level({
  n,
  depth,
  portalAt,
  onEvent,
  ...rootProps
}: {
  n: number;
  depth: number;
  portalAt?: number;
  onEvent?: (
    level: number,
    open: boolean,
    reason: Drawer.OpenChangeReason
  ) => void;
} & ComponentProps<typeof Drawer.Root>) {
  const { onOpenChange, modal, ...rest } = rootProps;
  const popup = (
    <Drawer.Popup data-testid={`popup-${n}`}>
      <Drawer.Viewport>
        <Drawer.Panel data-testid={`panel-${n}`}>
          <Drawer.Handle data-testid={`handle-${n}`} />
          <Drawer.Title>Level {n}</Drawer.Title>
          <Drawer.Content>
            {/* Short on purpose: the Close button, and the next level's own
                Trigger, both need to stay inside the one snap point a real
                `userEvent.click` can actually reach (the "Open from a side"
                guide's own `panelWidth="100%"` note in `sides.test.tsx`
                makes the same tradeoff). */}
            <p>Level {n} content.</p>
            {n < depth && (
              <Level
                n={n + 1}
                depth={depth}
                portalAt={portalAt}
                modal={modal}
                onEvent={onEvent}
              />
            )}
          </Drawer.Content>
          <Drawer.Close data-testid={`close-${n}`}>Close {n}</Drawer.Close>
        </Drawer.Panel>
      </Drawer.Viewport>
    </Drawer.Popup>
  );
  return (
    <Drawer.Root
      {...rest}
      modal={modal}
      onOpenChange={(open, info) => {
        onOpenChange?.(open, info);
        onEvent?.(n, open, info.reason);
      }}
    >
      <Drawer.Trigger data-testid={`open-${n}`}>Open {n}</Drawer.Trigger>
      {portalAt === n ? createPortal(popup, document.body) : popup}
    </Drawer.Root>
  );
}

async function openLevel(n: number) {
  await userEvent.click(screen.getByTestId(`open-${n}`));
  await expectSettledTo(() => popupAt(n).getAttribute('data-phase'), 'open');
}

type OnEvent = (
  level: number,
  open: boolean,
  reason: Drawer.OpenChangeReason
) => void;

/** Two levels with independent `modal` values, unlike `Level` above (which
 * always passes its own `modal` straight down to the next level): the one
 * shape `Level` cannot build, needed for a non-modal outer with a modal
 * inner (#237's own edge case for `onDocumentKeyDown`'s `nestedCount`
 * guard: a modal inner's own `cancel` event never reaches it, yet the key
 * press still bubbles to `document`), and for a non-modal drawer nested
 * inside another at all (the dev-warning tests, below). */
function MixedModalityLevels({
  outerModal,
  innerModal,
  onEvent
}: {
  outerModal: boolean;
  innerModal: boolean;
  onEvent: OnEvent;
}) {
  return (
    <Drawer.Root
      modal={outerModal}
      onOpenChange={(open, info) => onEvent(1, open, info.reason)}
    >
      <Drawer.Trigger data-testid="open-1">Open 1</Drawer.Trigger>
      <Drawer.Popup data-testid="popup-1">
        <Drawer.Viewport>
          <Drawer.Panel data-testid="panel-1">
            <Drawer.Handle data-testid="handle-1" />
            <Drawer.Title>Level 1</Drawer.Title>
            <Drawer.Content>
              <Drawer.Root
                modal={innerModal}
                onOpenChange={(open, info) => onEvent(2, open, info.reason)}
              >
                <Drawer.Trigger data-testid="open-2">Open 2</Drawer.Trigger>
                <Drawer.Popup data-testid="popup-2">
                  <Drawer.Viewport>
                    <Drawer.Panel data-testid="panel-2">
                      <Drawer.Handle data-testid="handle-2" />
                      <Drawer.Title>Level 2</Drawer.Title>
                      <Drawer.Content>
                        <p>Level 2 content.</p>
                      </Drawer.Content>
                      <Drawer.Close data-testid="close-2">Close 2</Drawer.Close>
                    </Drawer.Panel>
                  </Drawer.Viewport>
                </Drawer.Popup>
              </Drawer.Root>
            </Drawer.Content>
            <Drawer.Close data-testid="close-1">Close 1</Drawer.Close>
          </Drawer.Panel>
        </Drawer.Viewport>
      </Drawer.Popup>
    </Drawer.Root>
  );
}

/** Three levels deep, every one given an inline `snapPoints={[1]}` literal:
 * a fresh array reference each render, the shape that makes
 * `setOptions`'s own `layoutRelevant` check (`@drawerdeck/core`) misread any
 * re-render -- even one nothing about the snap points actually asked for,
 * such as a sibling's own `nestedCount` changing -- as a real snap-point
 * change, and so re-measure and reposition markers that should have been
 * left alone (#332). Only the outermost level is controlled, the same
 * shape the existing cascade test above uses. */
function ThreeLevelsInlineSnap({
  open,
  onOpenChange,
  onEvent
}: {
  open: boolean;
  onOpenChange(next: boolean): void;
  onEvent: OnEvent;
}) {
  return (
    <Drawer.Root
      open={open}
      snapPoints={[1]}
      onOpenChange={(next, info) => {
        onOpenChange(next);
        onEvent(1, next, info.reason);
      }}
    >
      <Drawer.Trigger data-testid="open-1">Open 1</Drawer.Trigger>
      <Drawer.Popup data-testid="popup-1">
        <Drawer.Viewport>
          <Drawer.Panel data-testid="panel-1">
            <Drawer.Handle data-testid="handle-1" />
            <Drawer.Title>Level 1</Drawer.Title>
            <Drawer.Content>
              <p>Level 1 content.</p>
              <Drawer.Root
                snapPoints={[1]}
                onOpenChange={(next, info) => onEvent(2, next, info.reason)}
              >
                <Drawer.Trigger data-testid="open-2">Open 2</Drawer.Trigger>
                <Drawer.Popup data-testid="popup-2">
                  <Drawer.Viewport>
                    <Drawer.Panel data-testid="panel-2">
                      <Drawer.Handle data-testid="handle-2" />
                      <Drawer.Title>Level 2</Drawer.Title>
                      <Drawer.Content>
                        <p>Level 2 content.</p>
                        <Drawer.Root
                          snapPoints={[1]}
                          onOpenChange={(next, info) =>
                            onEvent(3, next, info.reason)
                          }
                        >
                          <Drawer.Trigger data-testid="open-3">
                            Open 3
                          </Drawer.Trigger>
                          <Drawer.Popup data-testid="popup-3">
                            <Drawer.Viewport>
                              <Drawer.Panel data-testid="panel-3">
                                <Drawer.Handle data-testid="handle-3" />
                                <Drawer.Title>Level 3</Drawer.Title>
                                <Drawer.Content>
                                  <p>Level 3 content.</p>
                                </Drawer.Content>
                                <Drawer.Close data-testid="close-3">
                                  Close 3
                                </Drawer.Close>
                              </Drawer.Panel>
                            </Drawer.Viewport>
                          </Drawer.Popup>
                        </Drawer.Root>
                      </Drawer.Content>
                      <Drawer.Close data-testid="close-2">Close 2</Drawer.Close>
                    </Drawer.Panel>
                  </Drawer.Viewport>
                </Drawer.Popup>
              </Drawer.Root>
            </Drawer.Content>
            <Drawer.Close data-testid="close-1">Close 1</Drawer.Close>
          </Drawer.Panel>
        </Drawer.Viewport>
      </Drawer.Popup>
    </Drawer.Root>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('two levels deep', () => {
  it('a second level stacks above an open first: both report open, the first is not nested yet', async () => {
    mockReducedMotion();
    render(<Level n={1} depth={2} />);

    await openLevel(1);
    expect(popupAt(1).hasAttribute('data-nested-open')).toBe(false);

    await openLevel(2);

    expect(popupAt(1).getAttribute('data-phase')).toBe('open');
    expect(popupAt(2).getAttribute('data-phase')).toBe('open');
  });

  it('the drawer behind gets data-nested-open on its Popup and Panel, and --drawer-nested="1", only while the inner is open', async () => {
    mockReducedMotion();
    render(<Level n={1} depth={2} />);
    await openLevel(1);
    const popup1 = popupAt(1);
    const panel1 = panelAt(1);

    await openLevel(2);

    expect(popup1.getAttribute('data-nested-open')).toBe('');
    expect(panel1.getAttribute('data-nested-open')).toBe('');
    expect(nestedVar(popup1)).toBe('1');
    // The inner itself has nothing nested above it: its own count is a
    // real, written "0", not merely absent (a DOM descendant of popup1
    // would otherwise inherit popup1's own "1" straight through the
    // cascade).
    expect(popupAt(2).hasAttribute('data-nested-open')).toBe(false);
    expect(nestedVar(popupAt(2))).toBe('0');

    await userEvent.click(screen.getByTestId('close-2'));
    await expectSettledTo(
      () => popupAt(2).getAttribute('data-phase'),
      'closed'
    );

    expect(popup1.hasAttribute('data-nested-open')).toBe(false);
    expect(panel1.hasAttribute('data-nested-open')).toBe(false);
    expect(nestedVar(popup1)).toBe('0');
    expect(popup1.getAttribute('data-phase')).toBe('open');
  });

  it('Escape closes only the topmost (the inner), leaving the outer open, reporting reason "escape"', async () => {
    mockReducedMotion();
    const events: string[] = [];
    render(
      <Level
        n={1}
        depth={2}
        onEvent={(level, open, reason) =>
          events.push(`${level}:${open}:${reason}`)
        }
      />
    );
    await openLevel(1);
    await openLevel(2);
    events.length = 0;

    await userEvent.keyboard('{Escape}');

    await expectSettledTo(
      () => popupAt(2).getAttribute('data-phase'),
      'closed'
    );
    expect(popupAt(1).getAttribute('data-phase')).toBe('open');
    expect(events).toEqual(['2:false:escape']);
  });

  it('closing the inner returns focus to the button that opened it, inside the outer', async () => {
    mockReducedMotion();
    render(<Level n={1} depth={2} />);
    await openLevel(1);
    const opener2 = screen.getByTestId('open-2');
    await userEvent.click(opener2);
    await expectSettledTo(() => popupAt(2).getAttribute('data-phase'), 'open');

    await userEvent.keyboard('{Escape}');

    await expectSettledTo(
      () => popupAt(2).getAttribute('data-phase'),
      'closed'
    );
    expect(document.activeElement).toBe(opener2);
  });

  it('the outer dialog is inert while the inner is open modally, and interactive again once the inner closes', async () => {
    mockReducedMotion();
    render(<Level n={1} depth={2} />);
    await openLevel(1);
    await openLevel(2);
    const close1 = screen.getByTestId('close-1');

    close1.focus();
    expect(document.activeElement).not.toBe(close1);

    await userEvent.click(screen.getByTestId('close-2'));
    await expectSettledTo(
      () => popupAt(2).getAttribute('data-phase'),
      'closed'
    );

    close1.focus();
    expect(document.activeElement).toBe(close1);
  });

  it('a real drag closes only the drawer dragged, leaving the one behind open', async () => {
    mockReducedMotion();
    render(<Level n={1} depth={2} />);
    await openLevel(1);
    await openLevel(2);

    const start = await commands.dragPointerDown(
      '[data-testid="handle-2"]',
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
      () => popupAt(2).getAttribute('data-phase'),
      'closed'
    );
    expect(popupAt(1).getAttribute('data-phase')).toBe('open');
  });

  it('a nested dialog rendered through a React portal (not a DOM descendant of the outer Panel) still stacks above it, inertly, and is still tracked as nested', async () => {
    mockReducedMotion();
    render(<Level n={1} depth={2} portalAt={2} />);
    await openLevel(1);
    await openLevel(2);

    // Really not a descendant: `createPortal` put it on `document.body`.
    expect(panelAt(1).contains(popupAt(2))).toBe(false);

    expect(popupAt(1).getAttribute('data-nested-open')).toBe('');
    expect(popupAt(1).style.getPropertyValue('--drawer-nested')).toBe('1');

    const close1 = screen.getByTestId('close-1');
    close1.focus();
    expect(document.activeElement).not.toBe(close1);

    await userEvent.keyboard('{Escape}');
    await expectSettledTo(
      () => popupAt(2).getAttribute('data-phase'),
      'closed'
    );
    expect(popupAt(1).getAttribute('data-phase')).toBe('open');
    close1.focus();
    expect(document.activeElement).toBe(close1);
  });
});

describe('three levels deep', () => {
  it('opens all three, counts every level stacked above each one, and Escape closes them one at a time, topmost first, each reporting reason "escape"', async () => {
    mockReducedMotion();
    const events: string[] = [];
    render(
      <Level
        n={1}
        depth={3}
        onEvent={(level, open, reason) =>
          events.push(`${level}:${open}:${reason}`)
        }
      />
    );
    await openLevel(1);
    await openLevel(2);
    await openLevel(3);
    events.length = 0;

    expect(nestedVar(popupAt(1))).toBe('2');
    expect(nestedVar(popupAt(2))).toBe('1');
    expect(popupAt(3).hasAttribute('data-nested-open')).toBe(false);
    // The actual topmost drawer's own count is a real "0", never the "1"
    // its own DOM ancestor (level 2, genuinely nested under by level 3)
    // would otherwise leak to it through inheritance (#272).
    expect(nestedVar(popupAt(3))).toBe('0');

    await userEvent.keyboard('{Escape}');
    await expectSettledTo(
      () => popupAt(3).getAttribute('data-phase'),
      'closed'
    );
    expect(popupAt(1).getAttribute('data-phase')).toBe('open');
    expect(popupAt(2).getAttribute('data-phase')).toBe('open');
    expect(nestedVar(popupAt(2))).toBe('0');
    expect(nestedVar(popupAt(1))).toBe('1');

    await userEvent.keyboard('{Escape}');
    await expectSettledTo(
      () => popupAt(2).getAttribute('data-phase'),
      'closed'
    );
    expect(popupAt(1).getAttribute('data-phase')).toBe('open');
    expect(nestedVar(popupAt(1))).toBe('0');

    await userEvent.keyboard('{Escape}');
    await expectSettledTo(
      () => popupAt(1).getAttribute('data-phase'),
      'closed'
    );
    expect(events).toEqual([
      '3:false:escape',
      '2:false:escape',
      '1:false:escape'
    ]);
  });

  it('a real drag closes only the dragged level, leaving the other two open', async () => {
    mockReducedMotion();
    render(<Level n={1} depth={3} />);
    await openLevel(1);
    await openLevel(2);
    await openLevel(3);

    const start = await commands.dragPointerDown(
      '[data-testid="handle-3"]',
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
      () => popupAt(3).getAttribute('data-phase'),
      'closed'
    );
    expect(popupAt(1).getAttribute('data-phase')).toBe('open');
    expect(popupAt(2).getAttribute('data-phase')).toBe('open');
  });

  it('closing each level in turn returns focus to its own opener, one level up each time', async () => {
    mockReducedMotion();
    render(<Level n={1} depth={3} />);
    await openLevel(1);
    const opener2 = screen.getByTestId('open-2');
    await userEvent.click(opener2);
    await expectSettledTo(() => popupAt(2).getAttribute('data-phase'), 'open');
    const opener3 = screen.getByTestId('open-3');
    await userEvent.click(opener3);
    await expectSettledTo(() => popupAt(3).getAttribute('data-phase'), 'open');

    await userEvent.keyboard('{Escape}');
    await expectSettledTo(
      () => popupAt(3).getAttribute('data-phase'),
      'closed'
    );
    expect(document.activeElement).toBe(opener3);

    await userEvent.keyboard('{Escape}');
    await expectSettledTo(
      () => popupAt(2).getAttribute('data-phase'),
      'closed'
    );
    expect(document.activeElement).toBe(opener2);
  });
});

describe('closing an outer drawer while an inner one is open', () => {
  it('closes the inner one first, then the outer, each reporting its own reason, and the outer becomes interactive again', async () => {
    mockReducedMotion();
    const events: string[] = [];
    // Closing the outer drawer *while it is open and covered by the inner
    // one* is never reachable through a real press: a modal outer is
    // genuinely inert underneath a modal inner (this file's own "inert"
    // test, above), so nothing a real `userEvent` gesture can reach would
    // ever ask it to close right then. The one real way this happens is
    // the controlled-component contract itself -- something outside the
    // drawer tree (a router, a parent list) sets `open` false -- which
    // existing tests for a controlled drawer already simulate the same
    // way: calling the state setter directly, not through a synthetic
    // click on a button standing in for "the rest of the app."
    let setOuterOpen: ((open: boolean) => void) | undefined;
    function Harness() {
      const [outerOpen, setOpen1] = useState(false);
      // `setOpen1` is a `useState` setter: stable for the component's
      // whole lifetime, so capturing it once, outside the test's own
      // `render()` call, needs no dependency on it.
      useLayoutEffect(() => {
        setOuterOpen = setOpen1;
      }, []);
      return (
        <Level
          n={1}
          depth={2}
          open={outerOpen}
          onOpenChange={(next) => setOpen1(next)}
          onEvent={(level, open, reason) =>
            events.push(`${level}:${open}:${reason}`)
          }
        />
      );
    }
    render(<Harness />);
    await openLevel(1);
    await openLevel(2);
    events.length = 0;

    act(() => setOuterOpen?.(false));

    await expectSettledTo(
      () => popupAt(1).getAttribute('data-phase'),
      'closed'
    );
    expect(popupAt(2).getAttribute('data-phase')).toBe('closed');
    // The inner reports its own close, with its own reason, before the
    // outer even starts closing: it is uncontrolled, so Root's own
    // `onOpenChange` gate (`openRef.current === undefined`) always lets
    // it through. The outer never fires a second one for the very same
    // close: it is controlled, already at the `open: false` this close is
    // settling into (the test just set it, above `events.length = 0`),
    // and Root's own gate -- "the engine only ever reports a close it
    // decided itself, never one the controlling prop already asked for"
    // (the existing controlled-drawer tests in `drawer.test.tsx` rely on
    // the very same rule) -- correctly stays quiet about it.
    expect(events).toEqual(['2:false:programmatic']);

    // Interactive again: a real click now reaches it (not inert, not
    // covered by a dialog still in the top layer).
    await userEvent.click(screen.getByTestId('open-1'));
    await expectSettledTo(() => popupAt(1).getAttribute('data-phase'), 'open');
  });

  it('a 3-level controlled cascade, with real CSS transitions, closes 3, then 2, then 1, sequentially, never together', async () => {
    mockReducedMotion();
    let setOuterOpen: ((open: boolean) => void) | undefined;
    function Harness() {
      const [outerOpen, setOpen1] = useState(false);
      useLayoutEffect(() => {
        setOuterOpen = setOpen1;
      }, []);
      return (
        <Level
          n={1}
          depth={3}
          open={outerOpen}
          onOpenChange={(next) => setOpen1(next)}
        />
      );
    }
    render(<Harness />);
    await openLevel(1);
    await openLevel(2);
    await openLevel(3);

    // Attached only now, right before the close: a real transition on
    // every level's own Panel, long enough to sample a genuinely
    // mid-flight state, short enough to keep the test fast.
    const removeTransitions = [
      withTransformTransition(panelAt(1), 120),
      withTransformTransition(panelAt(2), 120),
      withTransformTransition(panelAt(3), 120)
    ];
    try {
      act(() => setOuterOpen?.(false));

      // Level 3's own close starts first, and alone: `closeAndWait`
      // cascades inward before calling this Root's own `drawer.close()`
      // (`react/src/index.tsx`), so level 1 and level 2 stay fully
      // open, their own transitions never started, until level 3's real
      // transition actually finishes.
      await expect
        .poll(() => popupAt(3).getAttribute('data-phase'))
        .toBe('closing');
      expect(popupAt(2).getAttribute('data-phase')).toBe('open');
      expect(popupAt(1).getAttribute('data-phase')).toBe('open');

      await expect
        .poll(() => popupAt(3).getAttribute('data-phase'), { timeout: 4000 })
        .toBe('closed');
      // Only once level 3 is actually closed does level 2's own close
      // begin; level 1 still has not.
      await expect
        .poll(() => popupAt(2).getAttribute('data-phase'))
        .toBe('closing');
      expect(popupAt(1).getAttribute('data-phase')).toBe('open');

      await expect
        .poll(() => popupAt(2).getAttribute('data-phase'), { timeout: 4000 })
        .toBe('closed');
      await expect
        .poll(() => popupAt(1).getAttribute('data-phase'))
        .toBe('closing');

      await expect
        .poll(() => popupAt(1).getAttribute('data-phase'), { timeout: 4000 })
        .toBe('closed');

      // Focus lands all the way back on the button that started the
      // whole stack, and nothing is left marked as nested.
      expect(document.activeElement).toBe(screen.getByTestId('open-1'));
      expect(popupAt(1).hasAttribute('data-nested-open')).toBe(false);
      expect(nestedVar(popupAt(1))).toBe('0');
    } finally {
      removeTransitions.forEach((remove) => remove());
    }
  });

  it('a controlled outer reopened mid-cascade ends open, never reporting its own close', async () => {
    mockReducedMotion();
    const events: string[] = [];
    let setOuterOpen: ((open: boolean) => void) | undefined;
    function Harness() {
      const [outerOpen, setOpen1] = useState(false);
      useLayoutEffect(() => {
        setOuterOpen = setOpen1;
      }, []);
      return (
        <Level
          n={1}
          depth={2}
          open={outerOpen}
          onOpenChange={(next) => setOpen1(next)}
          onEvent={(level, open, reason) =>
            events.push(`${level}:${open}:${reason}`)
          }
        />
      );
    }
    render(<Harness />);
    await openLevel(1);
    await openLevel(2);
    events.length = 0;

    // A real transition on the inner Panel alone, long enough that level
    // 1's own `closeAndWait` is still awaiting it 80ms later, when the
    // controlling `open` goes back to true.
    const removeTransition = withTransformTransition(panelAt(2), 160);
    try {
      act(() => setOuterOpen?.(false));
      await sleep(80);
      act(() => setOuterOpen?.(true));

      await expectSettledTo(
        () => popupAt(2).getAttribute('data-phase'),
        'closed'
      );
      // The outer never closes: reopened mid-cascade, `closeAndWait` bails
      // out before ever calling `drawer.close()` on it, so it never
      // reports a close either.
      expect(popupAt(1).getAttribute('data-phase')).toBe('open');
      expect(events).toEqual(['2:false:programmatic']);
    } finally {
      removeTransition();
    }
  });
});

describe('Escape yields to a modal inner even where nestedCount is all it has (#272)', () => {
  it('a non-modal outer with a modal inner, both open: Escape closes only the inner, both reporting their own reason', async () => {
    mockReducedMotion();
    const events: string[] = [];
    render(
      <MixedModalityLevels
        outerModal={false}
        innerModal={true}
        onEvent={(level, open, reason) =>
          events.push(`${level}:${open}:${reason}`)
        }
      />
    );
    await openLevel(1);
    await openLevel(2);
    events.length = 0;

    await userEvent.keyboard('{Escape}');

    await expectSettledTo(
      () => popupAt(2).getAttribute('data-phase'),
      'closed'
    );
    expect(popupAt(1).getAttribute('data-phase')).toBe('open');
    // Not ['1:false:escape', '2:false:drag']: the modal inner's own
    // `cancel` event never reaches the outer's own `document` listener at
    // all, but the key press itself still bubbles there regardless, so if
    // that listener did not check `nestedCount` it would act on the same
    // press itself, closing both and misreporting the inner's own reason
    // as 'drag' (the outer's close cascading into it).
    expect(events).toEqual(['2:false:escape']);
  });
});

describe('nesting a non-modal drawer (#237)', () => {
  it('warns once, in development, the first time it opens nested inside another, but still opens', async () => {
    mockReducedMotion();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <MixedModalityLevels
        outerModal={true}
        innerModal={false}
        onEvent={() => {}}
      />
    );

    await openLevel(1);
    expect(warn).not.toHaveBeenCalled();

    await openLevel(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/non-modal/);

    // Closing and reopening the same inner drawer does not warn again:
    // once per instance, not once per open.
    await userEvent.click(screen.getByTestId('close-2'));
    await expectSettledTo(
      () => popupAt(2).getAttribute('data-phase'),
      'closed'
    );
    await openLevel(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('never warns for a modal inner, nested or not', async () => {
    mockReducedMotion();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Level n={1} depth={2} />);

    await openLevel(1);
    await openLevel(2);

    expect(warn).not.toHaveBeenCalled();
  });
});

// With no portal, a nested level's own Viewport is a real DOM descendant of
// the outer Panel, so an unscoped `querySelectorAll('[data-drawer-snap]')`
// (or `querySelector('[data-drawer-gap]')`) run against the outer's own
// Viewport also returns the inner's own markers and gap. Whenever the outer
// re-measures -- a window resize, a parent re-render that hands it a fresh
// inline `snapPoints` array (a new reference every time, which
// `setOptions`'s own `layoutRelevant` check cannot tell from a real change),
// or its own entrance settling (`settleEnter`) -- that moves the inner's
// markers to the outer's own offsets, and the inner Viewport's mandatory
// scroll-snap settles at closed underneath it, misreporting a close nobody
// asked for as reason 'drag' (#332).
describe('an outer re-measure must never touch an inner drawer’s own markers (#332)', () => {
  it('a window resize that re-measures the outer leaves an open inner alone, with no spurious close', async () => {
    mockReducedMotion();
    const events: string[] = [];
    render(
      <Level
        n={1}
        depth={2}
        onEvent={(level, open, reason) =>
          events.push(`${level}:${open}:${reason}`)
        }
      />
    );
    await openLevel(1);
    await openLevel(2);
    events.length = 0;

    const width = window.innerWidth;
    const height = window.innerHeight;
    try {
      // A real resize (`page.viewport`), the same one a URL bar hiding, a
      // rotation or the iOS keyboard sends: this fires both a `window` and
      // a `visualViewport` 'resize', each of which calls `onResize` on
      // every mounted drawer, the outer included.
      await page.viewport(width, height - 84);
      await sleep(300);

      expect(popupAt(2).getAttribute('data-phase')).toBe('open');
      expect(popupAt(1).getAttribute('data-phase')).toBe('open');
      expect(events).toEqual([]);
    } finally {
      await page.viewport(width, height);
      await sleep(100);
    }
  });

  it('a parent re-render that hands the outer a fresh inline snapPoints array leaves an open inner alone, with no spurious close', async () => {
    mockReducedMotion();
    const events: string[] = [];
    let rerender: (() => void) | undefined;
    function Harness() {
      const [, setTick] = useState(0);
      useLayoutEffect(() => {
        rerender = () => setTick((t) => t + 1);
      }, []);
      return (
        <Level
          n={1}
          depth={2}
          snapPoints={[1]}
          onEvent={(level, open, reason) =>
            events.push(`${level}:${open}:${reason}`)
          }
        />
      );
    }
    render(<Harness />);
    await openLevel(1);
    await openLevel(2);
    events.length = 0;

    // Nothing about either drawer's own props actually changes here: this
    // is a sibling re-render reaching the outer `Drawer.Root` only because
    // `snapPoints={[1]}` is a fresh array literal every time, never a
    // memoized one.
    act(() => rerender?.());
    await sleep(300);

    expect(popupAt(2).getAttribute('data-phase')).toBe('open');
    expect(popupAt(1).getAttribute('data-phase')).toBe('open');
    expect(events).toEqual([]);
  });

  it('opening the inner before the outer’s own entrance settles leaves the inner open, with no spurious close once the outer does settle', async () => {
    mockReducedMotion();
    const events: string[] = [];
    render(
      <Level
        n={1}
        depth={2}
        onEvent={(level, open, reason) =>
          events.push(`${level}:${open}:${reason}`)
        }
      />
    );

    // Real clicks, back to back, with no settle awaited in between: the
    // outer's own dialog is already modally shown (`showModal()` runs
    // synchronously inside `open()`, before its own CSS entrance even
    // starts), so the inner's own trigger is already reachable while the
    // outer is still mid-entrance -- exactly the window `settleEnter`'s own
    // re-measure can land in.
    await userEvent.click(screen.getByTestId('open-1'));
    await userEvent.click(screen.getByTestId('open-2'));

    await expectSettledTo(() => popupAt(2).getAttribute('data-phase'), 'open');
    await expectSettledTo(() => popupAt(1).getAttribute('data-phase'), 'open');
    events.length = 0;
    await sleep(300);

    expect(popupAt(2).getAttribute('data-phase')).toBe('open');
    expect(popupAt(1).getAttribute('data-phase')).toBe('open');
    expect(events).toEqual([]);
  });
});

describe('a 3-level controlled cascade with inline snapPoints at every level (#332)', () => {
  it('closes inner-first, each reporting its own close, never "drag"', async () => {
    mockReducedMotion();
    const events: string[] = [];
    let setOuterOpen: ((open: boolean) => void) | undefined;
    function Harness() {
      const [outerOpen, setOpen1] = useState(false);
      useLayoutEffect(() => {
        setOuterOpen = setOpen1;
      }, []);
      return (
        <ThreeLevelsInlineSnap
          open={outerOpen}
          onOpenChange={setOpen1}
          onEvent={(level, open, reason) =>
            events.push(`${level}:${open}:${reason}`)
          }
        />
      );
    }
    render(<Harness />);
    await openLevel(1);
    await openLevel(2);
    await openLevel(3);
    events.length = 0;

    act(() => setOuterOpen?.(false));

    await expectSettledTo(
      () => popupAt(1).getAttribute('data-phase'),
      'closed'
    );
    expect(popupAt(2).getAttribute('data-phase')).toBe('closed');
    expect(popupAt(3).getAttribute('data-phase')).toBe('closed');
    // Inner-first, both 'programmatic', never 'drag': the outer itself
    // reports nothing here (the existing 2-level version of this test, in
    // "closing an outer drawer while an inner one is open", above, is the
    // same way) -- it is controlled, already at the `open: false` this
    // close is settling into by the time its own engine reports it, and
    // `Root`'s own gate correctly stays quiet about a close the controlling
    // prop already asked for.
    expect(events).toEqual(['3:false:programmatic', '2:false:programmatic']);
  });
});

// With no portal, a nested drawer's own focused field is a real DOM
// descendant of the outer Panel too, so `@drawerdeck/core`'s own
// `focusedKeyboardField` -- `panel.contains(active)` alone -- could not
// tell the inner's own field apart from one that actually belongs to the
// outer. The outer's own keyboard listeners (`maybeExpandForKeyboard`,
// `ensureFieldVisible`) then acted on it: focusing the inner's own field
// expanded and scrolled the *outer*, inert behind it, moving its snap
// point and its Viewport's own scroll position with nobody touching it
// (#332).
describe('a nested drawer’s own keyboard never moves the outer behind it (#332)', () => {
  function OuterWithModalInner({
    onOuterSnapChange
  }: {
    onOuterSnapChange: (index: number) => void;
  }) {
    return (
      <Drawer.Root snapPoints={[0.5, 1]} onSnapPointChange={onOuterSnapChange}>
        <Drawer.Trigger data-testid="open-1">Open 1</Drawer.Trigger>
        <Drawer.Popup data-testid="popup-1">
          <Drawer.Viewport>
            <Drawer.Panel data-testid="panel-1">
              <Drawer.Title>Level 1</Drawer.Title>
              <Drawer.Content>
                {/* The next level's own Trigger comes first, so a real
                    `userEvent.click` can still reach it at the outer's
                    own snap index 0 (0.5): the filler after it, not
                    before, is what makes the outer's own 1.0 snap point
                    actually reachable (`measure`'s own fractions are of
                    the Viewport's extent, which the Panel has to be at
                    least as tall as to reach), without pushing the
                    trigger itself out of the one snap point a real click
                    can reach (`Level`'s own comment, above, makes the
                    same tradeoff). */}
                <Drawer.Root snapPoints={[1]}>
                  <Drawer.Trigger data-testid="open-2">Open 2</Drawer.Trigger>
                  <Drawer.Popup data-testid="popup-2">
                    <Drawer.Viewport>
                      {/* `height: '100%'` on the Panel and Content, the
                          same shape `packages/core/test/keyboard.test.ts`'s
                          own fixture uses: without it, an unbounded
                          Content just grows to fit all 60 rows, so there
                          is nothing for it to scroll *within*, and the
                          field at its own end sits past the one Viewport's
                          worth `snapPoints={[1]}` actually reveals. Bounded
                          to the Viewport's own extent instead, Content
                          itself scrolls to bring the field in, the same
                          way a real drawer's own CSS would size it. */}
                      <Drawer.Panel
                        data-testid="panel-2"
                        style={{ height: '100%' }}
                      >
                        <Drawer.Title>Level 2</Drawer.Title>
                        <Drawer.Content style={{ height: '100%' }}>
                          {Array.from({ length: 60 }, (_, i) => (
                            <div key={i} style={{ height: 40 }}>
                              Inner row {i}
                            </div>
                          ))}
                          <input data-testid="inner-field" />
                        </Drawer.Content>
                        <Drawer.Close data-testid="close-2">
                          Close 2
                        </Drawer.Close>
                      </Drawer.Panel>
                    </Drawer.Viewport>
                  </Drawer.Popup>
                </Drawer.Root>
                {Array.from({ length: 50 }, (_, i) => (
                  <div key={i} style={{ height: 40 }}>
                    Outer row {i}
                  </div>
                ))}
              </Drawer.Content>
              <Drawer.Close data-testid="close-1">Close 1</Drawer.Close>
            </Drawer.Panel>
          </Drawer.Viewport>
        </Drawer.Popup>
      </Drawer.Root>
    );
  }

  it("focusing the inner's own field never expands or scrolls the outer, inert behind it", async () => {
    mockReducedMotion();
    const onOuterSnapChange = vi.fn();
    const realVisualViewport = window.visualViewport;
    const vv = new FakeVisualViewport(window.innerHeight);
    Object.defineProperty(window, 'visualViewport', {
      value: vv,
      configurable: true
    });
    try {
      render(<OuterWithModalInner onOuterSnapChange={onOuterSnapChange} />);
      await openLevel(1);
      await openLevel(2);
      const outerViewport = viewportOf(popupAt(1));
      expect(popupAt(1).getAttribute('data-snap-index')).toBe('0');
      const scrollBefore = outerViewport.scrollTop;

      // Focused directly, not through a real click: at Content's own
      // natural end, past the 60 rows before it, there is no real click
      // target left on screen at this scroll position to reach it with
      // (`packages/core/test/keyboard.test.ts`'s own "expanding to the
      // largest snap point" tests make the same tradeoff, for the same
      // reason). `document.activeElement` is all `focusedKeyboardField`
      // reads either way.
      const field = screen.getByTestId('inner-field');
      field.focus({ preventScroll: true });
      expect(document.activeElement).toBe(field);

      // The real device's own numbers from the review: a pan to `vvH` 331,
      // `offsetTop` 336.
      vv.height = 331;
      vv.offsetTop = 336;
      vv.resize();
      vv.scroll();
      await nextFrame();

      expect(onOuterSnapChange).not.toHaveBeenCalled();
      expect(popupAt(1).getAttribute('data-snap-index')).toBe('0');
      expect(outerViewport.scrollTop).toBe(scrollBefore);
    } finally {
      Object.defineProperty(window, 'visualViewport', {
        value: realVisualViewport,
        configurable: true
      });
    }
  });
});

// With no portal, a nested drawer's own Viewport is a real DOM descendant
// of the outer Panel too, so a touch, a wheel or a pointer down starting on
// the inner one still bubbles into the outer's own interrupt listeners
// (`attachInterruptListeners`, `@drawerdeck/core`), which finish the Panel's
// CSS entrance or exit immediately, same as a real touch on the outer's own
// Viewport does (#268) -- except here nobody touched the outer at all
// (#332).
describe('an outer CSS entrance is never interrupted by activity inside a nested drawer (#332)', () => {
  it("a real touchstart on the inner's own Viewport never finishes the outer's own entrance early", async () => {
    mockReducedMotion();
    let setInnerOpen: ((open: boolean) => void) | undefined;
    function Harness() {
      const [innerOpen, setOpen2] = useState(false);
      useLayoutEffect(() => {
        setInnerOpen = setOpen2;
      }, []);
      return (
        <Drawer.Root>
          <Drawer.Trigger data-testid="open-1">Open 1</Drawer.Trigger>
          <Drawer.Popup data-testid="popup-1">
            <Drawer.Viewport>
              <Drawer.Panel data-testid="panel-1">
                <Drawer.Title>Level 1</Drawer.Title>
                <Drawer.Content>
                  {/* Controlled, with no Trigger of its own: opened
                      through `setInnerOpen` directly, below, never
                      through a real click -- a real click anywhere
                      inside the outer's own Panel (its trigger to open
                      the inner included) legitimately interrupts the
                      outer's own entrance on its own (#268), which would
                      hide the bug this test is actually about: a touch
                      that starts *inside the inner, once it is open*
                      bubbling into the outer's own listener. */}
                  <Drawer.Root
                    open={innerOpen}
                    onOpenChange={(next) => setOpen2(next)}
                  >
                    <Drawer.Popup data-testid="popup-2">
                      <Drawer.Viewport>
                        <Drawer.Panel data-testid="panel-2">
                          <Drawer.Title>Level 2</Drawer.Title>
                          <Drawer.Content>
                            <p>Level 2 content.</p>
                          </Drawer.Content>
                        </Drawer.Panel>
                      </Drawer.Viewport>
                    </Drawer.Popup>
                  </Drawer.Root>
                </Drawer.Content>
                <Drawer.Close data-testid="close-1">Close 1</Drawer.Close>
              </Drawer.Panel>
            </Drawer.Viewport>
          </Drawer.Popup>
        </Drawer.Root>
      );
    }
    render(<Harness />);
    // Installed before opening: the outer's own entrance needs a real
    // transition to stay interruptible for long enough to open the inner
    // and dispatch the touch below inside that same window.
    const removeTransition = withTransformTransition(panelAt(1), 300);
    try {
      await userEvent.click(screen.getByTestId('open-1'));
      // Synchronous, inside `open()` itself: no race to poll for.
      expect(popupAt(1).getAttribute('data-phase')).toBe('opening');

      act(() => setInnerOpen?.(true));
      await expect
        .poll(() => popupAt(2).getAttribute('data-phase'))
        .toBe('open');
      expect(popupAt(1).getAttribute('data-phase')).toBe('opening');

      // A real touch starting on the inner's own Viewport -- nothing the
      // outer itself was ever touched by. Wrapped in `act`, not a bare
      // `dispatchEvent`: the engine's own phase flips synchronously, but
      // without `act` the `data-phase` attribute below would still be
      // reading whatever React's own last, batched render left it at,
      // proving nothing either way.
      act(() => {
        viewportOf(popupAt(2)).dispatchEvent(
          new Event('touchstart', { bubbles: true })
        );
      });

      // Left unscoped, the outer's own interrupt listener would have read
      // that as a touch on its own Viewport and finished its entrance
      // immediately.
      expect(popupAt(1).getAttribute('data-phase')).toBe('opening');

      await expectSettledTo(
        () => popupAt(1).getAttribute('data-phase'),
        'open'
      );
    } finally {
      removeTransition();
    }
  });
});
