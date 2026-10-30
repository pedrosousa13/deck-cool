---
title: drawerdeck
label: Introduction
description: 'Documentation for drawerdeck, a headless drawer for React 19 built on native scrolling, from the bottom or any other side.'
---

A headless drawer for React 19, built on native scrolling, opening from the
bottom or any other side ("Open from a side"). The sheet sits in a
scroll-snap container: the browser drags, flings and settles it at its snap
points, the way it already scrolls a page.
`Drawer.Popup` renders a `<dialog>`, which gives the top layer, focus
trapping, an inert page behind it and Escape, with no portal to manage. You
compose the drawer from parts that need no stylesheet, and style it with
plain CSS.

`@drawerdeck/core` and `@drawerdeck/react` are placeholders today: this site
documents the beta API proposed in #234, which #240 is building.

## License

MIT
