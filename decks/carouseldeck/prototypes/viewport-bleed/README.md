# Viewport bleed prototype (#188)

**This is not package code.** It answers #188, the prototype #177 was
ruled to need first: can a carouseldeck viewport bleed past its column in
CSS alone, and what do fade, stack, curve and loop do under it? Ships no
`@carouseldeck/*` package change.

Findings: [`FINDINGS.md`](./FINDINGS.md).

## Probes

| Probe                                             | Answers                                                         | Needs                    |
| ------------------------------------------------- | --------------------------------------------------------------- | ------------------------ |
| `sticky-padding.html`, `sticky-padding-probe.mjs` | Question 2: where a sticky slide sticks under the bleed padding | Nothing running first    |
| `render-ssr.mjs`, `check-ssr.mjs`                 | Question 5: server HTML and layout shift                        | Nothing running first    |
| `width-sweep.mjs`                                 | Question 4: the width at which `bleed--loop` stops settling     | The storybook dev server |
| `crash-boundary.mjs`                              | Whether that crash needs the bleed CSS at all                   | The storybook dev server |

The stories the last two probes drive (`Bleed`, in
`apps/storybook/stories/bleed.stories.tsx`) are committed, as is the whole
recipe they test; the browser checks of the stories that do not crash are
`e2e/bleed.spec.ts`'s own tests, which `pnpm --dir decks/carouseldeck
verify` already runs. These probes never run in a gate: they answer a
question once, with throwaway output, not a behaviour this repo promises to
keep.

## Run it

From `decks/carouseldeck`:

```sh
node prototypes/viewport-bleed/sticky-padding-probe.mjs
node prototypes/viewport-bleed/render-ssr.mjs
node prototypes/viewport-bleed/check-ssr.mjs
```

`width-sweep.mjs` and `crash-boundary.mjs` need the storybook dev server on
port 4173, in another terminal:

```sh
pnpm --filter @carouseldeck/storybook exec storybook dev --ci --no-open -p 4173 --host 127.0.0.1
```

Then, from `decks/carouseldeck`:

```sh
node prototypes/viewport-bleed/width-sweep.mjs chromium 1000 1050
node prototypes/viewport-bleed/crash-boundary.mjs chromium 1000 1050
```

The second argument on is any list of page widths (pixels); repeat for
`firefox` and `webkit`.
