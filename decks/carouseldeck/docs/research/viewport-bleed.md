# Can a viewport bleed past its column in CSS alone? (#188)

A prototype for #177, ruled by the maintainer on 2026-10-18. It answers, with
evidence from real Chromium, Firefox and WebKit, whether a carouseldeck
viewport can bleed past a centred column in CSS alone, and what fade, stack,
curve and loop do under it. It ships no library change: `git diff --stat
main..HEAD -- packages/*/src` is empty.

The recipe tested throughout, on a full-width page holding a narrower centred
column:

```css
.page {
  width: 100%;
  container-type: inline-size;
}
.column {
  width: 400px;
  margin-inline: auto;
}
.column .viewport {
  --inset: calc((100cqi - 400px) / 2);
  margin-inline: calc(-1 * var(--inset));
  padding-inline: var(--inset);
  scroll-padding-inline: var(--inset);
}
```

`--inset` is computed once, from a container query unit and the column's own
literal width, and read the same way by all three properties. This matters:
see question 1.

The committed evidence is `apps/storybook/stories/bleed.stories.tsx` (the
`Bleed` stories: `Plain`, `Fade`, `Stack`, `Curve`, `Loop`, `LoopShells`) and
`e2e/bleed.spec.ts`, which drives them in Chromium, Firefox and WebKit
through `pnpm verify`'s own `test:e2e`. Throwaway probes (static HTML pages
and Playwright scripts, not committed) live under `.scratch/issue-188/` for
this session only and are described inline below with the numbers they
found.

## Question 1: can the inset come from CSS alone?

Yes, with one real pitfall. A container-query-based inset, applied as
`margin-inline: calc(-1 * inset)`, `padding-inline: inset` and
`scroll-padding-inline: inset` on the viewport, bleeds it to the page while
keeping the slides, snapping and the index exactly where they would be
without the bleed, in Chromium, Firefox and WebKit alike, provided `inset`
is computed once, from `cqi` and a literal length, and reused as a custom
property.

**The pitfall.** Writing the inset the more obvious way, repeating
`calc((100cqi - 100%) / 2)` on each property, breaks it in every engine: a
plain `%` does not mean the same thing on `padding-inline` and on
`scroll-padding-inline`. `padding-inline`'s `%` resolves against the
viewport's containing block (the column); `scroll-padding-inline`'s resolves
against the viewport's own scrollport (the CSS Scroll Snap module, "Scroll
Padding": percentages are relative to the scrollport), which is the bled
width, not the column. Probed with a static page (`.scratch/issue-188/
sticky-padding.html` holds the sticky variant; the plain-recipe variant was
checked the same way against a live story before the fix landed): with a
1000px page, a 400px column (inset 300px) and the naive `%` recipe,
`getComputedStyle(viewport).scrollPaddingInlineStart` reports the unresolved
`calc(-50% + 484px)`, whose used value is 0px, not 284px (the page carried a
16px edge margin from Storybook's own preview wrapper, so the real inset
there was 284px, not 300). The engine then rests the deck at `scrollLeft:
284` on mount instead of `0`, so the first slide renders flush with the
page's edge, not the column's, identically in Chromium, Firefox and
WebKit, since this follows from the CSS specification, not an engine quirk.

**The fix** computes the inset once, from `cqi` and the column's own literal
width (no `%` anywhere), into a custom property, and reads that property
identically in all three declarations (shown above). Probed the same way
with the fix applied: `scrollPaddingInlineStart` resolves cleanly to `284px`,
`scrollLeft` rests at `0`, and the first slide's `getBoundingClientRect().left`
matches the column's, in Chromium, Firefox and WebKit.

**Snapping and the index**, checked against the real `@carouseldeck/react`
package (the `Plain` story, committed as
`e2e/bleed.spec.ts`'s "a plain deck snaps to the column..." tests):

| Engine   | Next x3                                                                                   | Dots    | Arrow key                           | Drag    | Index                                     |
| -------- | ----------------------------------------------------------------------------------------- | ------- | ----------------------------------- | ------- | ----------------------------------------- |
| Chromium | aligned to column after every press                                                       | aligned | aligned                             | aligned | `data-index` increments 1, 2, 3 correctly |
| Firefox  | aligned (needs the browser's own settle time, ~1.2s, between presses; see the note below) | aligned | aligned                             | aligned | same                                      |
| WebKit   | aligned                                                                                   | aligned | aligned (one press only; see below) | aligned | same                                      |

Two timing notes, neither bleed-specific: Firefox's smooth-scroll animation
after a press reports `data-index` and the settled position later than
Chromium's or WebKit's (a probe with a 400ms wait between presses read a
stale `data-index` of `0` three times running; the same probe with a 1200ms
wait read `1`, `2`, `3` correctly, with the current slide's edge exactly on
the column each time). WebKit's native, unsnapped arrow-key scroll (ADR-0013)
chains onto an earlier one not yet settled, the same way a flick's momentum
does: pressed 20 times, 80ms apart, it jumped straight from index 0 to index
4 (skipping 1 to 3) and rested on a slide near the end of the run, which
cannot align flush with the column for the same reason the very last page of
a multi-slide-per-view deck never can, bleed or not. One held press, let to
settle, lands correctly (confirmed: `data-index: 1`, `current.left` equal to
the column's, after a single `ArrowRight` and a wait). The committed test
presses once.

## Question 2: fade and stack under the padding

**They already stick at the column, not the page: no stacked-layout
change is needed.** `stackedLayout` (`packages/react/src/stacked.ts`) sets
each sticky slide's `inset-inline-start: 0` (or `top: 0`, vertical), unchanged
from today. CSS resolves that inset against the viewport's own padding box,
which already includes `padding-inline-start`: the slide sticks at the
_padding_ edge (the column), not the raw scrollport edge the brief
expected.

**Checked two ways.** First, a synthetic reproduction of `stackedLayout`'s own
grid technique (a slide's grid area spans every column, `1 / -1`, so its
containing block is the whole grid, not one track; `justify-self: start` and
an explicit width then place it within that, exactly as the real code does)
in a static page (`.scratch/issue-188/sticky-padding.html`), swept across a
400px scroll range in Chromium, Firefox and WebKit: a plain, non-sticky
control box moved with the scroll exactly as expected (its own left edge
tracking the scroll position 1:1, confirming the containing block is not
itself clipping anything), while the sticky box (`inset-inline-start: 0`)
held fixed at `300px` (the column's own left edge) for every scroll
position from 0 to 400px, in all three engines identically.

Second, the real `@carouseldeck/react` `fade` and `stack` effects
(`bleed--fade`, `bleed--stack`), navigated with Next: the focal slide's
`getBoundingClientRect().left` stayed exactly equal to the column's left edge
after 1, 2, 3 and 4 presses, in Chromium, Firefox and WebKit, with the
library unchanged. Committed as `e2e/bleed.spec.ts`'s "sticky slide sticks at
the column" tests.

**The brief's proposed fix was prototyped and found wrong.** Locally (not
committed; reverted before any gate ran, confirmed by `git status --short
packages/react/src/stacked.ts` printing nothing), `stackedLayout`'s
`insetInlineStart: 0` was changed to `insetInlineStart:
'var(--carouseldeck-stacked-inset-prototype, 0)'`, and the bled viewport's
own `--inset` (above) was assigned to it, giving the sticky slide the
viewport's `padding-inline-start` as its inset, the brief's own suggestion.
Against the real `fade` and `stack` stories, in Chromium, Firefox and WebKit
alike, the focal slide overshot the column by exactly one inset's width (measured:
`584px` instead of `300px`, a 284px overshoot matching the probe's own
inset), landing well inside the bled padding on the far side. Adding the
padding to an inset that already respects it doubles the offset. This "fix"
regresses a case that works today, and should not be made.

## Question 3: curve under the padding

Curve draws and clips as expected. It sets no geometry inline but
`contain: layout` (ADR-0008), so the padding reaches it exactly as it
reaches a plain deck: the slides snap within the column, and the arc draws
on their content, unaffected by the bleed.

**Checked** (`bleed--curve`, committed as "curve keeps its scroll range
under the bleed padding" in `e2e/bleed.spec.ts`): the viewport's own
`scrollWidth`, its scrollable range, was identical before and after a
Next press (`1531px`, unchanged) in Chromium, Firefox and WebKit, confirming
the turned, dropped content adds no extra scrollable overflow under the
padding, the same guarantee `contain: layout` already gives without it. Each
slide's `--deck-slide-progress` advanced by exactly 1 between consecutive
slides after a press, in all three engines. A screenshot (not committed)
showed the fan and fade rendering inside the column with no visible clipping
at the bled edges.

**One authoring note, unrelated to the bleed CSS itself.** Curve needs the
one-child-per-slide "card" shape ADR-0008 documents (a slide's own box stays
flat; its _content_ turns). The first `Curve` story draft reused the generic,
narrow, multi-slide-per-view markup the `Plain`, `Fade` and `Stack` stories
share; its focal slide's measured `--deck-slide-progress` came back as
`2.598`, not near `0`, fading it to `opacity: 0.35` and failing an axe
contrast check even at rest. Switching to curve's own documented shape (one
centred slide in view, one filling "card" child, matching
`deck.stories.tsx`'s existing `Curve` story) resolved it: the focal slide's
progress settled near `0` and the axe check passes in all three engines.
Whether that first draft's large progress offset was itself an effect of the
bleed padding interacting with a `scroll-snap-align: start`, several-per-view
layout was not run down further; a curve deck should use the documented
card shape regardless, bled or not.

## Question 4: loop shells and copies under the padding

**Shells place correctly. Copies can crash.**

**Shells** (`bleed--loop-shells`, 12 slides, a run long enough that
ADR-0013's own fallback never applies): a real slide's shell is measured and
positioned from the real slides' own boxes, which already sit in the column,
so it inherits the bleed with no change. Checked by wrapping around with
Prev from index 0: the wrapped-to slide's left edge matched the column's
exactly, in Chromium (`300.375px`), Firefox (`300px`) and WebKit
(`300.375px`) alike (sub-pixel differences only). Committed as
`e2e/bleed.spec.ts`'s "wraps around onto the column" test.

**Copies** (`bleed--loop`, 6 slides, short enough that ADR-0013 falls back to
copies) crash. `DeckEngine`'s own "is there room to loop" check
(`snapPoints`, `packages/core/src/index.ts`) compares the slides' run length
against the viewport's own measured scrollport size, legitimately the bled
width, padding gutters included, since that is what `overflow-x: auto`
actually scrolls. Once the bled scrollport is about as wide as the slides'
whole run, that comparison and the shells-vs-copies threshold next to it can
read differently from one settle to the next, and the deck never finishes
rendering: React throws "Maximum update depth exceeded", from `keepPlace`
calling `restOn`, which calls `settle`, which calls `publish`, which calls
the viewport's `onIndexChange`-driven `setState`, repeatedly.

**Reproduced precisely and across all three engines.** A width sweep against
`bleed--loop` (400px column, 6 slides, run length about 962px measured from
the first and last real slide's boxes) found a sharp boundary: a 1000px page
settles normally; a 1050px page crashes, and every width tried above that,
up to 1400px, crashes too (`.scratch/issue-188/probe-width-sweep.mjs`). At
this suite's own default viewport, 1280x720 (`devices['Desktop Chrome']` in
`playwright.config.ts`), the crash reproduced deterministically, on every
repeated run, with the identical "Maximum update depth exceeded" message
with the same `keepPlace` / `restOn` / `settle` stack, in Chromium, Firefox
and WebKit (checked with plain Playwright scripts, not through `test:e2e`,
to isolate it from the suite's other load; see below for why it is not
committed as a passing test). This is not a story- or test-authoring
artifact: `deck--loop` (the existing, unmodified story, no bleed CSS at all)
settles normally at the same 1280x720 viewport, so the crash follows from
the bleed recipe applied to a copies-mode loop, not from anything else in
the story.

**Not committed as a test.** A crash this suite's own default viewport
reliably reaches cannot be a passing gate test: `bleed--loop`'s axe test and
wrap-around test are not in `e2e/bleed.spec.ts`'s lists. The story itself
stays, as a documented, reachable reproduction (its own doc comment explains
why), but nothing opens it.

**What this means for #177.** This is the real open risk the recipe alone
does not close, and it sits in a different place than question 2's stacked
layout: the loop engine's own room-to-loop and shells-vs-copies measurements
read the viewport's full (bled) scrollport, not the column's narrower
content width. A deck long enough to always use shells (12 slides here; the
exact threshold is ADR-0013's own, unrelated to bleed) is safe. A deck short
enough to ever need copies is not, once its page is wide enough relative to
its own run, a condition any realistic full-bleed page is likely to reach.
Two shapes #177 could take, neither validated further here (no library
change ships from #188):

- **Recipe-only, with a documented precondition:** #177 ships the fixed
  recipe (question 1) and says plainly that a looping deck only bleeds
  safely with a run long enough for shells, leaving copies-mode loop and
  bleed as an unsupported combination.
- **Recipe plus a named engine change:** teach `snapPoints`'s room-to-loop
  and shells-vs-copies checks to compare against the column's own content
  width (the viewport's size with its own `scroll-padding-inline` read out
  of it, the way `snapRest` already reads `scrollPadding` via `axis.insets`),
  rather than the raw scrollport. This looks like the more correct fix
  in the long run (it is the same "scrollport is not the useful width"
  problem the stacked layout turned out not to have), but it touches the
  engine's own measurement, is unprototyped, and needs its own verification
  against ADR-0013's existing guarantees before it ships.

My own recommendation leans toward the second shape, since the first leaves
a real, silent trap for any consumer who later shortens a bled, looping
deck's slide count past the shells threshold, but this is a judgement call
for the grilling, not a settled answer.

## Question 5: server HTML and layout shift

No layout shift from the bleed recipe, in any of the three engines, because
none of it depends on JavaScript. The inset is `cqi`-and-`calc()` CSS,
resolved at layout time; nothing measures anything to compute it.

**Checked by rendering the real package server-side with no browser at
all**, then loading that exact HTML with JavaScript disabled, so nothing
hydrates or measures afterward either. `.scratch/issue-188/ssr-render.mjs`
(deleted after the one run it needed; not committed) used Vite's own SSR
module runner to import `packages/react/src/index.tsx` directly and call
`renderToStaticMarkup` on a `Deck.Root`/`Deck.Viewport`/`Deck.Slide` tree
wrapped in the bleed CSS, writing the result to a static HTML file. Loaded
with `browser.newContext({ javaScriptEnabled: false })` (`.scratch/issue-188/
probe-ssr.mjs`), the first slide's `getBoundingClientRect().left` already
matched the column's left edge exactly (`300px` against a `300px` column),
in Chromium, Firefox and WebKit alike, with no script having run at all.

Any layout shift elsewhere in the deck is the shift ADR-0003 already
documents (Dots and Counter correcting their guessed page count once the
client measures slides per view): unrelated to the bleed recipe, since that
correction depends on slide-count and breakpoint measurement that has
nothing to do with the inset, and unaffected by it either way.

## Recommended shape for #177

A recipe (question 1's fixed version) is enough for a plain deck, fade,
stack and curve, including a looping deck long enough to stay in shells
mode. No change to `stackedLayout` is needed: question 2's premise does
not hold against the real engine, in any of the three browsers, and the
brief's own suggested fix actively breaks a case that works today.

The one real gap is question 4's: a looping deck short enough to fall back
to copies is not safe to bleed at ordinary page widths, and crashes
deterministically, not intermittently, in Chromium, Firefox and WebKit
alike. #177 needs to either document that precondition or take on the named
engine change above; shipping the recipe as if it works unconditionally with
`loop` would ship a real, repeatable crash.
