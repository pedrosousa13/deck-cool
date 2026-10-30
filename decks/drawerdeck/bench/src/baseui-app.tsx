// Base UI's Drawer, `@base-ui/react@1.9.0`, pinned (see versions.json for
// the npm release date).
//
// Doc followed: https://base-ui.com/react/components/drawer (its own
// quickstart/anatomy gives the `Drawer.Trigger` > `Drawer.Portal` >
// `Drawer.Backdrop` + `Drawer.Viewport` > `Drawer.Popup` structure below,
// and the positioning CSS -- `--drawer-height`, `--drawer-snap-point-offset`,
// `--drawer-swipe-movement-y` -- carried into src/baseui.css). Also
// packaged with the library: `node_modules/@base-ui/react/docs/react/
// components/drawer.md`.
//
// Options set, non-default:
// - `snapPoints`: to match the shared half/full snap points every deck
//   gets (content.ts) -- Base UI has no default (plain open/closed
//   without it).
// Everything else (`modal`, `dismissible`, ...) is left at its default.
//
// `Drawer.Backdrop` (#304, fairness rule 3): the doc's anatomy puts it in
// `Drawer.Portal`, before `Drawer.Viewport`, on every recipe -- it was
// missing here, so the entrance/exit and the release-duration CSS added to
// src/baseui.css for it had no element to apply to. Added with no options;
// the dim amount and timing are entirely its own CSS, below.
//
// `Drawer.Root` with `snapPoints` (fractions of the viewport height, the
// same convention vaul uses), driven through its own public API --
// `Drawer.Root` > `Drawer.Trigger`, `Drawer.Portal` > `Drawer.Backdrop`,
// `Drawer.Viewport` > `Drawer.Popup`. `id="panel"` on `Drawer.Popup` is
// this bench's own marker, the same convention as the other decks'
// `#panel`.

import { Drawer } from '@base-ui/react/drawer';
import { FULL_FRACTION, HALF_FRACTION, RowsReact } from './content';

const rows = RowsReact(50);

export function BaseUiApp() {
  return (
    <Drawer.Root snapPoints={[HALF_FRACTION, FULL_FRACTION]}>
      <Drawer.Trigger id="trigger">Open</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className="backdrop" />
        <Drawer.Viewport className="viewport">
          <Drawer.Popup id="panel" className="panel">
            <div className="handle" />
            <div className="inner-list">
              {rows.map((i) => (
                <div className="bench-row" key={i}>
                  Row {i}
                </div>
              ))}
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
