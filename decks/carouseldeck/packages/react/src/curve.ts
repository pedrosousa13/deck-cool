import type { Effect } from './index.js';

// Slides of the curve deck, the progress of each, from
// `--deck-slide-progress`, which Deck.Slide gives each slide from the first
// render, server HTML included, and the engine writes once it measures; where
// it is unset, 0: flat. The curve is drawn on a slide's content, its
// children: the slide box stays in place.
const slide = '[data-carouseldeck-effect=curve]>[data-carouseldeck-slide]';
const content = `${slide}>*`;
const p = 'var(--carouseldeck-curve-progress)';
const r = 'var(--carouseldeck-curve-radius)';
// Where the slide is on the circle, as the sine of its turn: -1 and 1 are a
// quarter turn either way, where a slide as far as the radius or further
// stands.
const x = 'var(--carouseldeck-curve-x)';
const turn = 'var(--carouseldeck-curve-turn)';
// How far the slide drops from the focal slide's line, in slides.
const drop = 'var(--carouseldeck-curve-drop)';
const sign = 'var(--carouseldeck-curve-sign)';

// The circle's radius, in slides, where `--deck-curve-radius` is not set.
const RADIUS = 4;
// A radius of 0 would divide by zero, and a negative one flip the arc, so the
// radius is at least a thousandth of a slide, the precision the engine writes
// progress at: there, every slide but the focal one has turned a quarter.
const MIN_RADIUS = 0.001;

// abs() spelled with max() for older browsers: shared by both fades.
const abs = (v: string) => `max(${v},-1*${v})`;
const absP = abs(p);
// The radius-based fade, today's: 1 at the focal position, 0 a radius away.
const radiusFade = `(1 - ${abs(x)})`;
// Opt into a fade that follows the viewport instead of the radius with
// `--deck-curve-fade-view: 1` (#179); a keyword switch would need style
// queries, which Firefox lacks, so the switch is a plain number. 0, its
// default, keeps the radius-based fade.
const fadeSwitch = 'clamp(0,var(--deck-curve-fade-view,0),1)';
// 1 once `--deck-viewport-span` has been measured, 0 before: span is never
// negative, so a sentinel of -1 reads as "unset" through the same step
// trick the stack effect uses, a clamp with a large multiplier, rather than
// sign(): older Chromium (before 138) lacks sign(), which would make the
// whole opacity declaration invalid at computed-value time and leave every
// curve slide at opacity 1, switch off included.
const spanMeasured = 'clamp(0,(var(--deck-viewport-span,-1) + 1)*1000000,1)';
const fadeByView = 'var(--carouseldeck-curve-fade-by-view)';
// A slide is approximated as one step wide (--deck-viewport-step), the gap
// left out: its own half-width is then always 0.5, the same unit
// --deck-viewport-span counts in, and the viewport's own half-width is
// --deck-viewport-span / 2. Fully opaque while at least half the slide is in
// view (its centre within half-view of the focal position), 0 once it is
// fully out (half-view + 0.5 away): clamp(0, span + 1 - 2·|progress|, 1).
const viewFade = `clamp(0,calc(var(--deck-viewport-span,0) + 1 - 2*${absP}),1)`;

const css =
  `:where(${slide}){` +
  '--carouseldeck-curve-progress:var(--deck-slide-progress,0);' +
  `--carouseldeck-curve-radius:max(var(--deck-curve-radius,${RADIUS}),${MIN_RADIUS});` +
  `--carouseldeck-curve-x:clamp(-1,${p}/${r},1);` +
  `--carouseldeck-curve-turn:asin(${x});` +
  `--carouseldeck-curve-drop:calc(${r}*(1 - sqrt(1 - ${x}*${x})));` +
  '--carouseldeck-curve-sign:1;' +
  `--carouseldeck-curve-fade-by-view:calc(${fadeSwitch}*${spanMeasured});` +
  `opacity:calc(${fadeByView}*(${viewFade}) + (1 - ${fadeByView})*${radiusFade});` +
  // Highest at the focal position, lower as the distance from it grows, the
  // same on both sides (#179), following the stack effect's shape
  // (ADR-0012).
  `z-index:calc(1000 - ${absP}*10)}` +
  `:where(${slide}:dir(rtl)){--carouseldeck-curve-sign:-1}` +
  // Rotation is about the content's centre, and the drop is across the axis.
  // A drop in slides is a percentage of the content's width, a slide's where
  // the content fills it; turned a quarter, a translateX moves it down by
  // that.
  `:where(${content}){transform:rotate(90deg) translateX(calc(${drop}*100%)) rotate(-90deg) rotate(calc(${sign}*${turn}))}` +
  // Vertical, the arc bends toward the inline end, by the content's height.
  `:where([data-orientation=vertical]${content}){` +
  `transform:rotate(-90deg) translateY(calc(${sign}*${drop}*100%)) rotate(90deg) rotate(calc(-1*${sign}*${turn}))}` +
  // No motion but the scroll's own: the slides stay flat and only fade.
  `@media (prefers-reduced-motion:reduce){:where(${content}){transform:none}}`;

/**
 * Fans the slides along an arc around the focal slide while the viewport
 * scrolls, snaps and drags natively (ADR-0006). Pass it to `Deck.Viewport`'s
 * `effect`:
 *
 * ```tsx
 * import { curve } from '@carouseldeck/react/curve';
 *
 * <Deck.Viewport effect={curve}>…</Deck.Viewport>
 * ```
 *
 * The slides keep their place in the deck, their size, gap and alignment, and
 * snap as they would without the curve, in pages too. Each slide's content,
 * its children, turns about its centre and drops across the axis to sit on a
 * circle under the focal slide, and the slide fades with its distance from
 * it, following its progress. Give each slide one child that fills it, styled
 * as the slide is seen: a slide's own background stays in place, and several
 * children each turn about their own centre. The circle's radius, in slides,
 * is `--deck-curve-radius`, 4 by default and never 0 or less: set it in CSS
 * on the viewport, per breakpoint if needed. A slide a radius away or more has
 * turned a quarter and faded out.
 *
 * Each slide contains its layout, so its turned content is drawn on the arc
 * but adds nothing the viewport can scroll to, and focus never scrolls the
 * viewport after it. The viewport clips across the axis, so the arc never
 * shows a scrollbar: give it padding there to show more of the arc. A
 * vertical deck's arc bends toward the inline end, and a right-to-left deck's
 * mirrors. Under reduced motion the content stays flat
 * and the slides only fade.
 *
 * The slides paint by distance from the focal slide, highest on top, the
 * same on both sides, in the same zero-specificity rules as the rest of its
 * CSS: your CSS overrides it.
 *
 * Set `--deck-curve-fade-view: 1` to fade a slide by how much of it is in
 * the viewport instead of its distance from the focal slide: fully opaque
 * while at least half of it is in view, 0 once it is fully out. Before
 * the deck has measured, the radius-based fade stands.
 */
export const curve: Effect = {
  name: 'curve',
  css,
  layout: (orientation) => ({
    // Across the axis, the arc is clipped rather than scrolled.
    viewport:
      orientation === 'vertical'
        ? { overflowX: 'hidden' }
        : { overflowY: 'hidden' },
    // The content's overflow, turned and dropped, is then ink overflow: drawn,
    // but never part of what the viewport can scroll, along the axis or
    // across it.
    slide: { contain: 'layout' }
  })
};
