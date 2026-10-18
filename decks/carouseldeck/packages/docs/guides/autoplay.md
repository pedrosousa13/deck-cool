---
title: Autoplay
description: 'Autoplay moves a carouseldeck deck one snap point at an interval. It pauses on hover and in a hidden tab, stops on focus, and Deck.AutoplayToggle stops it.'
---

`autoplay={5000}` moves the deck on one snap point every 5 seconds, counted
from when it comes to rest. It stops at the last snap point unless the deck
loops. Pair it with `Deck.AutoplayToggle`, placed first among the deck's
controls, so motion can always be stopped (WCAG 2.2.2):

<!-- demo:example-autoplay -->

```tsx
import * as Deck from '@carouseldeck/react';

export function Hero() {
  return (
    <Deck.Root aria-label="Highlights" autoplay={5000} loop>
      <Deck.AutoplayToggle />
      <Deck.Viewport>
        <Deck.Slide>One</Deck.Slide>
        <Deck.Slide>Two</Deck.Slide>
        <Deck.Slide>Three</Deck.Slide>
      </Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
    </Deck.Root>
  );
}
```

- A pointer over the deck, or a hidden tab, pauses it.
- Focus entering the deck, other than on the toggle, or the user moving the
  deck, stops it until the toggle starts it again. Every move through
  `useDeck()` or the `handleRef` handle counts as the user's, as a built-in
  control's does. A controlled `index` change does not: it moves the deck
  without stopping autoplay.
- A preference for reduced motion stops it from the start.
- The deck does not announce autoplay's moves, and its live region is off
  while autoplay rotates it.

The toggle carries `data-playing` while autoplay is on. Children replace its
text, so give it both states and show one with `[data-playing]` in CSS. If
autoplay stopped at the last snap point, starting it again goes back to the
first. To
autoplay on some screens only, see
[change `effect`, `loop` or `autoplay` per breakpoint](../recipes/per-breakpoint.md).
