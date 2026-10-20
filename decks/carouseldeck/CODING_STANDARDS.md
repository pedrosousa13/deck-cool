# Coding standards

These are the judgement rules a reviewer checks a carouseldeck diff against, past what `pnpm verify` already enforces.

- A new or changed test is shown failing without the change it covers.
  A test that passes either way proves nothing; three reviews found exactly that (#177, #181, #189).

- A timing or input fix tests every input that shares the changed path, not one.
  The index-bookkeeping bug predated the loop-only fix whose test covered loop alone (#163).

- A value nobody can know yet is `null` and documented, never a made-up number.
  `slideCount` once reported a guessed 0 where Root could not see the slides (#180).

- State that stands in for a prop is read from the prop, not latched from the DOM.
  A loop flag latched once from the DOM stayed stuck after loop was turned off (#196).

- Public custom properties sit in their part's namespace: `--deck-slide-*` and `--deck-viewport-*` are carouseldeck's own outputs, and `--deck-<effect>-*`, such as `--deck-curve-radius`, names an effect's consumer-set inputs.
  Keeps carouseldeck's outputs and a consumer's own tokens from ever landing on the same name (ADR-0010).

- An ADR amendment opens with a bold lead-in paragraph, `**… (amended for #N).**`
  Lets a reader find what changed, and why, without reading the ADR's full history (ADR-0003, 0005, 0014).

- A changeset lists every package a consumer sees change, bumps `minor` for new public API, and uses only public terms.
  One changeset missed a changed package, and another named an internal term no consumer sees (#196, #163).

- Docs and recipes describe what the code does, in present tense, and every claim points to a test, story or probe in the repo.
  A recipe that followed from the CSS specification still rested the deck off the column, in every engine, until a probe caught it (#188).
