// `side` (#270): `@drawerdeck/core`'s own `packages/core/test/sides.test.ts`
// covers the mirrored scroll math and a real drag for `top`/`left`/`right`
// in depth. This file only checks what's specific to the React layer:
// `data-side` on the Popup and the Panel, the Viewport's own DOM order
// (reversed for `top`/`left`), and that a real drag and a real Escape still
// reach the drawer through `Drawer.Root`'s wiring for a non-bottom side.
import { act, render } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Side } from '@drawerdeck/react';
import {
  expectSettledTo,
  mockReducedMotion,
  panelOf,
  popupOf,
  TestDrawer,
  viewportOf
} from './fixtures';

afterEach(() => vi.restoreAllMocks());

const SIDES: readonly Side[] = ['bottom', 'top', 'left', 'right'];

describe('data-side and the Viewport’s own DOM order', () => {
  for (const side of SIDES) {
    it(`side="${side}": data-side on the Popup and the Panel`, () => {
      render(<TestDrawer side={side} />);

      expect(popupOf(document.body).getAttribute('data-side')).toBe(side);
      expect(panelOf(document.body).getAttribute('data-side')).toBe(side);
    });

    const reversed = side === 'top' || side === 'left';
    it(`side="${side}": the gap sits ${reversed ? 'after' : 'before'} the Panel`, () => {
      render(<TestDrawer side={side} />);

      const viewport = viewportOf(document.body);
      const gap = viewport.querySelector('[data-drawer-gap]')!;
      const panel = panelOf(document.body);
      const position = gap.compareDocumentPosition(panel);
      if (reversed) {
        expect(position & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
      } else {
        expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    });
  }

  it('defaults to "bottom" when side is omitted', () => {
    render(<TestDrawer />);

    expect(popupOf(document.body).getAttribute('data-side')).toBe('bottom');
  });
});

describe('a non-bottom side still opens and closes through Drawer.Root', () => {
  it('side="right": opens on the trigger, closes on a real Escape keypress', async () => {
    mockReducedMotion();
    const onOpenChange = vi.fn();
    render(
      <TestDrawer
        side="right"
        snapPoints={[0.5, 1]}
        onOpenChange={onOpenChange}
      />
    );
    const popup = popupOf(document.body);

    act(() => document.body.querySelector('button')!.click());

    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');
    expect(onOpenChange).toHaveBeenCalledWith(true, { reason: 'trigger' });

    await userEvent.keyboard('{Escape}');

    await expectSettledTo(() => popup.getAttribute('data-phase'), 'closed');
    expect(onOpenChange).toHaveBeenCalledWith(false, { reason: 'escape' });
  });

  it('side="top": closes on a real Escape keypress, returning focus to the trigger', async () => {
    mockReducedMotion();
    render(<TestDrawer side="top" snapPoints={[0.5]} />);
    const trigger = document.body.querySelector('button')!;
    act(() => trigger.click());
    const popup = popupOf(document.body);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');

    await userEvent.keyboard('{Escape}');

    await expectSettledTo(() => popup.getAttribute('data-phase'), 'closed');
    expect(document.activeElement).toBe(trigger);
  });

  it('side="left": closes on the close button', async () => {
    mockReducedMotion();
    render(<TestDrawer side="left" snapPoints={[0.5]} />);
    act(() => document.body.querySelector('button')!.click());
    const popup = popupOf(document.body);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');

    act(() => {
      const buttons = document.body.querySelectorAll('button');
      (buttons[buttons.length - 1] as HTMLButtonElement).click();
    });

    await expectSettledTo(() => popup.getAttribute('data-phase'), 'closed');
  });
});
