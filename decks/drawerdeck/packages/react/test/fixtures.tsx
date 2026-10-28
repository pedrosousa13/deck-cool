import { type ComponentProps, type ReactNode } from 'react';
import { expect, vi } from 'vitest';
import * as Drawer from '../src/index';

/** A drawer with no stylesheet, following #234's beta API sketch exactly:
 * every part, in order. */
export function TestDrawer({
  content,
  ...props
}: ComponentProps<typeof Drawer.Root> & { content?: ReactNode }) {
  return (
    <Drawer.Root {...props}>
      <Drawer.Trigger>Open</Drawer.Trigger>
      <Drawer.Popup>
        <Drawer.Backdrop />
        <Drawer.Viewport>
          <Drawer.Panel>
            <Drawer.Handle />
            <Drawer.Title>Test drawer</Drawer.Title>
            <Drawer.Description>A drawer for testing.</Drawer.Description>
            <Drawer.Content>
              {/* Tall enough that the panel exceeds any real test viewport:
                  a snap point at fraction 1 needs the panel at least as
                  tall as the viewport to be reachable. */}
              {content ??
                Array.from({ length: 80 }, (_, i) => (
                  <div key={i} style={{ height: 24 }}>
                    Row {i + 1}
                  </div>
                ))}
            </Drawer.Content>
            <Drawer.Close>Close</Drawer.Close>
          </Drawer.Panel>
        </Drawer.Viewport>
      </Drawer.Popup>
    </Drawer.Root>
  );
}

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function expectSettledTo<T>(
  read: () => T,
  expected: T,
  timeout = 4000
) {
  await expect.poll(read, { timeout }).toEqual(expected);
  await sleep(200);
  expect(read()).toEqual(expected);
}

/** Forces `motionBehavior()` (in `@drawerdeck/core`) to `'instant'`, so a
 * test's opens, closes and throws settle at once. */
export function mockReducedMotion() {
  const real = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) =>
    query.includes('prefers-reduced-motion')
      ? ({ matches: true } as MediaQueryList)
      : real(query)
  );
}

export const popupOf = (root: ParentNode) =>
  root.querySelector<HTMLDialogElement>('[data-drawerdeck-popup]')!;
export const viewportOf = (root: ParentNode) =>
  root.querySelector<HTMLElement>('[data-drawerdeck-viewport]')!;
export const panelOf = (root: ParentNode) =>
  root.querySelector<HTMLElement>('[data-drawerdeck-panel]')!;
export const contentOf = (root: ParentNode) =>
  root.querySelector<HTMLElement>('[data-drawerdeck-content]')!;
