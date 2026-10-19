# Findings: can a viewport bleed past its column in CSS alone? (#188)

THROWAWAY prototype, kept for the record. It answers #188: whether a
carouseldeck viewport can bleed past a centred column in CSS alone, and
what fade, stack, curve and loop do under it, with evidence from real
Chromium, Firefox and WebKit. It ships no `@carouseldeck/*` package
source change.

The recipe tested throughout, on a full-width page holding a narrower
centred column:

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

`--inset` is computed once, from a container query unit and the column's
own literal width, and read the same way by all three properties. This
matters: see question 1.

The committed evidence is `apps/storybook/stories/bleed.stories.tsx` (the
`Bleed` stories: `Plain`, `Fade`, `Stack`, `Curve`, `Loop`, `LoopShells`,
`LoopPlainBoundary`) and `e2e/bleed.spec.ts`, which drives the stories that
settle in Chromium, Firefox and WebKit through `pnpm verify`'s own
`test:e2e`. The probes in this folder answer the rest; `README.md` says how
to run each one.

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
viewport's containing block (the column); `scroll-padding-inline`'s
resolves against the viewport's own scrollport (the CSS Scroll Snap
module, "Scroll Padding": percentages are relative to the scrollport),
which is the bled width, not the column. A 1000px page with a 400px column
(inset 300px) and the naive `%` recipe reports an unresolved
`scrollPaddingInlineStart` of `calc(-50% + 484px)`, whose used value is
0px, not 284px (Storybook's own preview wrapper carries a 16px edge
margin, so the real inset there is 284px, not 300). The engine then rests
the deck at `scrollLeft: 284` on mount instead of `0`, so the first slide
renders flush with the page's edge, not the column's. This follows from
the CSS specification, not an engine quirk, so it is identical in
Chromium, Firefox and WebKit.

**The fix** computes the inset once, from `cqi` and the column's own
literal width (no `%` anywhere), into a custom property, and reads that
property identically in all three declarations (shown above). Checked with
`sticky-padding-probe.mjs`'s scroller B (the naive recipe applied directly
on a scroller, not the fixed one) and with the fixed recipe against a live
story before the fix landed: with the fix, `scrollPaddingInlineStart`
resolves cleanly, `scrollLeft` rests at `0`, and the first slide's
`getBoundingClientRect().left` matches the column's, in Chromium, Firefox
and WebKit.

**The recipe's limit.** The column's width has to be restated, as a plain
value, inside `--inset`. CSS has no way to ask "how wide is my ancestor"
other than writing that ancestor's own width expression a second time. A
fixed column is one literal (`400px` above); a fluid column needs its
whole expression repeated:

```css
.column {
  width: min(90cqi, 960px);
  margin-inline: auto;
}
.column .viewport {
  --inset: calc((100cqi - min(90cqi, 960px)) / 2);
  margin-inline: calc(-1 * var(--inset));
  padding-inline: var(--inset);
  scroll-padding-inline: var(--inset);
}
```

Nothing keeps the two declarations in sync: a breakpoint or a redesign
that changes the column's width (`max-width`, `min()`, a plain `%`) has to
change `--inset` by hand, in the same edit. This is a limit of the recipe
itself, not a browser difference and not something #177 can design away;
it is worth saying plainly in whatever #177 ships.

**Snapping and the index**, checked against the real `@carouseldeck/react`
package (the `Plain` story, committed as `e2e/bleed.spec.ts`'s
`bleed--plain` tests):

| Engine   | Next x3                                                                               | Dots    | Arrow key                           | Drag    | Index                                     |
| -------- | ------------------------------------------------------------------------------------- | ------- | ----------------------------------- | ------- | ----------------------------------------- |
| Chromium | aligned to column after every press                                                   | aligned | aligned                             | aligned | `data-index` increments 1, 2, 3 correctly |
| Firefox  | aligned (needs the browser's own settle time, about 1.2s, between presses; see below) | aligned | aligned                             | aligned | same                                      |
| WebKit   | aligned                                                                               | aligned | aligned (one press only; see below) | aligned | same                                      |

Two timing notes, neither bleed-specific: Firefox's smooth-scroll
animation after a press reports `data-index` and the settled position
later than Chromium's or WebKit's (a 400ms wait between presses reads a
stale `data-index` of `0` three times running; a 1200ms wait reads `1`,
`2`, `3` correctly, with the current slide's edge exactly on the column
each time). WebKit's native, unsnapped arrow-key scroll (ADR-0013) chains
onto an earlier one not yet settled, the same way a flick's momentum does:
20 presses, 80ms apart, jumps straight from index 0 to index 4 (skipping
1 to 3) and rests on a slide near the end of the run, which cannot align
flush with the column for the same reason the very last page of a
multi-slide-per-view deck never can, bleed or not. One held press, let to
settle, lands correctly: `data-index: 1`, `current.left` equal to the
column's, after a single `ArrowRight` and a wait. The committed test
presses once.

## Question 2: fade and stack under the padding

**They already stick at the column's content edge, not the page: no
stacked-layout change is needed.** `stackedLayout`
(`packages/react/src/stacked.ts`) sets each sticky slide's
`inset-inline-start: 0` (or `top: 0`, vertical), unchanged from today. CSS
resolves that inset against the viewport's own padding box, which already
includes `padding-inline-start`: the slide sticks at the padding box's own
content edge, which the bleed recipe has already put at the column, not
at the raw scrollport edge #177 expected.

**Checked two ways.** First, `sticky-padding.html` and
`sticky-padding-probe.mjs` reproduce `stackedLayout`'s own grid technique
(a slide's grid area spans every column, `1 / -1`, so its containing block
is the whole grid, not one track; `justify-self: start` and an explicit
width then place it within that, exactly as the real code does), swept
across a 400px scroll range in Chromium, Firefox and WebKit: a plain,
non-sticky control box moves with the scroll exactly as expected (its own
left edge tracking the scroll position 1:1, confirming the containing
block is not itself clipping anything), while the sticky box
(`inset-inline-start: 0`) holds fixed at the column's own left edge
(`300px` in the probe's own geometry) for every scroll position from 0 to
400px, in all three engines identically.

Second, the real `@carouseldeck/react` `fade` and `stack` effects
(`bleed--fade`, `bleed--stack`), navigated with Next: the focal slide's
`getBoundingClientRect().left` stays exactly equal to the column's left
edge after 1, 2, 3 and 4 presses, in Chromium, Firefox and WebKit, with the
library unchanged. Committed as `e2e/bleed.spec.ts`'s `bleed--fade` and
`bleed--stack` sticky tests.

**#177's proposed fix was prototyped and found wrong.**
`sticky-padding-probe.mjs`'s scroller B gives the sticky slide the
viewport's own `--inset` as its `inset-inline-start`, #177's own
suggestion. It overshoots the column by exactly one inset's width (`600px`
instead of `300px` at rest, a 300px overshoot matching the probe's own
inset) in Chromium and WebKit; Firefox matches at rest and only diverges
once scrolled far enough to reach the end of its own sticky range, a
detail of that probe's grid, not of the fix. The same change against the
real `fade` and `stack` stories (not committed, reverted before any gate
ran), `stackedLayout`'s `insetInlineStart: 0` reading the bled viewport's
own `--inset` instead, overshoots the column the same way, in all three
engines. Adding the padding to an inset that already respects it doubles
the offset. This "fix" regresses a case that works today, and should not
be made.

**Why the reporter of #177 may have seen it differently.** #177 says fade's
sticky slides stick to the scrollport edge, not the padding edge, which
this prototype's own recipe does not reproduce in any of the three
engines. Two things could explain the difference, neither confirmed here:
#177's own bleed CSS may measure and apply the inset with JavaScript
(`margin-inline` and `padding-inline` written from a `ResizeObserver`,
per the issue body) rather than the CSS-only recipe above, which could
land the two properties a frame apart, or inconsistently, in a way this
prototype's single CSS declaration cannot; or #177 was observed in an
older engine version than the three this prototype drives. Both are
guesses: this prototype does not reproduce #177's own JavaScript bleed, so
it cannot say which, or whether either is the real cause.

## Question 3: curve under the padding

Curve draws and clips as expected. It sets no geometry inline but
`contain: layout` (ADR-0008), so the padding reaches it exactly as it
reaches a plain deck: the slides snap within the column, and the arc draws
on their content, unaffected by the bleed.

**Checked** (`bleed--curve`, committed as `e2e/bleed.spec.ts`'s "keeps its
scroll range under the bleed padding" test): the viewport's own
`scrollWidth`, its scrollable range, is identical before and after a Next
press (`1531px`, unchanged) in Chromium, Firefox and WebKit, confirming the
turned, dropped content adds no extra scrollable overflow under the
padding, the same guarantee `contain: layout` already gives without it.
Each slide's `--deck-slide-progress` advances by exactly 1 between
consecutive slides after a press, in all three engines. A screenshot (not
committed) shows the fan and fade rendering inside the column with no
visible clipping at the bled edges.

**One authoring note, unrelated to the bleed CSS itself.** Curve needs the
one-child-per-slide "card" shape ADR-0008 documents: a slide's own box
stays flat, and its content turns. An early draft of the `Curve` story
reused the generic, narrow, multi-slide-per-view markup `Plain`, `Fade`
and `Stack` share; its focal slide's measured `--deck-slide-progress` came
back as `2.598`, not near `0`, fading it to `opacity: 0.35` and failing an
axe contrast check even at rest. Switching to curve's own documented
shape (one centred slide in view, one filling "card" child, matching
`deck.stories.tsx`'s own `Curve` story) resolves it: the focal slide's
progress settles near `0` and the axe check passes in all three engines. A
curve deck should use the documented card shape regardless, bled or not.

## Question 4: loop shells and copies under the padding

**Shells place correctly. Copies can crash, and the crash needs the
bleed.**

**Shells** (`bleed--loop-shells`, 12 slides, a run long enough that
ADR-0013's own fallback never applies): a real slide's shell is measured
and positioned from the real slides' own boxes, which already sit in the
column, so it inherits the bleed with no change. Checked by wrapping
around with Prev from index 0: the wrapped-to slide's left edge matches
the column's exactly, in Chromium (`300.375px`), Firefox (`300px`) and
WebKit (`300.375px`) alike (sub-pixel differences only). Committed as
`e2e/bleed.spec.ts`'s "wraps around onto the column" test.

**Copies** (`bleed--loop`, 6 slides, short enough that ADR-0013 falls back
to copies) crash. `DeckEngine`'s own "is there room to loop" check
(`snapPoints`, `packages/core/src/index.ts`) compares the slides' run
length against the viewport's own measured scrollport size, the bled
width, gutters included. That comparison itself is not the bug: with
bleed, the gutters are visible past the column, so reading the full bled
scrollport is the correct measurement for "is there room to loop", the
same as it is for a plain deck. Once the bled scrollport is about as wide
as the slides' whole run, though, a separate check, the shells-or-copies
fallback (`fallbackToCopies`), stops agreeing with it from one settle to
the next, and the deck never finishes rendering: React throws "Maximum
update depth exceeded", from `keepPlace` calling `restOn`, which calls
`settle`, which calls `publish`, which calls the viewport's
`onIndexChange`-driven `setState`, repeatedly.

**Reproduced precisely and across all three engines, with `width-sweep.mjs`.**
Against `bleed--loop` (400px column, 6 slides, run length about 979px
measured from the first and last real slide's boxes), a page width of
1010px settles normally in Chromium, Firefox and WebKit; 1011px, one
pixel more, never settles in any of the three (Chromium and WebKit log
"Maximum update depth exceeded"; Firefox times out with the same symptom,
without that exact console message). Every width tried above 1011, up to
1400px, fails to settle too. The boundary is a single pixel and
repeats on every run.

**Does an unbled loop deck crash the same way? No.** `fallbackToCopies`
runs whenever a loop's run is about as wide as its viewport, bled or not,
so the question is whether a plain, unbled loop deck, at the same run
length and viewport width, crashes too. `crash-boundary.mjs` answers it:
`bleed--loop` against `LoopPlainBoundary`
(`apps/storybook/stories/bleed.stories.tsx`), a control story with the
identical run length (six 145px slides, 16px gaps, about 966px) and no
bleed CSS at all, its viewport simply `width: 100%`.
At the exact widths that crash `bleed--loop` (1011px and 1050px), in
Chromium, Firefox and WebKit alike, `LoopPlainBoundary` settles cleanly
every time. A broader sweep of `LoopPlainBoundary` alone, from 600px to
1200px (through shells mode, through copies mode, and past the point
where it stops looping at all), finds no crash and no case that fails to
settle, in any of the three engines. The same check against a shorter,
narrower control (three 150px slides, no bleed, run length about 498px,
swept from 400px to 600px) also finds none.

The difference, read from the engine with temporary, uncommitted logging
(reverted before any gate ran; never present in `packages/*/src` here):
at the boundary, `snapPoints` correctly and stably decides there is
"nothing to loop" (`sets: 0`) from the very first settle, in both the
bled and the unbled deck. `fallbackToCopies`, though, re-reads the DOM
itself and, where a shells `placement` object from an earlier settle has
not yet been cleared, uses that stale object's own length instead of the
fresh, correct one. In the unbled decks tested, this disagreement either
never arises (the short, 498px-run deck never entered shells mode in the
range swept) or clears within one or two settles and then stays clear.
In the bled deck, it does not clear: `copies` alternates `true` and
`false` on every settle, each toggle adding or removing copies markup
from the DOM, for as long as the probe watches (54 settles in under five
seconds, still alternating). This is a defect of its own, in
`fallbackToCopies`'s and `snapPoints`'s disagreement about whether a
shells `placement` is still live, not of the bled-width measurement
question 4 first raises, and it needs its own issue to fix. **It is
bleed-specific in every case this prototype reproduces: no unbled
deck, at any run length or viewport width tried, failed to settle.**

**Fixed in #196, which corrects the account above.** Instrumenting the
engine (never committed) found the disagreement was not only
`fallbackToCopies`'s own: `snapPoints`'s "nothing to loop" reading was not
steady across the drop to neither shells nor copies after all. It read the
run's length from whichever markup was currently mounted, and a plain DOM,
under the bleed, measures real scrollable room (the padding's own
contribution to it) that neither shells' nor copies' own reading sees, so
`count` itself flipped between one snap point and several, forever, toggling
loop's own markup back and forth with it; that flip, not only
`fallbackToCopies`'s, is what never let the unbled control's own brief
disagreement happen under the bleed. The fix reads the run from the real
slides alone, once a deck has ever shown shells or copies, the same way
regardless of which of the three is currently mounted (ADR-0013, "Settling
never depends on which it currently renders"). `bleed--loop` now settles,
and is in `e2e/bleed.spec.ts`'s axe loop.

**Not committed as a test.** `LoopPlainBoundary`'s story stays,
undemonstrated by any test of its own: no test opens it, since it is not a
recipe demo, only a probe target for `crash-boundary.mjs` and
`width-sweep.mjs`.

## Question 5: server HTML and layout shift

No layout shift from the bleed recipe, in any of the three engines,
because none of it depends on JavaScript. The inset is `cqi`-and-`calc()`
CSS, resolved at layout time; nothing measures anything to compute it.

**Checked by rendering the real package server-side with no browser at
all**, then loading that exact HTML with JavaScript disabled, so nothing
hydrates or measures afterward either. `render-ssr.mjs` uses Vite's own
SSR module runner to import `packages/react/src/index.tsx` directly and
call `renderToStaticMarkup` on a `Deck.Root`/`Deck.Viewport`/`Deck.Slide`
tree wrapped in the bleed CSS, writing the result to `ssr.html`
(gitignored; regenerate it with this script). Loaded with
`check-ssr.mjs` (`browser.newContext({ javaScriptEnabled: false })`), the
first slide's `getBoundingClientRect().left` already matches the column's
left edge exactly (`300px` against a `300px` column), in Chromium, Firefox
and WebKit alike, with no script having run at all.

Any layout shift elsewhere in the deck is the shift ADR-0003 already
documents (Dots and Counter correcting their guessed page count once the
client measures slides per view): unrelated to the bleed recipe, since
that correction depends on slide-count and breakpoint measurement that has
nothing to do with the inset, and unaffected by it either way.

## Recommendation for #177

Ship the recipe alone (question 1's fixed version, including its fluid
column caveat), with no change to `stackedLayout`: question 2's premise
does not hold against the real engine, in any of the three browsers, and
#177's own suggested fix actively breaks a case that works today.
Document a looping deck under bleed with a run long enough to stay in
shells mode (ADR-0013) as supported, and a looping deck short enough to
ever fall back to copies as unsupported under bleed, pointing at a new
issue for the copies-mode crash question 4 finds. That crash is real,
reproduces deterministically in all three engines, and is bleed-specific
in every case this prototype checked: an identical, unbled deck at the
same run length and the same viewport width does not crash, so #177 is
not the issue that needs to fix it, only the issue that needs to say, in
its own docs, not to combine bleed with a copies-mode loop until it is.
