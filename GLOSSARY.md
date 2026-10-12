# deck.cool

deck.cool is the umbrella for a family of small, unstyled React packages, each named `*deck`. This repo holds every site in the family: the umbrella site at deck.cool and one site per package.

## Vocabulary

- **Deck**: one package in the family (slidedeck, playdeck, pagedeck). Each deck has its own source repo; its site lives here.
- **Umbrella site**: the site at `https://deck.cool`. It lists every deck and says what each one does.
- **Package site**: a deck's own site, served at its subdomain of deck.cool.
- **Family bar**: the top bar every site shares (design direction C). The umbrella mark opens a switcher across the decks, and the product name rolls to the pick.
- **Docs package**: a deck's reference docs, published from the deck's repo as `@<deck>/docs` at the code's version: markdown pages, a `nav.json` and images. Its package site renders it under `/docs`. See `docs/docs-contract.md`.
- **Demo**: a live component on a docs page. The page marks its place with `<!-- demo:<name> -->`, and the package site owns the component.
- **Brand kit**: what every site shares: the favicons, the Family bar, the dark palette and the motion curve.

## Standing decisions

Made by the maintainer on 2026-10-08.

- **All sites in one repo.** The umbrella site and every package site live here, all built with Pagedeck. slidedeck's site already runs on Pagedeck, so it is ported first.
- **Addresses.**

  | Site | Address |
  | --- | --- |
  | Umbrella | `deck.cool` |
  | slidedeck | `slide.deck.cool` |
  | playdeck | `play.deck.cool`. `playdeck.video` 301s to it (ruled 2026-10-10, done 2026-10-12, #65) |
  | pagedeck | `page.deck.cool`, with its landing page and docs merged into one site and the docs under `/docs` |

  Cloudflare's free certificate covers one subdomain level (`*.deck.cool`), so no deck gets a second level such as `docs.page.deck.cool`.
- **Dark by default.** slidedeck.pages.dev's Apple-style layout is the starting point: the system SF font stack, a 980px measure, a 52px translucent bar, pill buttons and 28px tiles.
- **The packages ship no CSS, and the sites say so.** No site shows off shared tokens or a type scale.
- **Favicons are round 2**: one card shape, arranged a different way per deck, on a dark `#1c1c1e` tile. Files in `design/favicons/`.

  | Deck | Arrangement | Accent |
  | --- | --- | --- |
  | deck.cool | three cards, fanned | the three accents below |
  | slidedeck | three cards in a row, the middle one in front | `#2997ff` |
  | playdeck | three cards stepping down: the outline reads as play | `#ff5c86` |
  | pagedeck | three stacked sections, the middle one lit (the island) | `#3ddc97` |

  Accepted risks: at 16px pagedeck's bars can read as a hamburger menu, and slidedeck's arrangement is close to the stock "view carousel" icon.
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
- **The deck claims stay:** slidedeck "A carousel that lets the browser do the scrolling.", playdeck "A video player you compose, not one you configure.", pagedeck "Zero JavaScript until a page needs it."
- **One figure per deck:** slidedeck's min+gzip size, as its installed README gives it (8.84 KB in 1.0.3); playdeck 0 requests to YouTube or Vimeo before play; pagedeck 0 B of JavaScript on a page with nothing interactive.
- **Unstyled is shown, not told.** A deck's home page shows one live component twice, styled two very different ways, with the CSS beside each.
- **Calls to action:** the install command (copy on click) and "Read the docs". Under them: "Using an agent? Point it at the docs: they're plain markdown."
- **No agent-docs claim beyond markdown** until pagedeck#34 ships a markdown twin per page and `llms.txt`.
- **The "plain markdown" call to action and claims wait** until the `@<deck>/docs` packages are published on npm.
