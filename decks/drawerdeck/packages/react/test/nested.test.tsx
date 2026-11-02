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
import { commands, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Drawer from '@drawerdeck/react';
import { expectSettledTo, mockReducedMotion, nextFrame } from './fixtures';

const popupAt = (n: number) =>
  document.querySelector<HTMLDialogElement>(`[data-testid="popup-${n}"]`)!;
const panelAt = (n: number) =>
  document.querySelector<HTMLElement>(`[data-testid="panel-${n}"]`)!;

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
 * shape `Level` cannot build, needed for the `escapeHandledFor` guard's own
 * edge case (#272): a modal inner never touches `escapeHandledFor` at
 * all (it yields to the browser's own close-watcher stack, in `onCancel`),
 * so a non-modal outer's `onDocumentKeyDown` needs the `nestedCount` guard
 * to see it, not the shared `WeakSet`. */
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

/** The inner `Drawer.Root` mounts only once "Mount inner" is pressed, after
 * the outer one already opened: its own `document` `keydown` listener
 * (`onDocumentKeyDown`, `@drawerdeck/core`) registers after the outer's,
 * not before it, breaking the child-before-parent mount order
 * `escapeHandledFor`'s own module doc assumes (#272). */
function ConditionalInnerLevel({ onEvent }: { onEvent: OnEvent }) {
  const [showInner, setShowInner] = useState(false);
  return (
    <Drawer.Root
      modal={false}
      onOpenChange={(open, info) => onEvent(1, open, info.reason)}
    >
      <Drawer.Trigger data-testid="open-1">Open 1</Drawer.Trigger>
      <Drawer.Popup data-testid="popup-1">
        <Drawer.Viewport>
          <Drawer.Panel data-testid="panel-1">
            <Drawer.Handle data-testid="handle-1" />
            <Drawer.Title>Level 1</Drawer.Title>
            <Drawer.Content>
              <button
                type="button"
                data-testid="mount-inner"
                onClick={() => setShowInner(true)}
              >
                Mount inner
              </button>
              {showInner && (
                <Drawer.Root
                  modal={false}
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
                        <Drawer.Close data-testid="close-2">
                          Close 2
                        </Drawer.Close>
                      </Drawer.Panel>
                    </Drawer.Viewport>
                  </Drawer.Popup>
                </Drawer.Root>
              )}
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
});

describe('non-modal nesting', () => {
  it('a non-modal drawer nested inside another non-modal one is still tracked, and Escape still closes only the topmost', async () => {
    mockReducedMotion();
    render(<Level n={1} depth={2} modal={false} />);
    await openLevel(1);
    await openLevel(2);

    expect(popupAt(1).getAttribute('data-nested-open')).toBe('');
    expect(popupAt(1).style.getPropertyValue('--drawer-nested')).toBe('1');
    expect(popupAt(1).matches(':modal')).toBe(false);
    expect(popupAt(2).matches(':modal')).toBe(false);

    await userEvent.keyboard('{Escape}');

    await expectSettledTo(
      () => popupAt(2).getAttribute('data-phase'),
      'closed'
    );
    expect(popupAt(1).getAttribute('data-phase')).toBe('open');
  });
});

describe('Escape yields to a nested drawer even when escapeHandledFor cannot see it (#272)', () => {
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
    // `cancel` event never touches `escapeHandledFor`, so a non-modal
    // outer's `onDocumentKeyDown` would otherwise find it unset and act
    // on the same key press itself, closing both and misreporting the
    // inner's own reason as 'drag' (the outer's close cascading into it).
    expect(events).toEqual(['2:false:escape']);
  });

  it('two non-modal levels, the inner Drawer.Root mounted only after the outer opened: Escape still closes only the inner', async () => {
    mockReducedMotion();
    const events: string[] = [];
    render(
      <ConditionalInnerLevel
        onEvent={(level, open, reason) =>
          events.push(`${level}:${open}:${reason}`)
        }
      />
    );
    await openLevel(1);
    await userEvent.click(screen.getByTestId('mount-inner'));
    await openLevel(2);
    events.length = 0;

    await userEvent.keyboard('{Escape}');

    await expectSettledTo(
      () => popupAt(2).getAttribute('data-phase'),
      'closed'
    );
    expect(popupAt(1).getAttribute('data-phase')).toBe('open');
    // Not ['1:false:escape', '2:false:drag']: the inner's own `document`
    // `keydown` listener registers after the outer's (it mounted later),
    // so it is not guaranteed to run first and set `escapeHandledFor`
    // before the outer's own listener checks it.
    expect(events).toEqual(['2:false:escape']);
  });
});
