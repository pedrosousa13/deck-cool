"use client";

import * as Drawer from "@drawerdeck/react";
import DemoFrame from "./demo-frame.tsx";

// Three levels, each opened from inside the one before it (#272, the
// "Nested drawers" guide): Settings opens Notifications, which opens
// Advanced. Every level is its own Drawer.Root -- a nested Trigger sits
// inside the Content of the one it opens from, same as any other button
// there, and only reachable once that level is actually open. The CSS
// recipe (drawer-demo__panel--nested, styles/drawerdeck.css) reads
// --drawer-nested, the engine's own count of how many drawers are
// currently stacked above this one, to scale each one back a little
// while something is open on top of it.
const LEVELS = [
  {
    title: "Settings",
    body: "The first drawer. Open Notifications from in here.",
    next: "Notifications"
  },
  {
    title: "Notifications",
    body: "Nested one level deep. Open Advanced from in here.",
    next: "Advanced"
  },
  {
    title: "Advanced",
    body: "Nested two levels deep: nothing opens from in here, so --drawer-nested never counts above 2.",
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
        <Drawer.Viewport className="drawer-demo__viewport">
          <Drawer.Panel className="drawer-demo__panel drawer-demo__panel--nested">
            <Drawer.Handle className="drawer-demo__handle" />
            <Drawer.Title className="drawer-demo__title">
              {level.title}
            </Drawer.Title>
            <Drawer.Content className="drawer-demo__content">
              <p className="drawer-demo__nested-body">{level.body}</p>
              {level.next && <NestedLevel index={index + 1} />}
            </Drawer.Content>
            <Drawer.Close className="drawer-demo__close">Close</Drawer.Close>
          </Drawer.Panel>
        </Drawer.Viewport>
      </Drawer.Popup>
    </Drawer.Root>
  );
}

export default function Nested() {
  return (
    <DemoFrame>
      <div className="drawer-demo drawer-demo--nested">
        <NestedLevel index={0} />
      </div>
    </DemoFrame>
  );
}
