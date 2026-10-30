"use client";

import { useState } from "react";
import * as Drawer from "@drawerdeck/react";
import DemoFrame from "./demo-frame.tsx";

const SIDES = ["bottom", "top", "left", "right"] as const;

const SETTINGS = ["Appearance", "Notifications", "Privacy", "Security", "Accounts", "Language and region"];

// The side picker remounts Drawer.Root (key={side}): side is read once, on
// mount (see the "Open from a side" guide), the same way a consumer
// switching sides at runtime would need to.
export default function Sides() {
  const [side, setSide] = useState<(typeof SIDES)[number]>("bottom");

  return (
    <DemoFrame>
      <div className="drawer-demo drawer-demo--sides">
        <div className="drawer-demo__side-picker" role="group" aria-label="Side">
          {SIDES.map((option) => (
            <button
              key={option}
              type="button"
              className="drawer-demo__side-button"
              aria-pressed={option === side}
              onClick={() => setSide(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <Drawer.Root key={side} side={side} snapPoints={[0.5, 1]}>
          <Drawer.Trigger className="drawer-demo__trigger">Open {side}</Drawer.Trigger>
          <Drawer.Popup>
            <Drawer.Backdrop className="drawer-demo__backdrop" />
            <Drawer.Viewport className="drawer-demo__viewport">
              <Drawer.Panel className="drawer-demo__panel drawer-demo__panel--sides">
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
