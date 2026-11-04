// The real, shipped `@carouseldeck/react`, via `workspace:*` (#340, the same
// convention as decks/drawerdeck/bench/src/drawerdeck-app.tsx): `Deck.Root`,
// `Deck.Viewport`, `Deck.Slide`, `Deck.Prev`, `Deck.Next` and `Deck.Dots`,
// following carouseldeck's own React quickstart
// (tests/compare/entries/carouseldeck.tsx) and the primitives' own source
// (packages/react/src/index.tsx). No stylesheet: carouseldeck's own
// zero-specificity defaults (`deckDefaults` in that file) already size one
// full-width slide per snap point with no CSS of the consumer's, so this
// adapter imports none, the same choice the quickstart fixture makes.
//
// `loop` is this bench's own `?loop=1` toggle (content.ts's
// `loopFromQuery()`), passed straight through to `Deck.Root`'s own `loop`
// prop; it needs no justification as a "non-default" choice (every rival
// adapter here takes the same toggle).
//
// `id="viewport"`/`id="prev"`/`id="next"` and `data-bench-slide="0"` on the
// first `Deck.Slide` are this bench's own markers (scenarios.ts, harness.ts)
// -- `Deck.Viewport`, `Deck.Prev`, `Deck.Next` and `Deck.Slide` all forward
// arbitrary props to their real `div`/`button` (packages/react/src/index.tsx,
// `ComponentProps<'div'>`/`ComponentProps<'button'>`), so this is no
// different from any other prop a consumer passes through them. `Deck.Dots`
// is used as-is, unwrapped: it already renders `data-carouseldeck-dots`,
// `data-count` and `data-index` on its own (ADR-0004), which
// `main-carouseldeck.tsx`'s `dotsSelector` reads directly -- the only
// adapter here with no `BenchDots` wrapper, since carouseldeck ships this
// signal itself.
import * as Deck from '@carouseldeck/react';
import { loopFromQuery, SLIDE_COUNT, slideLabel } from './content';

export function CarouseldeckApp() {
  const loop = loopFromQuery();
  return (
    <Deck.Root aria-label="Slides" loop={loop}>
      <Deck.Viewport id="viewport">
        {Array.from({ length: SLIDE_COUNT }, (_, i) => (
          <Deck.Slide key={i} data-bench-slide={i === 0 ? '0' : undefined}>
            {slideLabel(i)}
          </Deck.Slide>
        ))}
      </Deck.Viewport>
      <Deck.Prev id="prev" />
      <Deck.Next id="next" />
      <Deck.Dots />
    </Deck.Root>
  );
}
