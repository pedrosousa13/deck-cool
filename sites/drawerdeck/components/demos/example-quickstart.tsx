"use client";

import * as Drawer from "@drawerdeck/react";
import DemoFrame from "./demo-frame.tsx";

const SETTINGS = [
  "Appearance",
  "Notifications",
  "Privacy",
  "Security",
  "Accounts",
  "Language and region",
  "Accessibility",
  "Storage and data",
  "Connected apps",
  "Advanced",
  "About",
];

// The deck the Quickstart's code block builds, written out again here: no
// check holds the two to each other. snapPoints={[0.5, 1]} gives a drag or
// an Escape somewhere to land besides closed.
export default function Quickstart() {
  return (
    <DemoFrame>
      <div className="drawer-demo">
        <Drawer.Root snapPoints={[0.5, 1]}>
          <Drawer.Trigger className="drawer-demo__trigger">Open</Drawer.Trigger>
          <Drawer.Popup>
            <Drawer.Backdrop className="drawer-demo__backdrop" />
            <Drawer.Viewport className="drawer-demo__viewport">
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
      </div>
    </DemoFrame>
  );
}
