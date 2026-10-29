// THROWAWAY (#245). The real, shipped `@drawerdeck/react` (and
// `@drawerdeck/core` underneath it) -- packed from `origin/main` and
// installed into this bench as a `file:` dependency, replacing #233's own
// ported mechanics (`src/drawerdeck.ts`, now deleted). `Drawer.Root` with
// `snapPoints`, driven only through the package's public API, same as
// vaul's and Base UI's own bench entries (`vaul-app.tsx`, `baseui-app.tsx`).
// `id="panel"` on `Drawer.Panel` is this bench's own marker (same
// convention as vaul's and Base UI's `#panel`), not the package's;
// drawerdeck's own markers are the `data-drawerdeck-*` attributes it sets
// on the same elements. No `Drawer.Backdrop`, `Title` or `Close`: not
// exercised by any scenario here, the same choice #233's own port made
// (dismiss here is always a drag past the lowest snap point, not a close
// button or Escape).

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
