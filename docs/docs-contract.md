# The docs contract

This is for a deck's maintainer. It says what a docs package must hold so that the deck's site on deck.cool can build from it. Why the docs arrive this way is in [ADR 0001](adr/0001-docs-arrive-as-an-npm-package.md).

## The package

Publish an npm package named `@<deck>/docs` (for example `@slidedeck/docs`) at the same version as the deck's code. It holds markdown, one `nav.json` and images, and no code.

```
@slidedeck/docs/
├── package.json
├── nav.json
├── index.md
├── guides/
│   ├── install.md
│   └── layout.md
└── assets/
    └── layout-grid.png
```

- **Pages** are the `.md` files anywhere under the package root.
- **`nav.json`** is at the package root.
- **Images** are under `assets/`.

These files are not pages: `README.md`, `CHANGELOG.md` and `LICENSE.md` at the package root (npm adds them to every package), every `.md` file under `assets/`, and everything under `node_modules/`.

## Frontmatter

Every page opens with a frontmatter block that has a `title` and a `description`. Both are required, and neither can be empty.

```md
---
title: Layout
description: How slidedeck sizes a slide to its container.
---

A slide fills the width of its container...
```

The site shows `title` as the page's heading, so do not open the body with a `#` heading: the first one is dropped. Other fields are allowed, and the site ignores them.

## `nav.json`

An ordered list of groups. Each group has a `label` and an ordered list of `pages`. A page is named by its path from the package root, with `.md`.

```json
[
  { "label": "Start", "pages": ["index.md", "guides/install.md"] },
  { "label": "Guides", "pages": ["guides/layout.md"] }
]
```

The site's navigation shows the groups and pages in this order. Every page must be in `nav.json` once, and every path in `nav.json` must be a page.

## Routes

A page's route comes from its path. The site picks the base, for example `/docs`.

| File | Route |
| --- | --- |
| `index.md` | `/docs` |
| `guides/layout.md` | `/docs/guides/layout` |
| `guides/index.md` | `/docs/guides` |

Two files cannot share a route, so a package cannot have both `guides.md` and `guides/index.md`.

## Links

Link to another page by its relative path to the `.md` file, from the page you are writing. A `#fragment` is kept. The site rewrites the link to the page's route.

```md
See [Install](./install.md#requirements), or go [back to the start](../index.md).
```

A reference-style link (`[Install][install]` with `[install]: ./install.md` below) works the same. A link with the scheme `http:`, `https:` or `mailto:`, a link that starts with `/` and a link that is only a `#fragment` are left as they are. A link or image with any other scheme, such as `javascript:` or `data:`, fails the build. So does a link that names no scheme but another host (`//example.com/`): write `https://example.com/`. The rule covers every link, a bare URL in the text among them. A link or image whose destination holds `&` fails the build, because a character reference such as `&#47;` can hide a scheme or a host: write the character itself, or percent-encode it (`%26` for `&`). A relative link to anything that is not a `.md` file fails the build too. Two definitions with one label (`[install]: …` twice) fail the build. A link may wrap across lines, in a list or a block quote too.

## Images

Put the file under `assets/`, and link it relatively from the page.

```md
![The layout grid](../assets/layout-grid.png)
```

## Demos

The docs hold no components. To show a live demo, put a marker on its own line where the demo goes:

```md
<!-- demo:counter -->
```

A name has letters, digits, `-` and `_`. A demo marker is the only HTML a page may hold: any other HTML, an HTML comment among it, fails the build. Write it in markdown instead. The site swaps the marker for the component it registers under that name. Each site keeps its own list of names, so agree on a new name with the site before you release a page that uses it.

## Code

Fenced code blocks are highlighted at build time. Name the language on the fence (` ```tsx `). Which languages are loaded is the site's choice, not yours: the site declares its list, and adds any language a docs package needs. A fence with a language that is not on the site's list fails the site's build, so tell the site before you release a page with a new one.

## What fails the build

The build stops and names the file and line of each problem, with the fix:

- a page with no `title` or no `description`;
- no `nav.json`, or a `nav.json` that is not a list of groups, each with a `label` and `pages`;
- a page that `nav.json` does not list, a page it lists twice, or an entry with no page;
- two files with one route, such as `guides.md` and `guides/index.md`;
- a link to a page that does not exist, or a relative link to a file that is not a `.md` page;
- a link or image whose scheme is not `http:`, `https:` or `mailto:`, or whose destination holds `&`;
- a second definition of one label;
- raw HTML that is not a demo marker, in a link's text or an image's alt text too;
- HTML, a link or an image the build cannot find in the file as written, such as one on a list item's line indented with a tab;
- a link whose path is written with backslash escapes, which the build cannot rewrite;
- an image that is not a file under `assets/`;
- a demo marker that is not on a line of its own, or a demo name the site does not register;
- a code fence whose language the site does not load (Pagedeck's check, which names the file but not the line).

## Known limits

These are limits of the site's loader, not rules for the docs package:

- A site shows one docs package. It holds every page in one collection, named `docs`, in one locale, `en`.
- The docs use the site's one `build.passthrough.contentRoot`, which publishes the images the pages show. The site can't use it for anything else.
- `pagedeck sync` stages the images. A `pagedeck build` from a content snapshot that was pulled without a sync has no images to publish.
