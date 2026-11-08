import * as Drawer from '@drawerdeck/react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import drawerDemo from './drawer.css?inline';

const meta = { title: 'Backdrop' } satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

// The recipe from the "Style the backdrop" guide: a native scroll-driven
// @keyframes animation over the drag, reading --drawer-first-snap (the
// pixel offset of the first snap point) for its range, with the
// --drawer-progress fallback where animation-timeline: scroll() is
// unsupported (Firefox stable, #236). The keyframes animate
// background-color's alpha, not opacity, so this composes with
// drawer.css's own entrance/exit opacity fade by multiplying, not
// replacing it.
const styledDim = `
  @supports (animation-timeline: scroll()) {
    @keyframes dim {
      from {
        background-color: rgb(0 0 0 / 0);
      }
      to {
        background-color: rgb(0 0 0 / 0.5);
      }
    }

    .styled-dim__backdrop {
      background-color: rgb(0 0 0 / 0);
      animation: dim 1s linear;
      animation-timeline: --drawer;
      animation-range: 0 var(--drawer-first-snap);
      animation-fill-mode: both;
    }
  }

  @supports not (animation-timeline: scroll()) {
    .styled-dim__backdrop {
      background: rgb(0 0 0 / calc(var(--drawer-progress, 0) * 0.5));
    }
  }
`;

/**
 * `Drawer.Backdrop` is headless; this is the dim from the "Style the
 * backdrop" guide: a `@keyframes` animation driven by `Drawer.Viewport`'s
 * own named scroll timeline (`--drawer`), ranged to `--drawer-first-snap`,
 * with no JavaScript running per scroll frame in Chromium or Safari.
 * Firefox stable falls back to `--drawer-progress`, written as the
 * viewport scrolls. Drag or scroll between closed and the first snap
 * point to see it fade in and out with the drag, not only the entrance
 * and the exit.
 */
export const StyledDim: Story = {
  decorators: [
    (Story) => (
      <>
        <style>{drawerDemo}</style>
        <style>{styledDim}</style>
        <div className="drawer-demo">
          <Story />
        </div>
      </>
    )
  ],
  render: () => (
    <Drawer.Root snapPoints={[0.5, 1]}>
      <Drawer.Trigger className="drawer-demo__trigger">Open</Drawer.Trigger>
      <Drawer.Popup>
        <Drawer.Backdrop className="drawer-demo__backdrop styled-dim__backdrop" />
        <Drawer.Viewport>
          <Drawer.Panel className="drawer-demo__panel">
            <Drawer.Handle className="drawer-demo__handle" />
            <Drawer.Title className="drawer-demo__title">Settings</Drawer.Title>
            <Drawer.Content className="drawer-demo__content">
              <p className="drawer-demo__note">
                The dim behind this panel follows the drag, fully dim by the
                first snap point.
              </p>
            </Drawer.Content>
            <Drawer.Close className="drawer-demo__close">Done</Drawer.Close>
          </Drawer.Panel>
        </Drawer.Viewport>
      </Drawer.Popup>
    </Drawer.Root>
  )
};
