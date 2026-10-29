# drawerdeck

## 0.1.0-beta.1

- `@drawerdeck/react-18` is new: it builds `@drawerdeck/react`'s own source
  for React 18, the way `@carouseldeck/react-18` does for carouseldeck. On
  React 18, install it in place of `@drawerdeck/react`.
- A mouse drag's eased throw back to a snap point no longer re-snaps
  mid-flight. Released partway through the throw, the drawer used to flash
  and sometimes close instead of springing back to where it was headed.
- The engine skips a `--drawer-progress` write when the value has not
  changed, instead of writing it on every scroll frame regardless.
- Where the browser supports `animation-timeline: scroll()` (Chromium and
  Safari today), `Drawer.Backdrop`'s dim now runs off a native scroll
  timeline instead of per-frame JavaScript. `Drawer.Viewport` sets a
  `--drawer` scroll timeline, and `Drawer.Popup` sets
  `timeline-scope: --drawer` and `--drawer-first-snap` (the pixel offset of
  the first snap point) so a sibling such as `Drawer.Backdrop` can animate
  against the drag with its own `@keyframes`. See the "Style the backdrop"
  guide. Firefox, which does not support scroll-driven animations yet,
  keeps the `--drawer-progress` custom property as its fallback.
- The docs add a comparison page against vaul, Base UI's Drawer and React
  Aria's Sheet: a feature table sourced from each project's own docs, and
  bench numbers from a CI run that is re-run before every drawerdeck
  release.
