# deck.cool

deck.cool is the umbrella for a family of small, unstyled React packages, each named `*deck`. This repo holds every site in the family: the umbrella site at deck.cool and one site per package.

## Vocabulary

- **Deck**: one package in the family (slidedeck, playdeck, pagedeck). Each deck has its own source repo; its site lives here.
- **Umbrella site**: the site at `https://deck.cool`. It lists every deck and says what each one does.
- **Package site**: a deck's own site, served at its subdomain of deck.cool.
- **Family bar**: the top bar every site shares (design direction C). The umbrella mark opens a switcher across the decks, and the product name rolls to the pick.
- **Brand kit**: what every site shares: the favicons, the Family bar, the dark palette and the motion curve.

## Standing decisions

Made by the maintainer on 2026-10-08.

- **All sites in one repo.** The umbrella site and every package site live here, all built with Pagedeck. slidedeck's site already runs on Pagedeck, so it is ported first.
- **Addresses.**

  | Site | Address |
  | --- | --- |
  | Umbrella | `deck.cool` |
  | slidedeck | `slide.deck.cool` |
  | playdeck | `play.deck.cool`, and also `playdeck.video`, which stays canonical: `play.deck.cool` pages carry `<link rel="canonical">` to it |
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

## Where the design is

- The canvas: https://claude.ai/artifact/QjhCKzzVi3X3Bg3WP7fWWR (private to the maintainer).
- `design/canvas/`: the canvas boards' source, the exact values for colours, sizes and motion. `design/README.md` says which boards were chosen.
