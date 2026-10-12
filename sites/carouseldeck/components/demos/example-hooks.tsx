"use client";

import * as Deck from "@carouseldeck/react";
import DemoFrame from "./demo-frame.tsx";

const twoDigits = (n: number) => String(n).padStart(2, "0");

// The Hooks page's controls, from `Deck.useDeck()`, with plain buttons in
// place of a design system's.
function PhotoControls() {
  const { index, count, fits, canPrev, canNext, prev, next } = Deck.useDeck();
  if (fits) return null;
  return (
    <div className="docs-controls">
      <button type="button" disabled={!canPrev} onClick={prev}>
        Previous photo
      </button>
      <span>
        {count !== null && `${twoDigits(index + 1)} / ${twoDigits(count)}`}
      </span>
      <button type="button" disabled={!canNext} onClick={next}>
        Next photo
      </button>
    </div>
  );
}

export default function Hooks() {
  return (
    <DemoFrame>
      <Deck.Root aria-label="Photos">
        <Deck.Viewport>
          <Deck.Slide>One</Deck.Slide>
          <Deck.Slide>Two</Deck.Slide>
          <Deck.Slide>Three</Deck.Slide>
        </Deck.Viewport>
        <PhotoControls />
      </Deck.Root>
    </DemoFrame>
  );
}
