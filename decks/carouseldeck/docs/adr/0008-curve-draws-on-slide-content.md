# Curve draws on the slides' content, in contained slides

Curve leaves the slides in the deck's flow, untransformed, and draws the arc
on their content with CSS on `--deck-slide-progress` (renamed by ADR-0010):
each slide's children turn about their centre and drop across the axis onto a
circle, and the slide fades. The slide boxes are where the flow put them, so the engine and the
browser measure and snap exactly as without the curve, with the consumer's
alignment and pages: no geometry is set inline, and ADR-0003 holds with no
exception.

A transformed box counts toward its scroll container's scrollable overflow.
Turning the slides themselves made a deck that fits scrollable, moved the end
of the scroll range while a deck dragged, so it came to rest off its snap
points, and let focus scroll the viewport across the axis after a dropped
slide, though that axis is `overflow: hidden`. So each curve slide has
`contain: layout`, set inline as structure: its content's overflow is then ink
overflow, drawn but never scrollable. `overflow: clip` with a wide
`overflow-clip-margin` was considered, but Chromium still counts content
inside the margin toward the viewport's scrollable overflow.

Layout containment has costs of its own. Each curve slide is always a stacking
context and the containing block for its `position: fixed` descendants, so a
fixed element inside a slide is positioned against the slide, not the viewport.

The cost is that the curve is drawn on the slide's children, not the slide.
A slide's own background and border stay flat, and several children each turn
about their own centre. A curve slide is best given one child that fills it,
styled as the slide is seen.

Snap targets (ADR-0007) were considered. Fade needs them because it stacks the
slides with `position: sticky`, and a sticky slide cannot be a snap target. A
curve deck on snap targets would lose the consumer's slide size and gap, and
would need another way to lay the slides out along the axis.

The radius is a custom property, `--deck-curve-radius`, in slides, not an
option: CSS can change it per breakpoint (ADR-0003), and one stylesheet serves
every curve deck on a page. A length would need CSS to divide two lengths to
find a slide's turn, which browsers do not all support. In slides, the arc
scales with the deck. A radius of 0 or less is taken as a thousandth of a
slide, so it neither divides by zero nor flips the arc.

The dropped content overflows the viewport across the axis, where the viewport
clips it (`overflow: hidden` across the axis, as `clip` cannot pair with
`auto`), so the arc is never drawn outside the deck.

Server HTML carries each slide's starting progress, so a curve deck draws
its arc before hydration (amended for #125; see ADR-0011).

## Curve also orders its slides, and a consumer can fade them by visibility (amended for #179)

Curve now orders its slides as well as drawing them: a zero-specificity
`z-index` rule on `--deck-slide-progress`, highest at the focal position,
lower as the distance from it grows, the same on both sides, following the
stack effect's shape (ADR-0012). Each curve slide is already a stacking
context of its own, from the layout containment above, so `z-index` applies
to it with no further change.

The opacity fade stays the radius's by default, but a consumer can switch it
to follow the viewport instead: `--deck-curve-fade-view: 1` fades a slide by
how much of it is in the viewport (ADR-0014's `--deck-viewport-span`),
restoring the fade keen-slider gave before the move to curve. A keyword
switch would need style queries, which Firefox lacks, so the switch is a
plain number, consistent with the radius's own `--deck-curve-radius`.

The switch assumes a slide is one step wide (`--deck-viewport-step`), the
gap left out: CSS cannot otherwise turn the slide's own width into the same
unit `--deck-viewport-span` counts in (ADR-0014), and the error this leaves,
at most half the gap's share of the step, is small next to a typical gap.
It also assumes `scroll-snap-align: center`, the curve recipes' own
alignment: there, the viewport's two edges sit at
`--deck-viewport-span / 2` on either side of the focal position. At
`start` or `end` the edges sit elsewhere in the same unit (the viewport's
near edge at the focal position itself, the far one a whole
`--deck-viewport-span` away), and the switch does not correct for either:
a consumer snapping at `start` or `end` who wants the viewport-based fade
needs their own CSS on `--deck-viewport-span` and `--deck-slide-progress`.
