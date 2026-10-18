# deck.cool

deck.cool is the umbrella for a family of small, unstyled React packages, each named `*deck`. This repo holds every site in the family: the umbrella site at deck.cool and one site per package.

## Vocabulary

- **Deck**: one package in the family (carouseldeck, playdeck, pagedeck). Its site lives here, and its source lives either here or in its own repo.
- **In-repo deck**: a deck whose source lives in this repo, under `decks/<deck>/`. slidedeck is the first, renamed carouseldeck as it moves in. See ADR 0002.
  _Avoid_: internal deck, monorepo deck
- **Outside deck**: a deck whose source still lives in its own repo. Its site follows its releases through a bump PR (ADR 0001).
  _Avoid_: external deck, remote deck
- **Deck gates**: the checks a deck runs before a change to it lands. CI runs them only for a change that touches the deck. See ADR 0002.
- **Umbrella site**: the site at `https://deck.cool`. It lists every deck and says what each one does.
- **Package site**: a deck's own site, served at its subdomain of deck.cool.
- **Family bar**: the top bar every site shares (design direction C). The umbrella mark opens a switcher across the decks, and the product name rolls to the pick.
- **Docs package**: a deck's reference docs, published from the deck's repo as `@<deck>/docs` at the code's version: markdown pages, a `nav.json` and images. Its package site renders it under `/docs`. See `docs/docs-contract.md`.
- **Demo**: a live component on a docs page. The page marks its place with `<!-- demo:<name> -->`, and the package site owns the component.
- **Brand kit**: what every site shares: the favicons, the Family bar, the dark palette and the motion curve.

## carouseldeck

A headless carousel for React 19 built on native scroll snap: the browser
scrolls, and carouseldeck tracks where it landed and asks it to go elsewhere. A
framework-neutral core holds the engine; the React package holds the
primitives a consumer composes. The project's language separates what a
consumer composes (primitives), where the scroller can rest (snap points,
pages), which slide the deck is about (current, focal), and what carouseldeck
publishes for CSS to read (progress).

Two terms below collide with ones defined above. Inside carouseldeck, **Deck**
means one carousel instance, not a package in the family. And **Page** means a
group of slides that snap together, not a site page.

### Language

#### Composition

**Deck** (inside carouseldeck):
One carousel instance: a scroller, its slides and the controls bound to it.
Consumers import the primitives as `import * as Deck from '@carouseldeck/react'`.
_Avoid_: carousel instance, slider

**Primitive**:
An exported React component a consumer composes into a deck, such as
`Deck.Viewport` or `Deck.Next`.
_Avoid_: component, widget

**Viewport**:
The native scroll container. Scroll snap, momentum and focus scrolling all
happen here, in the browser.
_Avoid_: track, container

**Slide**:
One child of the viewport the consumer supplies. Its size is plain CSS.

**Orientation**:
The axis a deck runs along: horizontal or vertical, set by the `orientation`
prop.
_Avoid_: direction, axis mode

**Writing direction**:
Left-to-right or right-to-left, read from the document's computed `direction`.
Next moves toward the inline end.
_Avoid_: left/right for start/end

**Theme**:
The optional stylesheet `@carouseldeck/react/theme.css` that styles a deck's
controls: every rule in `:where()`, every value a `--deck-*` token the
consumer sets.
_Avoid_: skin, default styles

#### Position

**Snap point**:
A scroll position the viewport can come to rest at, as the browser computes it
from the slides' `scroll-snap-align`.

**Snap target**:
An empty element an effect lays out along the axis for each slide, and for
each copy where the deck loops, when it stacks the slides in one place, as
fade and stack do. It stands in for its slide or copy: the browser snaps to it, and
the slide's snap point, progress, focal position and in-view state are
measured from it. Not a slide.
_Avoid_: placeholder, spacer

**Page** (inside carouseldeck):
A group of slides that snap together when a deck snaps in groups. Dots and the
counter count pages; with one slide per snap point, a page is a slide.
_Avoid_: group, set (a set is loop's word: see **Copy**)

**Current index**:
The index of the snap point the viewport is resting at. What `index`,
`defaultIndex` and `onIndexChange` refer to. Where several slides share a snap
point, the first paint of a server-rendered `defaultIndex` may correct.
_Avoid_: active slide, selected slide

**Current slide**:
The first slide resting at the current index's snap point, marked
`data-current`. With one slide per snap point, the slide at the current index.
_Avoid_: active slide, selected slide

**Focal slide**:
The slide sitting at the snap alignment point — the one the deck is "about".
Distinct from the current index when several slides are in view. Exposed as
`data-focal` and `onFocalChange`.
_Avoid_: highlighted slide, active slide, centre slide

**Loop**:
Scrolling past the last snap point arrives at the first, and back, with no
visible jump.
_Avoid_: infinite, wrap-around

**Copy**:
A duplicate of a slide that loop lays out before or after the slides, inert
and `aria-hidden`, so the deck can scroll on across the seam. Loop lays out
two _sets_ of copies, one before the slides and one after, each a copy of
every slide, so a set runs as far as the slides do. Once the deck rests on a
copy it jumps a set back to the identical slide (and, at a press on the
copies, a set back before the gesture, or at a wheel event there, as it
scrolls; ADR-0009). Not a slide: indexes, Dots and Counter never count
copies. "Clone and jump" (ADR-0006) is the name of the technique; the
elements are copies. A copy renders the slide's content again, a
`Deck.Slide` of its own, a second or third time. Built in #144, loop
renders **Shells** instead; only a deck too small for a shell still renders
copies this way.
_Avoid_: clone

**Shell** (ADR-0013):
An empty box loop lays out in place of a copy: inert and `aria-hidden` like
a copy, but rendering none of the slide's content, and itself the snap
target its slide would otherwise need (see **Snap target**). The one real
slide is moved onto whichever shell sits nearest the viewport, by
`translate`, so its content mounts once instead of once per copy. Built in
#144; only a deck too small for a shell still renders copies instead (see
**Copy**).
_Avoid_: placeholder, empty copy

**Autoplay**:
The deck moving itself one snap point on, on an interval. _Stopped_ by the
user, the user moving the deck, focus entering the deck or a preference for
reduced motion, until the user starts it again; _paused_ only while a pointer
is over the deck or the document is hidden. It also stops where a step leaves
the deck at the same snap point, as at the last one of a deck that does not
loop. Autoplay that is on is _playing_, paused or not; playing and not
paused, it is _rotating_ the deck, the APG carousel's "slide rotation". Only
moves the user makes are announced.
_Avoid_: autoscroll, slideshow

#### Movement

**Move**:
A scroll carouseldeck starts toward a snap point: Prev, Next, a dot, `scrollTo`,
a new controlled `index`, a drag's release. A new move replaces the one in
flight; the user's own scroll ends it, and focus entering a slide replaces
it (ADR-0006).
_Avoid_: animation, transition

**Arrive**:
A move has arrived once the viewport is at its target snap point, before the
browser reports the scroll's end. Arrival is read from the viewport, not
stored.
_Avoid_: land, reach

**Settle**:
What the deck does when a scroll ends: it reads where the viewport rests,
jumps off a copy to its slide, and publishes the current index, slide and
focal slide, and may first move the deck onto a snap point (ADR-0006). The
only time `onIndexChange` and `onFocalChange` fire.
_Avoid_: snap, finish

**Quiet**:
No scroll event for 100ms: how carouseldeck tells a scroll has ended where the
browser sends no end event, and how a move ends when its end event never
comes. Where it would find a scroll stopped, a move short of its target or
a deck waiting to re-snap, quiet also waits for a frame to render with no
scroll event, as a browser can pause rendering while timers run; in a
hidden document, which renders none, it does not wait.
_Avoid_: debounce, idle

#### Outputs

carouseldeck writes only `--deck-slide-*` on a slide, or `--deck-viewport-*` on the viewport (ADR-0010, ADR-0014); the consumer sets every other `--deck-*`; the private `--carouseldeck-*` variables are never public.

**Progress**:
How far a slide is from the focal position, in slides, signed the way the deck
runs: 0 at the focal position, negative before it, positive after it, so 2.25
is two and a quarter slides on. When a slide sits exactly at the focal
position, every slide's progress is a whole number, unless an effect moves the
slide's box at the alignment point: scale about that point
(`transform-origin`). Published as `--deck-slide-progress` for effects to
read: React renders its starting value, counted from the slide the deck
starts at, and the engine writes it from then on. Never React state.
_Avoid_: offset, distance in pixels

**In view**:
A slide with any part showing in the viewport, partly shown included. Marked
`data-in-view`; it hides nothing. Never React state.
_Avoid_: visible, active

**Step**:
The distance from one real slide to the next along the axis (its size plus
the gap), as a plain, unitless number on the viewport, `--deck-viewport-step`,
for CSS to divide pixels by without dividing one length by another
(ADR-0014). Written at measure time only: mount, resize, a slide added or
removed, never a scroll frame. Unset before measurement, and with fewer
than two real slides.
_Avoid_: slide width, cell size

**Span**:
The viewport's size along the axis, in multiples of `--deck-viewport-step`,
as a plain, unitless number on the viewport, `--deck-viewport-span`
(ADR-0014). Unset wherever `--deck-viewport-step` is.
_Avoid_: view, slides per view, viewport size

**Effect**:
A transition built on progress while the viewport keeps scrolling natively —
fade, curve and stack are effects, not separate engines. Stack orders the
slides and ships no appearance (ADR-0012).
_Avoid_: transition mode, render mode

## Standing decisions

Made by the maintainer on 2026-10-08.

- **All sites in one repo.** The umbrella site and every package site live here, all built with Pagedeck. slidedeck's site already runs on Pagedeck, so it is ported first.
- **Addresses.**

  | Site         | Address                                                                                          |
  | ------------ | ------------------------------------------------------------------------------------------------ |
  | Umbrella     | `deck.cool`                                                                                      |
  | carouseldeck | `carousel.deck.cool` (slidedeck's old `slide.deck.cool` redirects here, #105)                    |
  | playdeck     | `play.deck.cool`. `playdeck.video` 301s to it (ruled 2026-10-10, done 2026-10-12, #65)           |
  | pagedeck     | `page.deck.cool`, with its landing page and docs merged into one site and the docs under `/docs` |

  Cloudflare's free certificate covers one subdomain level (`*.deck.cool`), so no deck gets a second level such as `docs.page.deck.cool`.

- **Dark by default.** slidedeck.pages.dev's Apple-style layout is the starting point: the system SF font stack, a 980px measure, a 52px translucent bar, pill buttons and 28px tiles.
- **The packages ship no CSS, and the sites say so.** No site shows off shared tokens or a type scale.
- **Favicons are round 2**: one card shape, arranged a different way per deck, on a dark `#1c1c1e` tile. Files in `design/favicons/`.

  | Deck         | Arrangement                                             | Accent                  |
  | ------------ | ------------------------------------------------------- | ----------------------- |
  | deck.cool    | three cards, fanned                                     | the three accents below |
  | carouseldeck | three cards in a row, the middle one in front           | `#2997ff`               |
  | playdeck     | three cards stepping down: the outline reads as play    | `#ff5c86`               |
  | pagedeck     | three stacked sections, the middle one lit (the island) | `#3ddc97`               |

  Accepted risks: at 16px pagedeck's bars can read as a hamburger menu, and carouseldeck's arrangement is close to the stock "view carousel" icon.

- **Motion.** One easing curve, `cubic-bezier(.32,.72,0,1)`. Every animation holds still under `prefers-reduced-motion`. Only Firefox animates an SVG favicon, so sites ship the still icon as the favicon and animate the icon only inside a page (the Family bar, the umbrella site's cards). pagedeck never animates its favicon by script, because that would cost JavaScript on pages that otherwise ship none.
- **formdeck is parked.** It is not ready, and stays out of every site and design until the maintainer says it is. Its design is kept in `design/favicons/parked/` and on the canvas: two cards meeting in a check mark, amber `#ffb020` with dark text on amber fills. When it is ready it gets `form.deck.cool`.
- **The umbrella site links no GitHub profile.** Made by the maintainer on 2026-10-09: the links it had went to the maintainer's personal profile. Each package site links its own deck's repo instead. The umbrella footer keeps its npm link.
- **One App key in four repos.** Made by the maintainer on 2026-10-09. deck-cool and the three deck repos all hold the `deck-cool-releases` App's private key. So anyone who can write to a deck repo could open a PR on deck-cool and have it merge itself. The maintainer is the only writer today, and accepts the risk. Revisit this if anyone else gets write access to a deck repo.

## Where the design is

- The canvas: https://claude.ai/artifact/QjhCKzzVi3X3Bg3WP7fWWR (private to the maintainer).
- `design/canvas/`: the canvas boards' source, the exact values for colours, sizes and motion. `design/README.md` says which boards were chosen.

## The landing pages' message

Made by the maintainer on 2026-10-09, in the #33 grilling. It covers deck.cool's home page and each package site's home page.

- **Three audiences, equally.** Developers who install a deck, designers who decide how it looks, and AI coders: people building with coding agents, and the agents themselves. The hero speaks to all three in one sentence, with no line or tab per audience.
- **The family line:** "It looks like you. It works like the browser." The sentence under it: "Unstyled React packages for carousels, video and sites. Bring your tokens, your CSS, or your agent. The hard parts are already done."
- **Voice.** Warmer marketing copy on the landing pages. The docs stay plain.
- **Sections by quality, not by audience.** Every home page has four: unstyled, your look; small, leans on the browser; built for agents; accessible by default.
- **Accessibility claims need a test.** Each claim points to a test in that deck's repo. A claim with no test stays off the page, and the gap is filed in the deck's repo.
- **The umbrella states the promise; each deck proves it.** deck.cool says what every deck shares and sends readers to each one. A deck's home page carries its claim, one figure, a demo and its install command, and repeats the promise in one line.
- **The deck claims stay:** carouseldeck "A carousel that lets the browser do the scrolling.", playdeck "A video player you compose, not one you configure.", pagedeck "Zero JavaScript until a page needs it."
- **One figure per deck:** carouseldeck's min+gzip size, as its README at the latest release tag gives it (8.84 KB in @slidedeck/react 1.0.3); playdeck 0 requests to YouTube or Vimeo before play; pagedeck 0 B of JavaScript on a page with nothing interactive.
- **Unstyled is shown, not told.** A deck's home page shows one live component twice, styled two very different ways, with the CSS beside each.
- **Calls to action:** the install command (copy on click) and "Read the docs". Under them: "Using an agent? Point it at the docs: they're plain markdown."
- **No agent-docs claim beyond markdown** until pagedeck#34 ships a markdown twin per page and `llms.txt`.
- **The "plain markdown" call to action and claims wait** until the `@<deck>/docs` packages are published on npm.
