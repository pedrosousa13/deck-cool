// The real, shipped `@drawerdeck/react` (and `@drawerdeck/core` underneath
// it), via `workspace:*` (#266: always the commit under test, not a packed
// tarball). `Drawer.Root` with `snapPoints`, driven only through the
// package's public API, same as the other three decks' bench entries.
// `id="panel"` on `Drawer.Panel` is this bench's own marker (the same
// convention as the other decks' `#panel`), not the package's; drawerdeck's
// own markers are the `data-drawerdeck-*` attributes it sets on the same
// elements. No `Drawer.Backdrop`, `Title` or `Close`: not exercised by any
// scenario here (dismiss here is always a drag past the lowest snap point,
// not a close button or Escape).

import * as Drawer from '@drawerdeck/react';
import { FULL_FRACTION, HALF_FRACTION, RowsReact } from './content';

const rows = RowsReact(50);

export function DrawerdeckApp() {
  return (
    <Drawer.Root snapPoints={[HALF_FRACTION, FULL_FRACTION]}>
      <Drawer.Trigger id="trigger">Open</Drawer.Trigger>
      <Drawer.Popup>
        <Drawer.Viewport>
          <Drawer.Panel id="panel" className="panel">
            <Drawer.Handle className="handle" />
            <Drawer.Content className="inner-list">
              {rows.map((i) => (
                <div className="bench-row" key={i}>
                  Row {i}
                </div>
              ))}
            </Drawer.Content>
          </Drawer.Panel>
        </Drawer.Viewport>
      </Drawer.Popup>
    </Drawer.Root>
  );
}
