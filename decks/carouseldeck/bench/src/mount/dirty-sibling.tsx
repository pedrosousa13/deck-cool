// Writes a layout-affecting style in a layout effect, right before the deck
// instance that follows it mounts (#340's mount lessons: "a forced layout
// only costs when layout is dirty. Include a mount variant where a sibling
// component writes a layout-affecting style in a layout effect before each
// deck, alongside the clean one."). Rendered once per instance on the
// `dirty` mount variant (`mount-app.tsx`), never on the `clean` one.

import { useLayoutEffect, useRef } from 'react';

export function DirtySibling() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // A real geometry-affecting write, not merely a style property that
    // never reaches layout: `width` on a block element invalidates layout.
    if (ref.current) ref.current.style.width = `${1 + Math.random()}px`;
  });
  return <div ref={ref} style={{ height: 0, overflow: 'hidden' }} />;
}
