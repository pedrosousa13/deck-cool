// vaul 1.1.2, pinned (unmaintained, last release December 2024; see
// versions.json for the npm release date).
//
// Doc followed: https://vaul.emilkowal.ski/snap-points (snap points), with
// https://vaul.emilkowal.ski/api (defaults) and
// https://vaul.emilkowal.ski/getting-started (the quickstart's own
// `Drawer.Overlay`/`Drawer.Content` structure and positioning, carried
// into src/vaul.css) checked too.
//
// Options set, non-default:
// - `snapPoints`: to match the shared half/full snap points every deck
//   gets (content.ts) -- vaul has no default (plain open/closed without
//   it).
// `shouldScaleBackground={false}` is written out here but *is* vaul's own
// default; kept explicit so this isn't read as an accidental omission --
// none of the other three decks animate a background scale, so leaving
// vaul's own opt-in flourish off keeps the comparison on the shared task,
// not vaul's extra visual effect.
//
// `Drawer.Overlay` (#304, fairness rule 3): the getting-started quickstart
// puts it in `Drawer.Portal`, before `Drawer.Content` --
// `<Drawer.Overlay className="fixed inset-0 bg-black/40" />` -- and it was
// missing here. vaul's own shipped CSS (vaul-vendor.css) already drives its
// fade through `[data-vaul-overlay]`/`[data-vaul-snap-points-overlay]`
// (with `snapPoints` set, fading in only once the drawer passes
// `fadeFromIndex`, which defaults to the last snap point -- vaul's own
// default, left alone); without the element itself, none of that CSS had
// anything to apply to. Added with no options; position and dim color are
// its own CSS, in src/vaul.css, the same as `Drawer.Content` already
// needed.
//
// `Drawer.Root` with `snapPoints`, driven through its own public API -- the
// bench never reaches into vaul's internals. `id="panel"` on
// `Drawer.Content` is this bench's own marker (the same convention as the
// other decks' `#panel`), not vaul's; vaul's own marker is the
// `[data-vaul-drawer]` attribute it puts on the same element.
//
// `onOpenChange` (fairness rule 12, #311): reports vaul's own open
// state to `window.__bench.isOpen()`, left otherwise uncontrolled (no
// `open` prop) -- a pure listener, the same convention every deck's
// adapter here now uses, so a dismiss only counts once the library itself,
// not this bench's reading of `#panel`'s position, says so.

import { Drawer } from 'vaul';
import { FULL_FRACTION, HALF_FRACTION, RowsReact } from './content';
import type {} from './harness';

const rows = RowsReact(50);

export function VaulApp() {
  return (
    <Drawer.Root
      snapPoints={[HALF_FRACTION, FULL_FRACTION]}
      shouldScaleBackground={false}
      onOpenChange={(open) => window.__bench.reportOpen(open)}
    >
      <Drawer.Trigger id="trigger">Open</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="backdrop" />
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
