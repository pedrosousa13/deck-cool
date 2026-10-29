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
