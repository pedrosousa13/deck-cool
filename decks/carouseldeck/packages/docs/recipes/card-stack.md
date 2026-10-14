---
title: A card stack
label: Card stack
description: 'Draw a stack of cards on the stack effect: the effect orders the cards, and your CSS on --deck-slide-progress throws the top card out and brings it back in at the back.'
---

`stack`, from `@carouseldeck/react/stack`, gives the cards their order and
nothing else. The focal card is on top, the cards after it are behind it in
order, and a card leaving drops behind every card halfway through, so it can
come back in at the back. It sets no transform, colour or opacity. The look
depends on your card's size and design, so it is your CSS, on
`--deck-slide-progress`.

This recipe draws a stack where the cards behind the top one are smaller and
dimmer by depth and peek out above it. Next, in the card, throws the top card
out to the side, clear of the stack, and brings it back in at the back.

```tsx
import * as Deck from '@carouseldeck/react';
import { stack } from '@carouseldeck/react/stack';

const cards = [
  { title: 'Draft', text: 'Write it down before it slips away.' },
  { title: 'Review', text: 'Read it again tomorrow, with fresh eyes.' },
  { title: 'Ship', text: 'Send it out, then start the next one.' }
];

export function Cards() {
  return (
    <Deck.Root aria-label="Steps" className="cards" loop>
      <Deck.Viewport effect={stack}>
        {cards.map((card) => (
          <Deck.Slide key={card.title}>
            <div className="card">
              <h3>{card.title}</h3>
              <p>{card.text}</p>
              <Deck.Next>Next</Deck.Next>
            </div>
          </Deck.Slide>
        ))}
      </Deck.Viewport>
    </Deck.Root>
  );
}
```

Each slide holds one `.card`, which the CSS below draws. Every card but the
top one is inert, so only the top card's Next can be pressed.

## From progress

A card's progress is 0 on top, 1 for the card just behind it, 2 for the next,
and runs from 0 to -1 as the card leaves. The CSS derives three custom
properties from it:

- `--exit`, how far the card has been thrown, from 0 on top to 1 when it has
  gone.
- `--return`, how far it has come back in, from 0 at halfway to 1 when it has
  landed.
- `--depth`, its place in the stack: its progress behind the top card, and on
  the way back in, a depth that grows with `--return` to the back of the
  stack, one less than `--deck-slide-count`, the number of slides.

Two transforms are built on them, so you can change either alone:
`--thrown`, the throw, on `--exit`, and `--behind`, the look of a card behind
the top one, on `--depth`.

## The throw

The card moves out toward the inline start by `sin(exit × 180°)` of
`--throw`: clear of the stack by 16px halfway, tilted 6deg, and back in place
as it lands. Halfway, the effect drops the card behind the stack, so on the
way back in it slides under the other cards. In a right-to-left deck, the
inline start is the right, so `--start` flips the throw.

## Depth

Behind the top card, each card is 14px higher and 6% smaller per step of
depth, and dimmer, with `filter: brightness()`: opacity would show the cards
through one another. The thrown card's depth grows on its way back in, so it
shrinks and dims into place at the back.

## Loop

The stack needs `loop` for the thrown card to become the last. With loop,
each card mounts once (ADR-0013): once thrown past the engine's own
precision of -1, its progress wraps round to the slide count less a sliver,
so it arrives at the back of the stack as itself, never a copy.
`--deck-slide-count` does not count shells or copies, so it reads the same
throughout. Without loop, a thrown card leaves the stack, and the stack runs
down to the last card.

## What is shown

The cards do not fade. A card outside the stack is hidden outright: one
thrown all the way, below progress -0.998, and one still due at the back,
above 2.001 (in a deck of three). The engine writes progress in whole
thousandths of a slide, and the two windows meet exactly where loop wraps a
thrown card's progress back to the slide count (ADR-0013, `b = -0.9985`), so
every frame shows the card in exactly one of the two places, never both. A
scroll can rest a thousandth short of a snap point, as Firefox's does: with
both hidden there, the stack would show a hole at the back, and with both
shown, its shadow would darken for a moment.

## Reduced motion

Under reduced motion, `--exit` is a step: the top card stays in place and
cuts to the back halfway, with no throw.

## Room for the throw

At its furthest, the thrown card is a card's width plus 16px beside the
stack. Leave the viewport that much room. The stack is centred here, so the
room is on each side: about three cards' width in all, 872px for these
280px cards. Overflow toward the inline start never scrolls, so a narrower
viewport clips the throw.

[example: card-stack.css]: https://github.com/pedrosousa13/deck-cool/blob/main/decks/carouseldeck/apps/storybook/stories/recipes/card-stack.css

```css
/* Each slide fills the viewport, as stack lays them out: centre its card. */
.cards [data-carouseldeck-viewport] {
  height: 320px;
}
.cards [data-carouseldeck-slide] {
  display: grid;
  place-items: center;
}
.cards .card {
  /* From progress: how far the card has been thrown (0 to 1); how far it
     has come back in, past halfway (0 to 1); and its depth in the stack,
     which on the way back in grows to the back, one less than the count. */
  --p: var(--deck-slide-progress);
  --exit: clamp(0, -1 * var(--p), 1);
  --return: clamp(0, var(--exit) * 2 - 1, 1);
  --depth: calc(
    max(var(--p), 0) + var(--return) * (var(--deck-slide-count) - 1)
  );
  /* Thrown toward the inline start: at its furthest, halfway, clear of the
     stack by 16px and tilted 6deg; back in place as it lands. */
  --start: -1;
  --throw: calc(100% + 16px);
  --thrown: translateX(
      calc(var(--start) * var(--throw) * sin(var(--exit) * 0.5turn))
    )
    rotate(calc(var(--start) * 6deg * sin(var(--exit) * 0.5turn)));
  /* Behind: higher and smaller by depth, so each card peeks out above the
     one in front of it. */
  --behind: translateY(calc(-14px * var(--depth)))
    scale(calc(1 - 0.06 * var(--depth)));

  box-sizing: border-box;
  width: 280px;
  padding: 24px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
  transform-origin: 50% 0;
  transform: var(--thrown) var(--behind);
  /* Dimmer by depth. Not opacity, which would show the cards through one
     another. */
  filter: brightness(calc(1 - 0.06 * var(--depth)));
  /* No fade. A card outside the stack is hidden outright: one thrown all
     the way (where its copy now sits, the same card in the same place) and
     the loop's copies waiting their turn. The engine writes progress in
     whole thousandths of a slide, and the two windows meet halfway between
     two of them: the thrown card shows down to -0.998, its copy from 2.001
     in a deck of three. So each frame shows one of them, never neither (a
     hole, where Firefox's scroll rests a thousandth short) and never both
     (a doubled shadow). */
  opacity: calc(
    clamp(0, (var(--p) + 0.9985) * 2000, 1) *
      clamp(0, (var(--deck-slide-count) - 0.9985 - var(--p)) * 2000, 1)
  );
}
.cards:dir(rtl) .card {
  --start: 1;
}
/* No throw: the top card cuts to the back halfway. */
@media (prefers-reduced-motion: reduce) {
  .cards .card {
    --exit: clamp(0, (-1 * var(--p) - 0.5) * 1000, 1);
  }
}
```

## Restyle it

Change `--behind` for another look. A fanned pile, after the cards above,
turns and shifts each card behind the top one by its depth:

[example: card-stack-fanned.css]: https://github.com/pedrosousa13/deck-cool/blob/main/decks/carouseldeck/apps/storybook/stories/recipes/card-stack-fanned.css

```css
/* A fanned pile: behind the top card, each card shifts and turns by its
   depth, alternately up-right and down-left, and grows a little. The cards
   behind stick out on both sides, so the throw clears them by 24px. */
.cards .card {
  --throw: calc(100% + 24px);
  --behind: translate(
      calc(sin(var(--depth) * 120deg) * 14px),
      calc(sin(var(--depth) * 120deg) * -10px)
    )
    rotate(calc(sin(var(--depth) * 120deg) * 9deg))
    scale(calc(1 + min(var(--depth), 2) * 0.04));
  transform-origin: 50% 50%;
}
```

Change `--thrown` to throw the card another way. Thrown up, it needs room
above the stack instead of beside it, which suits a narrow screen. It goes
its own height, the 16px gap and the cards peeking above it, so here the
cards sit at the bottom of a taller viewport:

```css
.cards [data-carouseldeck-viewport] {
  height: 420px;
}
.cards [data-carouseldeck-slide] {
  place-items: end center;
}
.cards .card {
  margin-block-end: 24px;
  --thrown: translateY(
    calc(
      -1 * (100% + 16px + 14px * (var(--deck-slide-count) - 1)) *
        sin(var(--exit) * 0.5turn)
    )
  );
}
```

The stories are `Recipes / Card Stack` and `Recipes / Card Stack Fanned`. An
end-to-end test throws the top card through a full loop and checks that
every frame shows each card once.
