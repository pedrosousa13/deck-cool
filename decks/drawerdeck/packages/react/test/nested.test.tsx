// Nested drawers (#272): a drawer opened from inside an open drawer stacks
// above it, the drawer behind exposes its state for CSS
// (`data-nested-open`, `--drawer-nested`), Escape closes only the topmost,
// closing an outer drawer with an inner one still open closes the inner
// one first, and focus returns to the button (inside the outer) that
// opened the inner one once it closes. Every open, close and keypress here
// is real input (`userEvent`, or the `dragPointerDown`/`dragPointerMoveTo`/
// `dragPointerUp` commands for the drag tests): `@drawerdeck/core`'s own
// `nestedCount` guard is `onDocumentKeyDown`'s alone now (non-modal only:
// a modal inner's own `cancel` never reaches it); for a modal inner, the
// browser's own top layer and inertness do the rest, and the browser's own
// top layer is a thing only real input, not a hand-dispatched event,
// actually exercises.
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

/** The "Nested drawers" guide's own scale recipe, local here the same way
 * `withTransformTransition` is (#332's own follow-up to #272): blends
 * continuously toward the discrete, count-based scale-back as
 * `--drawer-nested-progress` rises from 0 to 1, instead of jumping
 * straight to it, so a real drag's own effect on `el`'s computed `scale`
 * is observable frame by frame, and a CSS transition carries the
 * discrete jump (a Close tap, Escape, or the cascade) the same `-nested`
 * demo's own 300ms recipe does. The `transition` sits on `--nested-scale`
 * itself, a registered custom property that depends only on the plain,
 * never-animated `--drawer-nested`, not on `scale`: `scale`, read
 * straight off a `calc()` over an animated `--drawer-nested-progress`
 * (the native `animation` `updateNestedProgress`, `@drawerdeck/core`,
 * attaches wherever a scroll timeline is supported), never starts a
 * `transition` of its own, so testing the guide's old recipe here (one
 * that transitioned `scale` directly) would carry the exact one-frame
 * jump this round's own fix (the demo CSS,
 * `sites/drawerdeck/styles/drawerdeck.css`) replaces. `scale` just reads
 * `--nested-scale`'s already-eased value back through the same `calc()`
 * it always used. Removed again once the test is done with it. */
function withNestedScaleRecipe(
  el: HTMLElement,
  durationMs: number
): () => void {
  const marker = `data-test-${Math.random().toString(36).slice(2)}`;
  el.setAttribute(marker, '');
  const style = document.createElement('style');
  style.textContent = `
    @property --nested-scale {
      syntax: '<number>';
      inherits: false;
      initial-value: 1;
    }
    [${marker}] {
      --nested-scale: calc(1 - 0.05 * var(--drawer-nested, 0));
      scale: calc(
        1 - (1 - var(--nested-scale)) * var(--drawer-nested-progress, 0)
      );
      transition: --nested-scale ${durationMs}ms linear;
    }
  `;
  document.head.append(style);
  return () => {
    style.remove();
    el.removeAttribute(marker);
  };
}

/** The computed `scale` CSS property, as a plain number: `el`'s own
 * recipe (`withNestedScaleRecipe`, above) sets a single, uniform value,
 * which both Chromium and WebKit serialize as one token through
 * `getComputedStyle`, never the two- or three-axis form a non-uniform
 * `scale` would. */
const readScale = (el: HTMLElement) =>
  Number.parseFloat(getComputedStyle(el).scale);

/** Waits until a just-attached scroll-driven `animation` (`updateNestedProgress`,
 * `@drawerdeck/core`) has actually caught up with the live scroll position
 * it is reading, rather than a fixed `sleep`: both engines need at least one
 * frame after the `animation`/`animation-timeline`/`animation-range` are
 * first set, but WebKit, in this harness, needs a variable few hundred
 * milliseconds more, worse right after another test's own drawers just
 * tore theirs down. Polls `scale` itself, not a fixed sleep long enough for
 * the slowest run: once it reads below 1, the catch-up is done (level 2 is
 * already open and at rest, so nothing here is still genuinely animating a
 * drag -- the one other reason `scale` would read below 1). */
async function waitForNestedScale(el: HTMLElement, timeoutMs = 3000) {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (readScale(el) < 0.999) return;
    await sleep(50);
  }
}

/** Samples `read()` on every animation frame for about `ms`, each with
 * its own elapsed time since the first sample: what the acceptance
 * criteria for #332's own follow-up to #272 ask for directly ("sample the
 * outer Panel's computed scale every animation frame"), rather than a
 * handful of hand-picked `sleep`s that could straddle the one frame a
 * transition actually starts or ends on. */
async function sampleFrames<T>(
  ms: number,
  read: () => T
): Promise<{ t: number; v: T }[]> {
  const samples: { t: number; v: T }[] = [];
  return new Promise((resolve) => {
    const start = performance.now();
    function tick() {
      const t = performance.now() - start;
      samples.push({ t, v: read() });
      if (t < ms) requestAnimationFrame(tick);
      else resolve(samples);
    }
    requestAnimationFrame(tick);
  });
}

/** Every `MutationObserver` record for `attr` on `el`, collected from the
 * moment this is called until `stop()` is: the "no churn" acceptance
 * criterion for #332's own follow-up to #272 ("the nesting attributes and
 * variables are never removed and re-added within one update"). A
 * `MutationObserver` queues one record per actual attribute mutation,
 * never coalescing a remove immediately followed by a re-add into a
 * single net no-op: two records for `attr` where the fix expects zero (or
 * one, for a genuine, single transition) is exactly the regression this
 * is for. */
function watchAttr(
  el: Element,
  attr: string
): { records: MutationRecord[]; stop: () => void } {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName === attr) records.push(m);
    }
  });
  observer.observe(el, {
    attributes: true,
    attributeFilter: [attr],
    attributeOldValue: true
  });
  return {
    records,
    stop: () => {
      // Drains whatever is still queued (not yet delivered to the
      // callback) before disconnecting, so a mutation from the very last
      // synchronous step before `stop()` is not silently dropped.
      records.push(
        ...observer.takeRecords().filter((m) => m.attributeName === attr)
      );
      observer.disconnect();
    }
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
    // The Panel's own inline style, not merely what it inherits from its
    // own Popup through the cascade: a consumer's own CSS recipe (the
    // "Nested drawers" guide's `scale: calc(1 - 0.05 * var(--drawer-nested,
    // 0))`) reads this on the Panel itself, the same element
    // `data-nested-open` is already written on directly, just above, for
    // exactly this reason: neither should depend on inheritance across
    // the Popup's own `<dialog>` actually resolving on a given engine.
    expect(panel1.style.getPropertyValue('--drawer-nested')).toBe('1');
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
    expect(panel1.style.getPropertyValue('--drawer-nested')).toBe('0');
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

  /** One real drag, start to release, on the handle `handleTestId` names:
   * closes whichever drawer that handle belongs to. Used below both as one
   * of the inner's own close paths (on `handle-2`) and, after every close
   * path, to prove the outer (`handle-1`) still responds to a fresh drag
   * right away. */
  async function realDragDown(handleTestId: string) {
    const start = await commands.dragPointerDown(
      `[data-testid="${handleTestId}"]`,
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
  }

  it.each([
    [
      'the close button',
      async () => {
        await userEvent.click(screen.getByTestId('close-2'));
      }
    ],
    [
      'Escape',
      async () => {
        await userEvent.keyboard('{Escape}');
      }
    ],
    ['a real drag', async () => realDragDown('handle-2')]
  ] as const)(
    "closing the inner by %s clears the outer's own data-nested-open and --drawer-nested within one frame, and a fresh real drag of the outer still closes it",
    async (_label, closeInner) => {
      mockReducedMotion();
      render(<Level n={1} depth={2} />);
      await openLevel(1);
      await openLevel(2);
      const panel1 = panelAt(1);
      const popup1 = popupAt(1);

      await closeInner();
      await expectSettledTo(
        () => popupAt(2).getAttribute('data-phase'),
        'closed'
      );
      await nextFrame();

      expect(popup1.getAttribute('data-phase')).toBe('open');
      expect(panel1.hasAttribute('data-nested-open')).toBe(false);
      expect(panel1.style.getPropertyValue('--drawer-nested')).toBe('0');

      // No extra gesture needed: the very next real drag works, closing
      // the outer, with no stale state left over from the inner's own
      // close.
      await realDragDown('handle-1');
      await expectSettledTo(() => popup1.getAttribute('data-phase'), 'closed');
    }
  );

  it('a nested dialog rendered through a React portal (not a DOM descendant of the outer Panel) still stacks above it, inertly, and is still tracked as nested', async () => {
    mockReducedMotion();
    render(<Level n={1} depth={2} portalAt={2} />);
    await openLevel(1);
    await openLevel(2);

    // Really not a descendant: `createPortal` put it on `document.body`.
    expect(panelAt(1).contains(popupAt(2))).toBe(false);

    expect(popupAt(1).getAttribute('data-nested-open')).toBe('');
    expect(popupAt(1).style.getPropertyValue('--drawer-nested')).toBe('1');

    // #332's own follow-up to #272: `timeline-scope` only reaches a
    // genuine DOM descendant, so a child rendered through a portal never
    // gets a resolved timeline to animate `--drawer-nested-progress`
    // from, and the Panel would otherwise read its registered
    // `initial-value`, 0, leaving it at its full, unscaled size instead
    // of the fully nested one. The engine checks for exactly that right
    // after setting the source up, synchronously (`updateNestedProgress`,
    // `@drawerdeck/core`): the nested-progress `CSSAnimation` is on the
    // Panel, but its own `timeline` reads `null`, so it writes a literal
    // `1` directly where nothing else ever did: fails on the previous
    // head, reading `0` and a scale of `1` instead of `0.95`.
    await nextFrame();
    await nextFrame();
    expect(panelAt(1).style.getPropertyValue('--drawer-nested-progress')).toBe(
      '1'
    );
    const restoreScale = withNestedScaleRecipe(panelAt(1), 300);
    expect(readScale(panelAt(1))).toBeCloseTo(0.95, 5);
    restoreScale();

    const close1 = screen.getByTestId('close-1');
    close1.focus();
    expect(document.activeElement).not.toBe(close1);

    await userEvent.keyboard('{Escape}');
    await expectSettledTo(
      () => popupAt(2).getAttribute('data-phase'),
      'closed'
    );
    expect(popupAt(1).getAttribute('data-phase')).toBe('open');
    // Removed, not left at a stale `1`, now that nothing is nested above
    // it any more.
    expect(panelAt(1).style.getPropertyValue('--drawer-nested-progress')).toBe(
      ''
    );
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
    // The same three counts, read as each Panel's own inline style, not
    // merely what it inherits from its own Popup: the "Nested drawers"
    // guide's own scale recipe reads this on the Panel itself.
    expect(panelAt(1).style.getPropertyValue('--drawer-nested')).toBe('2');
    expect(panelAt(2).style.getPropertyValue('--drawer-nested')).toBe('1');
    expect(panelAt(3).style.getPropertyValue('--drawer-nested')).toBe('0');

    await userEvent.keyboard('{Escape}');
    await expectSettledTo(
      () => popupAt(3).getAttribute('data-phase'),
      'closed'
    );
    expect(popupAt(1).getAttribute('data-phase')).toBe('open');
    expect(popupAt(2).getAttribute('data-phase')).toBe('open');
    expect(nestedVar(popupAt(2))).toBe('0');
    expect(nestedVar(popupAt(1))).toBe('1');
    // Closing level 3 updates level 2's own count (nothing left above it)
    // and level 1's own count (one left above it, level 2), not just
    // level 2's own direct Popup.
    expect(panelAt(2).style.getPropertyValue('--drawer-nested')).toBe('0');
    expect(panelAt(1).style.getPropertyValue('--drawer-nested')).toBe('1');

    await userEvent.keyboard('{Escape}');
    await expectSettledTo(
      () => popupAt(2).getAttribute('data-phase'),
      'closed'
    );
    expect(popupAt(1).getAttribute('data-phase')).toBe('open');
    expect(nestedVar(popupAt(1))).toBe('0');
    expect(panelAt(1).style.getPropertyValue('--drawer-nested')).toBe('0');

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

// The review's own repro (#332, fourth round): a mouse press that starts on
// a modal inner drawer while that inner is still in its own CSS entrance or
// exit bubbles into the outer's `onPointerDown` (`@drawerdeck/core`)
// unmarked, since the inner's own handler returns before it ever claims the
// event (its own `phase !== 'open'` check runs first). `ownsTarget` fixes
// this by checking the press's own DOM position instead of a marker, so it
// holds regardless of the inner's phase. No `mockReducedMotion`, matching
// the review's own repro: `open()` itself never animates the scroll
// position either way, and nothing here reaches the one place `reducedMotion`
// does (`throwTo`, after a drag genuinely starts), since the drag this
// test presses for must never start on either drawer.
describe('a mouse press on a modal inner mid-entrance never drags the outer behind it (#332)', () => {
  it('a real mouse drag starting on panel-2 while it is still opening leaves the outer untouched', async () => {
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
    const outerViewport = viewportOf(popupAt(1));
    const outerScrollBefore = outerViewport.scrollTop;
    events.length = 0;

    // Installed before opening level 2: a real, slow entrance to press
    // into mid-flight.
    const removeTransition = withTransformTransition(panelAt(2), 1500);
    try {
      await userEvent.click(screen.getByTestId('open-2'));
      await sleep(700);
      expect(popupAt(2).getAttribute('data-phase')).toBe('opening');

      const start = await commands.dragPointerDown(
        '[data-testid="panel-2"]',
        40,
        10
      );
      let y = start.y;
      for (let i = 0; i < 30; i++) {
        y += 20;
        await commands.dragPointerMoveTo(start.x, y);
        await nextFrame();
      }
      await commands.dragPointerUp();

      // Left unscoped, the outer's own `onPointerDown` would have read the
      // unmarked press as its own drag start: `setPointerCapture`,
      // scrolling its own Viewport toward closed, and closing both
      // drawers, reason 'drag' (the review's own numbers: scrollTop 104 to
      // 0 in Chromium, 89 to 0 in WebKit).
      expect(outerViewport.scrollTop).toBe(outerScrollBefore);
      expect(popupAt(1).getAttribute('data-phase')).toBe('open');
      expect(events).not.toContain('1:false:drag');
      expect(events).not.toContain('2:false:drag');

      // The inner itself never started a drag either (its own
      // `onPointerDown` still correctly declines mid-entrance): the press
      // instead finishes its entrance immediately, the existing #268
      // behavior for any real gesture arriving mid-flight.
      await expectSettledTo(
        () => popupAt(2).getAttribute('data-phase'),
        'open'
      );
    } finally {
      removeTransition();
    }
  });
});

// One function, three event kinds (`attachInterruptListeners`,
// `@drawerdeck/core`): a touch, a wheel or a pointer down starting on a
// modal inner's own Viewport all bubble into the outer's own
// `onInterrupt` the same way, and all three are scoped by the same
// `ownsTarget` check (#332). With no portal, a nested drawer's own
// Viewport is a real DOM descendant of the outer Panel too, so each one
// still bubbles into the outer's own interrupt listeners, which finish the
// Panel's CSS entrance or exit immediately, same as a real touch on the
// outer's own Viewport does (#268), except here nobody touched the outer
// at all. Table-driven over the three, instead of one test per kind,
// since the harness and the assertions are identical for all of them.
// Each gesture is real OS-level input, through Playwright
// (`tapAt`/`wheelAt`/`dragPointerDown`, `../../vitest.config.ts`), not a
// hand-dispatched `new Event(type)`: the latter never goes through the
// browser's own dispatch at all, so it cannot tell a scoped listener from
// an unscoped one either way.
describe("the outer's own interrupt listeners never react to a modal inner's own events (#332)", () => {
  function OuterWithControlledInner({
    innerOpen,
    onInnerOpenChange
  }: {
    innerOpen: boolean;
    onInnerOpenChange(next: boolean): void;
  }) {
    return (
      <Drawer.Root>
        <Drawer.Trigger data-testid="open-1">Open 1</Drawer.Trigger>
        <Drawer.Popup data-testid="popup-1">
          <Drawer.Viewport>
            <Drawer.Panel data-testid="panel-1">
              <Drawer.Title>Level 1</Drawer.Title>
              <Drawer.Content>
                {/* Controlled, with no Trigger of its own: a real click
                    anywhere inside the outer's own Panel would
                    legitimately interrupt its own entrance on its own
                    (#268), hiding the bug this test is about. */}
                <Drawer.Root open={innerOpen} onOpenChange={onInnerOpenChange}>
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

  it.each([
    ['touchstart', () => commands.tapAt('[data-testid="panel-2"]', 30, 20)],
    [
      'wheel',
      // Four ticks, not one, the same real-wheel shape the `#312` tests
      // in `drawer.test.tsx` already use (`userEvent.wheel(..., { times:
      // 4 })`): a single real wheel tick, right after the inner's own
      // `showModal()` just changed the top layer, can land on Chromium's
      // compositor-only fast path for scrolling and never reach the DOM
      // at all, before the browser notices this region needs it.
      async () => {
        for (let i = 0; i < 4; i++) {
          await commands.wheelAt('[data-testid="panel-2"]', 30, 20, 0, 30);
        }
      }
    ],
    [
      'pointerdown',
      async () => {
        await commands.dragPointerDown('[data-testid="panel-2"]', 30, 20);
        await commands.dragPointerUp();
      }
    ]
  ] as const)(
    "a real '%s' starting on a modal inner's own Viewport never finishes the outer's own entrance early",
    async (type, fireGesture) => {
      mockReducedMotion();
      let setInnerOpen: ((open: boolean) => void) | undefined;
      function Harness() {
        const [innerOpen, setOpen2] = useState(false);
        useLayoutEffect(() => {
          setInnerOpen = setOpen2;
        }, []);
        return (
          <OuterWithControlledInner
            innerOpen={innerOpen}
            onInnerOpenChange={setOpen2}
          />
        );
      }
      render(<Harness />);
      // 1500ms, not the 300ms a hand-dispatched event could get away
      // with: a real gesture round-trips through Playwright, and the
      // outer's own entrance has to still be running when it lands.
      const removeTransition = withTransformTransition(panelAt(1), 1500);
      try {
        await userEvent.click(screen.getByTestId('open-1'));
        expect(popupAt(1).getAttribute('data-phase')).toBe('opening');

        act(() => setInnerOpen?.(true));
        await expect
          .poll(() => popupAt(2).getAttribute('data-phase'))
          .toBe('open');
        expect(popupAt(1).getAttribute('data-phase')).toBe('opening');

        await fireGesture();

        // Left unscoped, the outer's own interrupt listener would have
        // read this as an interaction on its own Viewport and finished its
        // entrance immediately.
        expect(popupAt(1).getAttribute('data-phase')).toBe('opening');

        await expectSettledTo(
          () => popupAt(1).getAttribute('data-phase'),
          'open'
        );
      } finally {
        removeTransition();
      }
    }
  );
});

// #332's own follow-up to #272: a maintainer's real-iPhone report on the
// "Nested drawers" guide's demo found the outer staying scaled back after
// the inner closed, playing as two sequential 300ms steps instead of one.
// Root cause: the outer's own `nestedCount` contribution only dropped once
// the inner's phase actually reached 'closed' (`isOpen`, phase !==
// 'closed'), well after its own CSS exit had already finished, rather than
// the moment that exit started. These three describe blocks cover the
// maintainer's own three acceptance criteria: (a) the discrete attributes
// move together with the inner's own exit, not after it; (b) a drag on the
// inner scales the drawer directly behind it continuously, restoring on a
// release that snaps back; (c) neither ever flips an attribute or a
// variable off and back on within one update.
describe("the outer's own scale-back starts together with the inner's own exit, not after it", () => {
  it('a Close tap on the inner starts the outer\'s own scale within 2 frames of data-phase becoming "closing", finishing within one transition duration of the inner itself', async () => {
    mockReducedMotion();
    render(<Level n={1} depth={2} />);
    await openLevel(1);
    await openLevel(2);

    const DURATION = 300;
    const restoreScale = withNestedScaleRecipe(panelAt(1), DURATION);
    const restoreExit = withTransformTransition(panelAt(2), DURATION);
    try {
      // Lets the outer's own scale-back from opening level 2 finish
      // settling first, so the "before" value sampled below is the
      // resting nested scale, not still easing into it.
      await waitForNestedScale(panelAt(1));
      const nestedScale = readScale(panelAt(1));
      expect(nestedScale).toBeLessThan(1);

      await userEvent.click(screen.getByTestId('close-2'));
      // `userEvent.click` resolves only once React has flushed every
      // layout effect the click's own state update triggered
      // (`beginExit` sets `data-phase` to 'closing' synchronously, inside
      // that same click): by now, `contributesNesting` (`Root`'s own
      // module doc) has already flipped, together with it, in the same
      // update.
      expect(popupAt(2).getAttribute('data-phase')).toBe('closing');

      const samples = await sampleFrames(DURATION + 200, () => ({
        scale: readScale(panelAt(1)),
        innerPhase: popupAt(2).getAttribute('data-phase')
      }));

      const movedAt = samples.findIndex(
        (s) => Math.abs(s.v.scale - nestedScale) > 0.005
      );
      expect(movedAt).toBeGreaterThanOrEqual(0);
      expect(movedAt).toBeLessThanOrEqual(2);

      const outerSettled = samples.find((s) => Math.abs(s.v.scale - 1) < 0.01);
      const innerClosed = samples.find((s) => s.v.innerPhase === 'closed');
      expect(outerSettled).toBeDefined();
      expect(innerClosed).toBeDefined();
      // Within one transition duration of each other, plus a small
      // margin for the sampling loop's own frame cadence (a frame can
      // itself take several milliseconds in a headless browser): the
      // same margin `@drawerdeck/core`'s own exit timeout fallback
      // (`TRANSITION_TIMEOUT_MARGIN_MS`) adds to a computed duration.
      expect(
        Math.abs((outerSettled?.t ?? 0) - (innerClosed?.t ?? 0))
      ).toBeLessThanOrEqual(DURATION + 50);

      // `movedAt <= 2` alone, above, also passes a one-frame jump
      // straight from the nested scale to 1, settled well before the
      // inner itself finishes closing: this is what that jump would
      // look like instead, a sample partway through the transition
      // (half `DURATION`) strictly between the two, still easing.
      const midway = samples.find((s) => s.t >= DURATION / 2);
      expect(midway).toBeDefined();
      expect(midway!.v.scale).toBeGreaterThan(nestedScale);
      expect(midway!.v.scale).toBeLessThan(1);
    } finally {
      restoreScale();
      restoreExit();
    }
  });

  it("opening the inner eases the outer's own scale through intermediate values, not a single jump", async () => {
    mockReducedMotion();
    render(<Level n={1} depth={2} />);
    await openLevel(1);

    const DURATION = 300;
    const restoreScale = withNestedScaleRecipe(panelAt(1), DURATION);
    const restoreEnter = withTransformTransition(panelAt(2), DURATION);
    try {
      expect(readScale(panelAt(1))).toBe(1);

      await userEvent.click(screen.getByTestId('open-2'));
      // Same reasoning as the Close tap test, above: `userEvent.click`
      // resolves only once React has flushed the layout effects the
      // click's own `open()` call triggered, so `data-phase` already
      // reads 'opening' by now, and the sampling loop below starts right
      // as the scale-back begins, not partway through it.
      expect(popupAt(2).getAttribute('data-phase')).toBe('opening');

      const samples = await sampleFrames(DURATION + 200, () =>
        readScale(panelAt(1))
      );

      await waitForNestedScale(panelAt(1));
      const nestedScale = readScale(panelAt(1));
      expect(nestedScale).toBeLessThan(1);

      // A one-frame jump straight to the fully-nested scale would settle
      // within the first couple of samples; this instead eases through
      // it, so a sample partway through the transition still reads
      // strictly between 1 (where it started) and the fully-nested
      // scale (where it ends).
      const midway = samples.find((s) => s.t >= DURATION / 2);
      expect(midway).toBeDefined();
      expect(midway!.v).toBeGreaterThan(nestedScale);
      expect(midway!.v).toBeLessThan(1);
    } finally {
      restoreScale();
      restoreEnter();
    }
  });
});

describe('a drag on the inner scales the drawer directly behind it in step', () => {
  it("a real drag toward closed moves the outer's own scale monotonically with it", async () => {
    mockReducedMotion();
    render(<Level n={1} depth={2} />);
    await openLevel(1);
    await openLevel(2);

    const restoreScale = withNestedScaleRecipe(panelAt(1), 300);
    try {
      await waitForNestedScale(panelAt(1));
      const atOpenScale = readScale(panelAt(1));
      expect(atOpenScale).toBeLessThan(1);

      const start = await commands.dragPointerDown(
        '[data-testid="handle-2"]',
        5,
        5
      );
      const scales: number[] = [atOpenScale];
      let y = start.y;
      for (let i = 0; i < 40; i++) {
        y += 20;
        await commands.dragPointerMoveTo(start.x, y);
        await nextFrame();
        scales.push(readScale(panelAt(1)));
      }
      await commands.dragPointerUp();
      await expectSettledTo(
        () => popupAt(2).getAttribute('data-phase'),
        'closed'
      );

      // Monotonic: dragging level 2 toward closed only ever scales level
      // 1 back toward 1 (never scales it further *in*, and never
      // oscillates), ending noticeably closer to 1 than where it started.
      for (let i = 1; i < scales.length; i++) {
        expect(scales[i]).toBeGreaterThanOrEqual(scales[i - 1] - 0.002);
      }
      expect(scales[scales.length - 1]).toBeGreaterThan(atOpenScale + 0.01);
    } finally {
      restoreScale();
    }
  });

  it('a drag released before closing snaps back open, restoring the outer\'s own scale with no special-cased "restore"', async () => {
    mockReducedMotion();
    render(<Level n={1} depth={2} />);
    await openLevel(1);
    await openLevel(2);

    const restoreScale = withNestedScaleRecipe(panelAt(1), 300);
    try {
      await waitForNestedScale(panelAt(1));
      const atOpenScale = readScale(panelAt(1));

      // Down a fraction of the panel's own height (not a fixed pixel
      // count, so this still clears the closed threshold regardless of
      // how tall this particular test run's own viewport makes level
      // 2's panel), then *back up* to very nearly the position the drag
      // started at, before ever releasing: decisively closer to open
      // than closed by the time it lets go, so the release below settles
      // open regardless of how a real drag's own velocity-projected
      // throw (#235) reads a release mid-gesture, which a release
      // straight off a still-partway drag is naturally sensitive to.
      const dragDistance = Math.max(
        10,
        panelAt(2).getBoundingClientRect().height * 0.2
      );
      const start = await commands.dragPointerDown(
        '[data-testid="handle-2"]',
        5,
        5
      );
      let y = start.y;
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        y += dragDistance / steps;
        await commands.dragPointerMoveTo(start.x, y);
        await nextFrame();
      }
      const midDragScale = readScale(panelAt(1));
      expect(midDragScale).toBeGreaterThan(atOpenScale);

      for (let i = 0; i < steps; i++) {
        y -= dragDistance / steps;
        await commands.dragPointerMoveTo(start.x, y);
        await nextFrame();
      }

      await commands.dragPointerUp();
      // Level 2 stays open the whole time: nothing here discretely
      // re-registers `contributesNesting` at all, so there is nothing to
      // special-case. The scale restoring is the continuous progress
      // value alone, easing back natively as the released drag's own
      // throw (#235) settles the scroll position back toward open.
      await expectSettledTo(
        () => popupAt(2).getAttribute('data-phase'),
        'open'
      );
      await sleep(300);
      expect(readScale(panelAt(1))).toBeCloseTo(atOpenScale, 2);
    } finally {
      restoreScale();
    }
  });
});

describe('no churn: the nesting attributes and variables are never removed and re-added within one update', () => {
  it('closing the innermost of three levels never flips data-nested-open on the ones still above it', async () => {
    mockReducedMotion();
    render(<Level n={1} depth={3} />);
    await openLevel(1);
    await openLevel(2);
    await openLevel(3);

    // Level 1 still has level 2 nested above it throughout this close
    // (2 -> 1, never 0): its own `data-nested-open` must never change at
    // all. Level 2 has nothing left nested above it once level 3 closes
    // (1 -> 0): exactly one transition, never two (the "removed, then
    // immediately re-added" shape a stale effect cleanup produced before
    // this round's own fix).
    const watchers = {
      popup1: watchAttr(popupAt(1), 'data-nested-open'),
      panel1: watchAttr(panelAt(1), 'data-nested-open'),
      popup2: watchAttr(popupAt(2), 'data-nested-open'),
      panel2: watchAttr(panelAt(2), 'data-nested-open')
    };

    await userEvent.keyboard('{Escape}');
    await expectSettledTo(
      () => popupAt(3).getAttribute('data-phase'),
      'closed'
    );
    // A real device's own churn landed within a few milliseconds of the
    // close (this round's own write-up); settling a little longer here
    // gives any further, slower churn room to show up too, not only
    // whatever lands inside the first poll.
    await sleep(200);

    for (const w of Object.values(watchers)) w.stop();

    expect(watchers.popup1.records).toHaveLength(0);
    expect(watchers.panel1.records).toHaveLength(0);
    expect(watchers.popup2.records).toHaveLength(1);
    expect(watchers.panel2.records).toHaveLength(1);
  });
});
