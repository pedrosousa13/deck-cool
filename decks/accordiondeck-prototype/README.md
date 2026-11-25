# accordiondeck prototype

Throwaway prototype for #361 (go/no-go) and #363. Lives on the branch `prototype/accordiondeck`. Never merge it to `main`.

It is not in the root pnpm workspace. It has its own `package.json`.

## Install

From the repo root:

```sh
pnpm install --ignore-workspace --dir decks/accordiondeck-prototype
```

Playwright's Chromium, Firefox and WebKit must be installed (`pnpm exec playwright install chromium firefox webkit`, version 1.63.0).

## Serve the page

```sh
node decks/accordiondeck-prototype/serve.mjs      # PORT=9000 to change the port, default 8363
```

It binds 0.0.0.0 and prints `http://minix.tailaa104f.ts.net:<port>/` and `http://192.168.1.66:<port>/`. The page is `index.html`: plain HTML, no build. Each section names its variant and says what to listen for.

## Run the state checks

```sh
node decks/accordiondeck-prototype/check.mjs
```

It bundles React 19 with esbuild into `.build/` (ignored by git), server-renders with `react-dom/server`, hydrates with `hydrateRoot`, and runs every case in Chromium, Firefox and WebKit. It prints one table per engine with the browser version, and exits 1 if any case fails. It makes no network requests. The accordion logic under test is `app.jsx` (about 100 lines).

Cases, by ADR 0001 "State and the browser":

| Case | Checks |
| --- | --- |
| 1a to 1e | A controlled parent declines a change: click, Enter, Space and a fragment open. DOM matches state after `open` is written back. 1a is the baseline with no handler, where the DOM diverges. |
| 2a, 2b | A click before hydration, then `hydrateRoot`: DOM, `toggle` events, adoption on mount. Parsed `open` fires `toggle` on load. |
| 3a, 3b | Group switch: order of the two `toggle` events, same task, group settled at the first. |
| 4a, 4b | Fragment navigation into a closed panel opens it and closes the open sibling (React group, and `index.html` variant 4). |
| 5a, 5b | A link, a button and a prevented child inside the summary do not toggle it. 5a with the handler, 5b native on `index.html` variant 5. |
| 6 | `index.html` variant 3 keeps `aria-expanded` in sync. |

## Page variants and #361's checks

| Variant | Use in #361 |
| --- | --- |
| 1 heading in summary | Check 1: VoiceOver (macOS, iOS), NVDA, JAWS: heading announced, in the headings list, still expandable. Check 2 baseline: is expanded or collapsed announced on iOS? |
| 2 plain summary | Baseline for checks 1 and 2: what the bare element announces. |
| 3 heading plus `aria-expanded` | Check 2: if variant 1 is silent on iOS, does this one announce the state? |
| 4 named group of five | Check 4: find-in-page in Safari 26.2 for marmalade, quokka, zephyr, tamarind, obsidian: opens the match, closes the open sibling, scrolls. Also the fragment links. |
| 5 link and button in a summary | Check 3's last case on a real device, and how screen readers announce a summary that holds a link and a button. |

Checks 1, 2 and 4 are for real devices. Playwright cannot do them.
