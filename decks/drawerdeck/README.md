# Drawerdeck

A headless, composable drawer for React, built on native scrolling: drag,
momentum and snap points are a scroll-snap container, and `<dialog>` gives
the top layer, focus and Escape.

| Package                               | What it is                                      |
| ------------------------------------- | ----------------------------------------------- |
| [`@drawerdeck/react`](packages/react) | The React primitives. Not published yet.        |
| [`@drawerdeck/core`](packages/core)   | The framework-neutral engine `react` builds on. |

Neither package has engine or primitive code yet: each exports a
placeholder, and `pnpm verify` runs a smoke test against it. The map is
pedrosousa13/deck-cool#230.

Contributing: run `pnpm verify` before landing anything (see
[AGENTS.md](AGENTS.md)). Decisions are recorded in [docs/adr](docs/adr), and
the project's vocabulary in the root [GLOSSARY.md](../../GLOSSARY.md).

MIT licensed.
