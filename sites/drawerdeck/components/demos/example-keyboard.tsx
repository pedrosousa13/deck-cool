"use client";

import * as Drawer from "@drawerdeck/react";
import DemoFrame from "./demo-frame.tsx";

// A textarea and a text input, so a phone's on-screen keyboard has
// something to open (#273, the "On-screen keyboard" guide): focus either
// one and the drawer lifts itself above the keyboard, on the same snap
// point. The lift does not scroll a field into view on its own (the guide
// says so), so the taller field (Message) sits first, closest to the
// Panel's own top, within reach at the drawer's default, shorter snap
// point; Subject comes after.
export default function Keyboard() {
  return (
    <DemoFrame>
      <div className="drawer-demo drawer-demo--keyboard">
        <Drawer.Root snapPoints={[0.5, 1]}>
          <Drawer.Trigger className="drawer-demo__trigger">Open</Drawer.Trigger>
          <Drawer.Popup>
            <Drawer.Backdrop className="drawer-demo__backdrop" />
            <Drawer.Viewport className="drawer-demo__viewport">
              <Drawer.Panel className="drawer-demo__panel">
                <Drawer.Handle className="drawer-demo__handle" />
                <Drawer.Title className="drawer-demo__title">
                  Feedback
                </Drawer.Title>
                <Drawer.Content className="drawer-demo__content">
                  <form
                    className="drawer-demo__form"
                    onSubmit={(event) => event.preventDefault()}
                  >
                    <label
                      className="drawer-demo__label"
                      htmlFor="drawer-demo-keyboard-message"
                    >
                      Message
                    </label>
                    <textarea
                      id="drawer-demo-keyboard-message"
                      className="drawer-demo__textarea"
                      rows={2}
                      placeholder="What happened?"
                    />
                    <label
                      className="drawer-demo__label"
                      htmlFor="drawer-demo-keyboard-subject"
                    >
                      Subject
                    </label>
                    <input
                      id="drawer-demo-keyboard-subject"
                      className="drawer-demo__input"
                      type="text"
                      placeholder="A short summary"
                    />
                  </form>
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
