// vaul 1.1.2, pinned (unmaintained, last release December 2024).
// `Drawer.Root` with `snapPoints`, driven through its own public API -- the
// bench never reaches into vaul's internals. `id="panel"` on
// `Drawer.Content` is this bench's own marker (the same convention as the
// other decks' `#panel`), not vaul's; vaul's own marker is the
// `[data-vaul-drawer]` attribute it puts on the same element.

import { Drawer } from 'vaul';
import { FULL_FRACTION, HALF_FRACTION, RowsReact } from './content';

const rows = RowsReact(50);

export function VaulApp() {
  return (
    <Drawer.Root
      snapPoints={[HALF_FRACTION, FULL_FRACTION]}
      shouldScaleBackground={false}
    >
      <Drawer.Trigger id="trigger">Open</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Content id="panel" className="panel">
          <div className="handle" />
          <div className="inner-list">
            {rows.map((i) => (
              <div className="bench-row" key={i}>
                Row {i}
              </div>
            ))}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
