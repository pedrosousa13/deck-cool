import * as Drawer from '@drawerdeck/react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import drawerDemo from './drawer.css?inline';

const meta = { title: 'Nested' } satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

// The "Nested drawers" guide's own recipe: --drawer-nested (how many
// drawers are stacked above this one) sets --nested-scale, the
// fully-nested target for that count, registered with @property so the
// transition below eases between two counts; --drawer-nested-progress
// (the live open progress of the one directly above) blends from it
// toward 1 as that one opens, drags or closes, with no JS running per
// drag frame where the browser supports a named scroll timeline.
const nested = `
  @property --nested-scale {
    syntax: '<number>';
    inherits: false;
    initial-value: 1;
  }

  .nested__panel {
    --nested-scale: calc(1 - 0.05 * var(--drawer-nested, 0));
    scale: calc(
      1 - (1 - var(--nested-scale)) * var(--drawer-nested-progress, 0)
    );
    transform-origin: top center;
  }

  @media (prefers-reduced-motion: no-preference) {
    .nested__panel {
      transition:
        transform 300ms cubic-bezier(0.32, 0.72, 0, 1),
        --nested-scale 300ms cubic-bezier(0.32, 0.72, 0, 1);
    }
  }
`;

const LEVELS = [
  {
    title: 'Settings',
    body: 'The first drawer. Open Notifications from in here.',
    next: 'Notifications'
  },
  {
    title: 'Notifications',
    body: 'Nested one level deep. Open Advanced from in here.',
    next: 'Advanced'
  },
  {
    title: 'Advanced',
    body: 'Nested two levels deep: nothing opens from in here.',
    next: null
  }
] as const;

function NestedLevel({ index }: { index: number }) {
  const level = LEVELS[index];
  return (
    <Drawer.Root snapPoints={[1]}>
      <Drawer.Trigger className="drawer-demo__trigger">
        Open {level.title}
      </Drawer.Trigger>
      <Drawer.Popup>
        <Drawer.Backdrop className="drawer-demo__backdrop" />
        <Drawer.Viewport>
          <Drawer.Panel className="drawer-demo__panel nested__panel">
            <Drawer.Handle className="drawer-demo__handle" />
            <Drawer.Title className="drawer-demo__title">
              {level.title}
            </Drawer.Title>
            <Drawer.Content className="drawer-demo__content">
              <p className="drawer-demo__note">{level.body}</p>
              {level.next && <NestedLevel index={index + 1} />}
            </Drawer.Content>
            <Drawer.Close className="drawer-demo__close">Close</Drawer.Close>
          </Drawer.Panel>
        </Drawer.Viewport>
      </Drawer.Popup>
    </Drawer.Root>
  );
}

/**
 * A `Drawer.Root` opened from inside another one's `Drawer.Content` just
 * stacks, for free (#272): no new prop. Open Settings, then
 * Notifications, then Advanced; drag, close or press Escape on any one
 * and only that level moves. `--drawer-nested` and
 * `--drawer-nested-progress` scale each level back a little while
 * something is open above it, easing with the drag instead of jumping
 * straight to it.
 */
export const ThreeLevels: Story = {
  decorators: [
    (Story) => (
      <>
        <style>{drawerDemo}</style>
        <style>{nested}</style>
        <div className="drawer-demo">
          <Story />
        </div>
      </>
    )
  ],
  render: () => <NestedLevel index={0} />
};
