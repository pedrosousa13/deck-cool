import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Drawer from '@drawerdeck/react';
import {
  contentOf,
  expectSettledTo,
  mockReducedMotion,
  panelOf,
  popupOf,
  sleep,
  TestDrawer,
  viewportOf
} from './fixtures';

afterEach(() => vi.restoreAllMocks());

/** Gives `el` a real CSS transition tied to `data-ending-style`, the way a
 * consumer's own recipe does: a `<style>` scoped to a unique marker
 * attribute, removed again once the test is done with it. */
function withTransition(el: HTMLElement, durationMs: number): () => void {
  const marker = `data-test-${Math.random().toString(36).slice(2)}`;
  el.setAttribute(marker, '');
  const style = document.createElement('style');
  style.textContent = `
    [${marker}] { opacity: 1; transition: opacity ${durationMs}ms linear; }
    [${marker}][data-ending-style] { opacity: 0; }
  `;
  document.head.append(style);
  return () => {
    style.remove();
    el.removeAttribute(marker);
  };
}

/** The same recipe, on `transform`: real motion a test can sample, the way
 * the documented recipe actually ships. */
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

/** The `f` component (vertical translation) of a computed `transform`'s 2D
 * matrix, or 0 for `'none'`. */
function translateY(transform: string): number {
  if (transform === 'none') return 0;
  const match = /matrix\(([^)]+)\)/.exec(transform);
  if (!match) return NaN;
  return match[1].split(',').map(Number)[5];
}

describe('rendering', () => {
  it('renders every part, labelled and described', () => {
    render(<TestDrawer />);

    const popup = popupOf(document.body);
    expect(popup.tagName).toBe('DIALOG');
    const title = screen.getByText('Test drawer');
    const description = screen.getByText('A drawer for testing.');
    expect(popup.getAttribute('aria-labelledby')).toBe(title.id);
    expect(popup.getAttribute('aria-describedby')).toBe(description.id);
    expect(popup.getAttribute('data-phase')).toBe('closed');
    expect(popup.hasAttribute('data-open')).toBe(false);
  });

  it('gives the viewport a gap and a snap marker per snap point, plus one for closed', () => {
    render(<TestDrawer snapPoints={[0.5, 1]} />);

    const viewport = viewportOf(document.body);
    expect(viewport.querySelectorAll('[data-drawer-gap]')).toHaveLength(1);
    expect(viewport.querySelectorAll('[data-drawer-snap]')).toHaveLength(3);
  });

  it('renders the handle as a plain, non-focusable element', () => {
    render(<TestDrawer />);

    const handle = document.querySelector('[data-drawerdeck-handle]')!;
    expect(handle.getAttribute('tabindex')).toBeNull();
    expect(handle.getAttribute('role')).toBeNull();
    expect(handle.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('opening and closing', () => {
  it('opens on the trigger, and reports it', async () => {
    mockReducedMotion();
    const onOpenChange = vi.fn();
    render(<TestDrawer onOpenChange={onOpenChange} />);
    const popup = popupOf(document.body);

    act(() => screen.getByText('Open').click());

    expect(onOpenChange).toHaveBeenCalledWith(true, { reason: 'trigger' });
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');
    expect(popup.open).toBe(true);
  });

  it('closes on the close button, returning focus to the trigger', async () => {
    mockReducedMotion();
    const onOpenChange = vi.fn();
    render(<TestDrawer onOpenChange={onOpenChange} />);
    const trigger = screen.getByText('Open');
    act(() => trigger.click());
    await expectSettledTo(
      () => popupOf(document.body).getAttribute('data-phase'),
      'open'
    );

    act(() => screen.getByText('Close').click());

    await expectSettledTo(
      () => popupOf(document.body).getAttribute('data-phase'),
      'closed'
    );
    expect(onOpenChange).toHaveBeenCalledWith(false, {
      reason: 'close-button'
    });
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape when dismissible, not when it is not', async () => {
    mockReducedMotion();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <TestDrawer dismissible={false} onOpenChange={onOpenChange} />
    );
    act(() => screen.getByText('Open').click());
    const popup = popupOf(document.body);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');

    popup.dispatchEvent(new Event('cancel', { cancelable: true }));
    await sleep(300);
    expect(popup.getAttribute('data-phase')).toBe('open');

    rerender(<TestDrawer onOpenChange={onOpenChange} />);
    popup.dispatchEvent(new Event('cancel', { cancelable: true }));
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'closed');
    expect(onOpenChange).toHaveBeenCalledWith(false, { reason: 'escape' });
  });

  it('waits for the Panel’s own CSS exit before closing, then returns focus to the trigger', async () => {
    mockReducedMotion();
    render(<TestDrawer />);
    const trigger = screen.getByText('Open');
    act(() => trigger.click());
    const popup = popupOf(document.body);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');
    const removeTransition = withTransition(panelOf(document.body), 50);

    act(() => screen.getByText('Close').click());

    // Mid-exit: still open, still focus-trapped, not yet back on the
    // trigger.
    expect(popup.getAttribute('data-phase')).toBe('closing');
    expect(popup.open).toBe(true);
    expect(document.activeElement).not.toBe(trigger);

    await expectSettledTo(
      () => popupOf(document.body).getAttribute('data-phase'),
      'closed'
    );
    expect(popup.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    removeTransition();
  });

  it('closes on an outside press', async () => {
    mockReducedMotion();
    render(<TestDrawer />);
    act(() => screen.getByText('Open').click());
    const popup = popupOf(document.body);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');

    const gap = viewportOf(document.body).querySelector('[data-drawer-gap]')!;
    act(() => gap.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    await expectSettledTo(() => popup.getAttribute('data-phase'), 'closed');
  });
});

describe('interrupted mid-exit, an interruption never cancels a close (#268)', () => {
  it('an uncontrolled drawer closes now with the original reason, not a replayed exit', async () => {
    mockReducedMotion();
    const onOpenChange = vi.fn();
    render(<TestDrawer onOpenChange={onOpenChange} />);
    act(() => screen.getByText('Open').click());
    const popup = popupOf(document.body);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');
    const panel = panelOf(document.body);
    // Long enough that it cannot settle on its own before the interrupt.
    const removeTransition = withTransformTransition(panel, 1000);
    const setAttributeSpy = vi.spyOn(panel, 'setAttribute');

    act(() => screen.getByText('Close').click());
    expect(popup.getAttribute('data-phase')).toBe('closing');
    await sleep(100);
    // Genuinely under way: the sampled transform is mid-flight, not
    // already at either end.
    const midY = translateY(getComputedStyle(panel).transform);
    expect(midY).toBeGreaterThan(0);

    const viewport = viewportOf(document.body);
    act(() =>
      viewport.dispatchEvent(new Event('touchstart', { bubbles: true }))
    );

    await expectSettledTo(() => popup.getAttribute('data-phase'), 'closed');
    expect(popup.open).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false, {
      reason: 'close-button'
    });
    // No replay: `data-ending-style` was written once, by the exit the
    // interrupt finished, never a second time by one it restarted.
    const endingStyleWrites = setAttributeSpy.mock.calls.filter(
      ([name]) => name === 'data-ending-style'
    );
    expect(endingStyleWrites).toHaveLength(1);
    expect(
      onOpenChange.mock.calls.filter(([open]) => open === false)
    ).toHaveLength(1);
    removeTransition();
  });

  it('a controlled drawer closes now instead of looping: Root never re-sends close() for an exit the interrupt already finished', async () => {
    mockReducedMotion();
    const onOpenChange = vi.fn();
    function Controlled({ open }: { open: boolean }) {
      return <TestDrawer open={open} onOpenChange={onOpenChange} />;
    }
    const { rerender } = render(<Controlled open={true} />);
    const popup = popupOf(document.body);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');
    const panel = panelOf(document.body);
    const removeTransition = withTransformTransition(panel, 1000);
    const setAttributeSpy = vi.spyOn(panel, 'setAttribute');

    // The parent itself flips `open` false (the controlled path at
    // `react/src/index.tsx` that calls `drawer.close('programmatic')`),
    // not the Close button.
    rerender(<Controlled open={false} />);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'closing');
    const midY = translateY(getComputedStyle(panel).transform);
    expect(midY).toBeGreaterThan(0);

    const viewport = viewportOf(document.body);
    act(() =>
      viewport.dispatchEvent(new Event('touchstart', { bubbles: true }))
    );

    // Before #268's fix, an interruption here cancelled the exit, putting
    // `state.phase` back to `open`; the controlled-`open` effect (still
    // seeing `open: false`) re-sent `close('programmatic')`, and the Panel
    // replayed its exit from the top -- a second `data-ending-style`
    // write this asserts never happens.
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'closed');
    expect(popup.open).toBe(false);
    const endingStyleWrites = setAttributeSpy.mock.calls.filter(
      ([name]) => name === 'data-ending-style'
    );
    expect(endingStyleWrites).toHaveLength(1);
    removeTransition();
  });
});

describe('escape mid-entrance (#268)', () => {
  it('two Escapes close to each other mid-entrance still let the Trigger reopen it, onOpenChange(false, escape) firing exactly once', async () => {
    mockReducedMotion();
    const onOpenChange = vi.fn();
    render(<TestDrawer onOpenChange={onOpenChange} />);
    const trigger = screen.getByText('Open');
    act(() => trigger.click());
    const popup = popupOf(document.body);
    expect(popup.getAttribute('data-phase')).toBe('opening');

    // Two Escapes landing close enough behind each other, both still
    // mid-entrance: the first used to be silently ignored outside phase
    // 'open' (#268's second bug), leaving the entrance (and, in both
    // Chromium and WebKit, sometimes the dialog itself, natively) with
    // nowhere for a second Escape to go.
    act(() => popup.dispatchEvent(new Event('cancel', { cancelable: true })));
    act(() => popup.dispatchEvent(new Event('cancel', { cancelable: true })));

    await expectSettledTo(() => popup.getAttribute('data-phase'), 'closed');
    expect(popup.open).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false, { reason: 'escape' });
    expect(
      onOpenChange.mock.calls.filter(([open]) => open === false)
    ).toHaveLength(1);

    // The Trigger can reopen it: `dialog.open` was never left false while
    // the engine still thought it was 'open' or 'opening'.
    act(() => trigger.click());
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');
  });
});

describe('the inner content', () => {
  it('is locked below the top snap point', async () => {
    mockReducedMotion();
    render(<TestDrawer snapPoints={[0.5, 1]} />);
    act(() => screen.getByText('Open').click());
    const popup = popupOf(document.body);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');

    const content = contentOf(document.body);
    expect(content.style.overflowY).toBe('hidden');
  });
});

describe('a controlled drawer', () => {
  it('opens and closes with the open prop', async () => {
    mockReducedMotion();
    function Controlled() {
      const [open, setOpen] = useState(false);
      return <TestDrawer open={open} onOpenChange={(next) => setOpen(next)} />;
    }
    render(<Controlled />);
    const popup = popupOf(document.body);
    expect(popup.getAttribute('data-phase')).toBe('closed');

    act(() => screen.getByText('Open').click());
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');

    act(() => screen.getByText('Close').click());
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'closed');
  });

  it('reopens when the parent refuses a close', async () => {
    mockReducedMotion();
    const onOpenChange = vi.fn();
    function Controlled() {
      const [open, setOpen] = useState(true);
      return (
        <TestDrawer
          open={open}
          onOpenChange={(next, info) => {
            onOpenChange(next, info);
            // Refuses the close: keeps the drawer open regardless.
            if (info.reason !== 'close-button') return;
            setOpen(next);
          }}
        />
      );
    }
    render(<Controlled />);
    const popup = popupOf(document.body);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');

    popup.dispatchEvent(new Event('cancel', { cancelable: true }));

    // Reported, but the parent kept `open` true: the drawer reopens.
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');
    expect(onOpenChange).toHaveBeenCalledWith(false, { reason: 'escape' });
  });
});

describe('a render prop', () => {
  it('clones the part onto the given element', () => {
    render(
      <Drawer.Root>
        <Drawer.Trigger render={<a href="#open" />}>Open</Drawer.Trigger>
        <Drawer.Popup>
          <Drawer.Viewport>
            <Drawer.Panel />
          </Drawer.Viewport>
        </Drawer.Popup>
      </Drawer.Root>
    );

    const trigger = screen.getByText('Open');
    expect(trigger.tagName).toBe('A');
    expect(trigger.getAttribute('href')).toBe('#open');
    expect(trigger.getAttribute('data-drawerdeck-trigger')).toBe('');
  });
});

describe('non-modal (modal={false}, #271)', () => {
  it('opens with show(), not showModal(): dialog.matches(":modal") is false', async () => {
    mockReducedMotion();
    render(<TestDrawer modal={false} />);
    act(() => screen.getByText('Open').click());
    const popup = popupOf(document.body);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');

    expect(popup.matches(':modal')).toBe(false);
  });

  it('modal (the default) still opens with showModal(): dialog.matches(":modal") is true', async () => {
    mockReducedMotion();
    render(<TestDrawer />);
    act(() => screen.getByText('Open').click());
    const popup = popupOf(document.body);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');

    expect(popup.matches(':modal')).toBe(true);
  });

  it('lets the page behind it take a click and focus, unlike a modal drawer', async () => {
    mockReducedMotion();
    const behind = document.createElement('button');
    behind.textContent = 'Behind';
    Object.assign(behind.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '50px',
      height: '50px'
    });
    document.body.append(behind);
    const onClick = vi.fn();
    behind.addEventListener('click', onClick);

    const { rerender } = render(
      <TestDrawer modal={false} snapPoints={[0.5]} />
    );
    act(() => screen.getByText('Open').click());
    const popup = popupOf(document.body);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');

    expect(document.elementFromPoint(25, 25)).toBe(behind);
    document
      .elementFromPoint(25, 25)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
    behind.focus();
    expect(document.activeElement).toBe(behind);

    act(() => screen.getByText('Close').click());
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'closed');

    // Contrast: the default, modal drawer covers the same point instead.
    rerender(<TestDrawer snapPoints={[0.5]} />);
    act(() => screen.getByText('Open').click());
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');
    expect(document.elementFromPoint(25, 25)).not.toBe(behind);
    behind.focus();
    expect(document.activeElement).not.toBe(behind);

    behind.remove();
  });

  it('closes on Escape, reason "escape", and returns focus to the trigger', async () => {
    mockReducedMotion();
    const onOpenChange = vi.fn();
    render(<TestDrawer modal={false} onOpenChange={onOpenChange} />);
    const trigger = screen.getByText('Open');
    act(() => trigger.click());
    const popup = popupOf(document.body);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');

    act(() =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
    );

    await expectSettledTo(() => popup.getAttribute('data-phase'), 'closed');
    expect(onOpenChange).toHaveBeenCalledWith(false, { reason: 'escape' });
    expect(document.activeElement).toBe(trigger);
  });

  it('does not close on an outside press by default, unlike a modal drawer', async () => {
    mockReducedMotion();
    render(<TestDrawer modal={false} />);
    act(() => screen.getByText('Open').click());
    const popup = popupOf(document.body);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');

    const gap = viewportOf(document.body).querySelector('[data-drawer-gap]')!;
    act(() => gap.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    await sleep(300);
    expect(popup.getAttribute('data-phase')).toBe('open');
  });
});

describe('snap points', () => {
  it('reports settling on a different one, not the initial open', async () => {
    mockReducedMotion();
    const onSnapPointChange = vi.fn();
    render(
      <TestDrawer snapPoints={[0.5, 1]} onSnapPointChange={onSnapPointChange} />
    );
    act(() => screen.getByText('Open').click());
    const popup = popupOf(document.body);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');
    expect(onSnapPointChange).not.toHaveBeenCalled();

    const viewport = viewportOf(document.body);
    const target = Math.round(viewport.clientHeight * 1);
    viewport.scrollTo({ top: target, behavior: 'instant' });

    await expectSettledTo(() => popup.getAttribute('data-snap-index'), '1');
    expect(onSnapPointChange).toHaveBeenCalledWith(1);
  });
});
