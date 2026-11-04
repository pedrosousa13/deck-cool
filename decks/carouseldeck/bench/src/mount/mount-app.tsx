// The mount scenario's page body (#340): `n` instances of one deck's own
// gesture-bench component (the "2 decks and 20 decks on one page" the issue
// asks for -- "deck" meaning one carousel instance here, the same
// overloaded word `scenarios.ts`'s own convention and #333's PR evidence
// table used; see RESULTS.md's "Method" section for the explicit
// disambiguation), each optionally preceded by a `DirtySibling` that dirties
// layout in its own layout effect just before that instance mounts. `Deck`
// is whichever adapter component `client-entry-<deck>.tsx` imports; this
// component itself is deck-agnostic, reused by all five.

import type { ComponentType } from 'react';
import { DirtySibling } from './dirty-sibling';

export function MountApp({
  n,
  dirty,
  Deck
}: {
  n: number;
  dirty: boolean;
  Deck: ComponentType;
}) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i}>
          {dirty && <DirtySibling />}
          <Deck />
        </div>
      ))}
    </>
  );
}
