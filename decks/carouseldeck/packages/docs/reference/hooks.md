---
title: Hooks
description: "Reference for carouseldeck's hooks: Deck.useDeck() gives your own controls the deck's index, count and moves, and Deck.useSlide() tells a slide about itself."
---

`Deck.useDeck()`, called by any component inside `Deck.Root`, gives it the
deck's state and moves, so you can build Prev, Next, a counter or pagination
from your own components. It returns:

- `index`: the current index, the snap point the deck rests at, so a page
  when the deck snaps in pages.
- `count`: the number of snap points, or `null` until the viewport is
  measured, as on the server.
- `loop`: whether `Deck.Root` has `loop`.
- `fits`: whether every slide fits, where the built-in controls are absent.
- `canPrev` and `canNext`: whether `Deck.Prev` and `Deck.Next` are enabled.
- `scrollTo(index)`, `next()` and `prev()`: the moves of `RootHandle`. Each
  stops autoplay, as a built-in control does.

The values are the ones the built-in controls read, so your control and
theirs agree. The hook never re-renders while the deck scrolls. It re-renders
whenever `Deck.Root` does: when the deck settles somewhere new, when the
number of snap points changes and, on a deck with `autoplay`, when autoplay
starts, stops, or pauses for a pointer or a hidden tab. Called outside a
`Deck.Root`, it throws. For a full set, with a button per page, see
[custom controls and a counter](../recipes/custom-controls.md).

<!-- demo:example-hooks -->

```tsx
import type { ReactNode } from 'react';
import * as Deck from '@carouseldeck/react';

// Your design system's button.
declare function Button(props: {
  isDisabled: boolean;
  onPress: () => void;
  children: ReactNode;
}): ReactNode;

const twoDigits = (n: number) => String(n).padStart(2, '0');

function PhotoControls() {
  const { index, count, fits, canPrev, canNext, prev, next } = Deck.useDeck();
  if (fits) return null;
  return (
    <div className="photo-controls">
      <Button isDisabled={!canPrev} onPress={prev}>
        Previous photo
      </Button>
      {/* "03 / 10" */}
      <span>
        {count !== null && `${twoDigits(index + 1)} / ${twoDigits(count)}`}
      </span>
      <Button isDisabled={!canNext} onPress={next}>
        Next photo
      </Button>
    </div>
  );
}

export function Photos() {
  return (
    <Deck.Root aria-label="Photos">
      <Deck.Viewport>
        <Deck.Slide>One</Deck.Slide>
        <Deck.Slide>Two</Deck.Slide>
        <Deck.Slide>Three</Deck.Slide>
      </Deck.Viewport>
      <PhotoControls />
    </Deck.Root>
  );
}
```

`Deck.useSlide()`, called by content inside a slide, tells it which slide it
is in. It returns `{ index, copy }`. `index` is the slide's index, also inside
a loop's copy of it. `copy` is `'before'` or `'after'` in a copy, the side of
the slides it is on, and `undefined` in a slide. Use it where stateful
content must not run twice, as in the
[playdeck recipe](../recipes/playdeck-video.md). Called
outside a `Deck.Slide`, it throws.
