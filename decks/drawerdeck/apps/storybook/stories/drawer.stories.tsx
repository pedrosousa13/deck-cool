import { useState } from 'react';
import * as Drawer from '@drawerdeck/react';
import type { Side } from '@drawerdeck/react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import drawerDemo from './drawer.css?inline';

const meta = { title: 'Drawer' } satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** Every story here shares the same look (`drawer.css`), adapted from the
 * docs site's own drawer-demo recipe. */
const withLook: Story['decorators'] = [
  (Story) => (
    <>
      <style>{drawerDemo}</style>
      <div className="drawer-demo">
        <Story />
      </div>
    </>
  )
];

const SETTINGS = [
  'Appearance',
  'Notifications',
  'Privacy',
  'Security',
  'Accounts',
  'Language and region'
];

/**
 * The quickstart recipe: `Drawer.Root`, `Trigger`, `Popup`, `Backdrop`,
 * `Viewport` and `Panel`, with a `Handle`, `Title`, `Content` and `Close`.
 * `snapPoints={[0.5, 1]}` gives a drag or an Escape somewhere to land
 * besides closed. Drag or scroll it between half and full, and close it
 * with Escape, an outside press or Done.
 */
export const BasicUse: Story = {
  decorators: withLook,
  render: () => (
    <Drawer.Root snapPoints={[0.5, 1]}>
      <Drawer.Trigger className="drawer-demo__trigger">Open</Drawer.Trigger>
      <Drawer.Popup>
        <Drawer.Backdrop className="drawer-demo__backdrop" />
        <Drawer.Viewport>
          <Drawer.Panel className="drawer-demo__panel">
            <Drawer.Handle className="drawer-demo__handle" />
            <Drawer.Title className="drawer-demo__title">Settings</Drawer.Title>
            <Drawer.Content className="drawer-demo__content">
              <ul className="drawer-demo__list">
                {SETTINGS.map((setting) => (
                  <li key={setting}>{setting}</li>
                ))}
              </ul>
            </Drawer.Content>
            <Drawer.Close className="drawer-demo__close">Done</Drawer.Close>
          </Drawer.Panel>
        </Drawer.Viewport>
      </Drawer.Popup>
    </Drawer.Root>
  )
};

/** Three rest points, nearest first: a quarter, half, and fully open,
 * reported live as the drawer settles on each. */
function SnapPointsDrawer() {
  const [index, setIndex] = useState(0);
  const labels = ['closed', 'quarter', 'half', 'full'];
  return (
    <>
      <p className="drawer-demo__note" role="status">
        Resting at: {labels[index]}
      </p>
      <Drawer.Root
        snapPoints={[0.25, 0.5, 1]}
        onSnapPointChange={(snapIndex) => setIndex(snapIndex + 1)}
        onOpenChange={(open) => {
          if (!open) setIndex(0);
        }}
      >
        <Drawer.Trigger className="drawer-demo__trigger">Open</Drawer.Trigger>
        <Drawer.Popup>
          <Drawer.Backdrop className="drawer-demo__backdrop" />
          <Drawer.Viewport>
            <Drawer.Panel className="drawer-demo__panel">
              <Drawer.Handle className="drawer-demo__handle" />
              <Drawer.Title className="drawer-demo__title">
                Filters
              </Drawer.Title>
              <Drawer.Content className="drawer-demo__content">
                <p className="drawer-demo__note">
                  Drag or scroll between a quarter, half and full.
                </p>
              </Drawer.Content>
              <Drawer.Close className="drawer-demo__close">Done</Drawer.Close>
            </Drawer.Panel>
          </Drawer.Viewport>
        </Drawer.Popup>
      </Drawer.Root>
    </>
  );
}

/**
 * `snapPoints` sets fractions of the Viewport's own extent (height for
 * `bottom`/`top`) the drawer can rest open at, nearest first. With none, a
 * drawer has one open point: the panel's own content extent.
 */
export const SnapPoints: Story = {
  decorators: withLook,
  render: () => <SnapPointsDrawer />
};

function ControlledDrawer() {
  const [open, setOpen] = useState(false);
  const [snapPoint, setSnapPoint] = useState(0);
  const options = ['Quarter', 'Half', 'Full'];
  return (
    <>
      <div className="drawer-demo__group" role="group" aria-label="Drawer">
        <button
          type="button"
          className="drawer-demo__button"
          aria-pressed={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Close' : 'Open'}
        </button>
        {options.map((label, optionIndex) => (
          <button
            key={label}
            type="button"
            className="drawer-demo__button"
            aria-pressed={open && snapPoint === optionIndex}
            onClick={() => {
              setSnapPoint(optionIndex);
              setOpen(true);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <Drawer.Root
        open={open}
        onOpenChange={(nextOpen) => setOpen(nextOpen)}
        snapPoint={snapPoint}
        onSnapPointChange={setSnapPoint}
        snapPoints={[0.25, 0.5, 1]}
      >
        <Drawer.Popup>
          <Drawer.Backdrop className="drawer-demo__backdrop" />
          <Drawer.Viewport>
            <Drawer.Panel className="drawer-demo__panel">
              <Drawer.Handle className="drawer-demo__handle" />
              <Drawer.Title className="drawer-demo__title">
                Settings
              </Drawer.Title>
              <Drawer.Content className="drawer-demo__content">
                <p className="drawer-demo__note">
                  Open, close and the snap point are all this story's own state:
                  the buttons above set them, and dragging the drawer reports
                  back through onOpenChange and onSnapPointChange.
                </p>
              </Drawer.Content>
              <Drawer.Close className="drawer-demo__close">Done</Drawer.Close>
            </Drawer.Panel>
          </Drawer.Viewport>
        </Drawer.Popup>
      </Drawer.Root>
    </>
  );
}

/**
 * `open`/`onOpenChange` and `snapPoint`/`onSnapPointChange`, both
 * controlled from outside the drawer: the buttons above set them, like a
 * controlled input's value, and a drag or an Escape reports back through
 * the same two callbacks.
 */
export const Controlled: Story = {
  decorators: withLook,
  render: () => <ControlledDrawer />
};

const LONG_LIST = Array.from({ length: 24 }, (_, i) => `Item ${i + 1}`);

/**
 * `Drawer.Content` is scrollable, but locked below the top snap point
 * (#232): a drag anywhere on it moves the drawer itself until then, so a
 * long list never fights a drag trying to resize or close the drawer.
 * Drag or scroll to full first, then scroll the list itself.
 */
export const ScrollingContent: Story = {
  decorators: withLook,
  render: () => (
    <Drawer.Root snapPoints={[0.5, 1]}>
      <Drawer.Trigger className="drawer-demo__trigger">Open</Drawer.Trigger>
      <Drawer.Popup>
        <Drawer.Backdrop className="drawer-demo__backdrop" />
        <Drawer.Viewport>
          <Drawer.Panel className="drawer-demo__panel">
            <Drawer.Handle className="drawer-demo__handle" />
            <Drawer.Title className="drawer-demo__title">
              Notifications
            </Drawer.Title>
            <Drawer.Content className="drawer-demo__content">
              <ul className="drawer-demo__list">
                {LONG_LIST.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Drawer.Content>
            <Drawer.Close className="drawer-demo__close">Done</Drawer.Close>
          </Drawer.Panel>
        </Drawer.Viewport>
      </Drawer.Popup>
    </Drawer.Root>
  )
};

/**
 * With `dismissible` set to false, Escape, an outside press and a drag
 * past the lowest snap point do nothing. Only `Drawer.Close`, below, ever
 * closes it.
 */
export const NonDismissible: Story = {
  decorators: withLook,
  render: () => (
    <Drawer.Root snapPoints={[0.5, 1]} dismissible={false}>
      <Drawer.Trigger className="drawer-demo__trigger">Open</Drawer.Trigger>
      <Drawer.Popup>
        <Drawer.Backdrop className="drawer-demo__backdrop" />
        <Drawer.Viewport>
          <Drawer.Panel className="drawer-demo__panel">
            <Drawer.Handle className="drawer-demo__handle" />
            <Drawer.Title className="drawer-demo__title">
              Unsaved changes
            </Drawer.Title>
            <Drawer.Content className="drawer-demo__content">
              <p className="drawer-demo__note">
                Escape, an outside press and a drag past the lowest snap point
                do nothing here. Only Done, below, closes it.
              </p>
            </Drawer.Content>
            <Drawer.Close className="drawer-demo__close">Done</Drawer.Close>
          </Drawer.Panel>
        </Drawer.Viewport>
      </Drawer.Popup>
    </Drawer.Root>
  )
};

/**
 * A mouse can drag this panel between its snap points, the same throw and
 * settle a touch, pen or trackpad scroll already gets natively (#235): a
 * dedicated pointer handler, since a mouse cannot drag a scroll container.
 * Press the panel itself (not the Handle, which is decorative) and drag.
 */
export const MouseDrag: Story = {
  decorators: withLook,
  render: () => (
    <Drawer.Root snapPoints={[0.5, 1]}>
      <Drawer.Trigger className="drawer-demo__trigger">Open</Drawer.Trigger>
      <Drawer.Popup>
        <Drawer.Backdrop className="drawer-demo__backdrop" />
        <Drawer.Viewport>
          <Drawer.Panel className="drawer-demo__panel">
            <Drawer.Handle className="drawer-demo__handle" />
            <Drawer.Title className="drawer-demo__title">Drag me</Drawer.Title>
            <Drawer.Content className="drawer-demo__content">
              <p className="drawer-demo__note">
                Press anywhere on this panel with a mouse and drag: it throws
                toward the nearest snap point on release, the same as a touch or
                a flick.
              </p>
            </Drawer.Content>
            <Drawer.Close className="drawer-demo__close">Done</Drawer.Close>
          </Drawer.Panel>
        </Drawer.Viewport>
      </Drawer.Popup>
    </Drawer.Root>
  )
};

/** One side's story: `side` is read once, on mount ("Open from a side"),
 * so each side gets its own story rather than a live control. */
function sideStory(side: Side): Story {
  return {
    decorators: withLook,
    render: () => (
      <Drawer.Root side={side} snapPoints={[0.5, 1]}>
        <Drawer.Trigger className="drawer-demo__trigger">
          Open {side}
        </Drawer.Trigger>
        <Drawer.Popup>
          <Drawer.Backdrop className="drawer-demo__backdrop" />
          <Drawer.Viewport>
            <Drawer.Panel className="drawer-demo__panel">
              <Drawer.Handle className="drawer-demo__handle" />
              <Drawer.Title className="drawer-demo__title">
                Settings
              </Drawer.Title>
              <Drawer.Content className="drawer-demo__content">
                <ul className="drawer-demo__list">
                  {SETTINGS.map((setting) => (
                    <li key={setting}>{setting}</li>
                  ))}
                </ul>
              </Drawer.Content>
              <Drawer.Close className="drawer-demo__close">Done</Drawer.Close>
            </Drawer.Panel>
          </Drawer.Viewport>
        </Drawer.Popup>
      </Drawer.Root>
    )
  };
}

/** `side="bottom"` (the default): the panel slides up from the bottom
 * edge. Every other prop works the same on every side. */
export const Bottom: Story = sideStory('bottom');

/** `side="top"`: the panel slides down from the top edge. */
export const Top: Story = sideStory('top');

/** `side="left"`: the panel slides in from the left edge. */
export const Left: Story = sideStory('left');

/** `side="right"`: the panel slides in from the right edge. */
export const Right: Story = sideStory('right');
