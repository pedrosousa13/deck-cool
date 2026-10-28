"use client";

// TODO(#240): @drawerdeck/react has no primitives yet, so this is a static
// mock of the Quickstart's drawer, not a live `<Drawer.*>` deck. Swap it for
// one once the engine and the primitives land.
import { useState } from "react";
import DemoFrame from "./demo-frame.tsx";

export default function Quickstart() {
  const [open, setOpen] = useState(false);
  return (
    <DemoFrame>
      <div className="drawer-mock">
        <button type="button" className="drawer-mock__trigger" onClick={() => setOpen(true)}>
          Open
        </button>
        <div className="drawer-mock__popup" data-open={open ? "" : undefined}>
          <div className="drawer-mock__backdrop" onClick={() => setOpen(false)} />
          <div className="drawer-mock__panel">
            <div className="drawer-mock__handle" />
            <p className="drawer-mock__title">Settings</p>
            <p className="drawer-mock__content">…</p>
            <button type="button" className="drawer-mock__close" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      </div>
    </DemoFrame>
  );
}
