# Slidedeck writes only `--deck-slide-*`; the consumer sets every other `--deck-*`

Slidedeck's public custom properties go both ways. The consumer sets inputs:
the theme's tokens (`--deck-control-*`, `--deck-dot-*`, `--deck-focus-*`,
`--deck-accent`, `--deck-transition-duration`) and curve's
`--deck-curve-radius`. Slidedeck writes outputs on each slide for CSS to read
(ADR-0003). Both used the `--deck-` prefix, and the outputs were named
`--deck-progress` and `--deck-index`, so nothing kept a later output from
taking the name of a token a consumer already sets.

**Inputs and outputs keep the one `--deck-` prefix and are kept apart by
namespace. Slidedeck writes only `--deck-slide-*`. The consumer sets every
other `--deck-*`.** Both outputs sit on slides, so they are named after the
part that carries them:

- `--deck-progress` is now `--deck-slide-progress`, on every slide and copy:
  `Deck.Slide` renders its starting value, and the engine writes it from then
  on, every frame (ADR-0011, amended for #125).
- `--deck-index` is now `--deck-slide-index`, set inline by `Deck.Slide`.
- `--deck-slide-count`, added later, is the number of slides, copies not
  counted, set inline by `Deck.Slide` on every slide and copy (amended for
  the stack effect).

No alias is kept for the old names. Nothing has been published, so the
rename breaks no consumer; after the first publish it would.

Prior art names outputs the same way. Base UI writes `--anchor-width` and
`--popup-height`, and Radix `--radix-accordion-content-height`: each named
after the part that carries it. Swiper keeps one prefix for what the consumer
sets and what it writes, namespaced by module. No library surveyed uses a
separate prefix for outputs.

A separate prefix for outputs, or renaming the theme's tokens, was the
alternative. Either would split one product's properties across two prefixes
for no gain the namespace does not already give, and renaming the tokens
touches every one of them where this touches two.

A later output on a slide takes a `--deck-slide-*` name. One on another part,
such as the viewport, needs a namespace of its own, and the consumer may
already use any `--deck-*` name outside `--deck-slide-*`: that is a new
decision, not this one.

**The viewport's own namespace exists now (amended for #187).**
`--deck-viewport-step` and `--deck-viewport-span` are its first two outputs;
ADR-0014 records the decision.

Slidedeck's private working values, such as fade's and curve's, stay
`--slidedeck-*` and are never public.
