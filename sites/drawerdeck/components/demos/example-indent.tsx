"use client";

import { useRef } from "react";
import * as Drawer from "@drawerdeck/react";
import DemoFrame from "./demo-frame.tsx";

// A background indent (#274, the "A background indent" guide): `indent`
// takes a ref to the page wrapper this drawer should scale back as it
// opens. The stand-in "page" here is this demo's own mock card, never
// the real site chrome around it, the same self-contained shape every
// other demo on this page keeps -- opening it still shows a real,
// full-viewport Drawer.Popup, the same as any other demo's own drawer
// does. The engine sets data-drawer-indent on this ref's own element too
// (the guide's own recipe reads that attribute); drawerdeck.css' own
// .drawer-demo__indent-page rule, here, reads the className directly
// instead, the same way every other demo part on this site does.
export default function Indent() {
  const pageRef = useRef<HTMLDivElement>(null);
  return (
    <DemoFrame>
      <div className="drawer-demo drawer-demo--indent">
        <div className="drawer-demo__indent-page" ref={pageRef}>
          <div className="drawer-demo__indent-page-bar" />
          <p className="drawer-demo__indent-page-text">
            The page behind the drawer.
          </p>
        </div>
        <Drawer.Root snapPoints={[0.5, 1]} indent={pageRef}>
          <Drawer.Trigger className="drawer-demo__trigger">Open</Drawer.Trigger>
          <Drawer.Popup>
            <Drawer.Backdrop className="drawer-demo__backdrop" />
            <Drawer.Viewport className="drawer-demo__viewport">
              <Drawer.Panel className="drawer-demo__panel">
                <Drawer.Handle className="drawer-demo__handle" />
                <Drawer.Title className="drawer-demo__title">Settings</Drawer.Title>
                <Drawer.Content className="drawer-demo__content">
                  <p className="drawer-demo__nested-body">
                    The page behind scales back while this is open, and
                    eases back out as it closes, however it closes.
                  </p>
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
