"use client";

import * as Deck from "@carouseldeck/react";
import DemoFrame from "./demo-frame.tsx";

// The recipe's controls, with plain buttons in place of a design system's.
function Controls() {
  const { index, count, fits, canPrev, canNext, prev, next, scrollTo } =
    Deck.useDeck();
  if (fits) return null;
  return (
    <div className="docs-controls">
      <button type="button" disabled={!canPrev} onClick={prev}>
        Previous
      </button>
      <div role="group" aria-label="Choose page">
        {Array.from({ length: count ?? 0 }, (_, page) => (
          <button
            key={page}
            type="button"
            aria-label={`Go to page ${page + 1}`}
            aria-current={page === index ? "true" : undefined}
            onClick={() => scrollTo(page)}
          >
            {page + 1}
          </button>
        ))}
      </div>
      <span>{count !== null && `${index + 1} / ${count}`}</span>
      <button type="button" disabled={!canNext} onClick={next}>
        Next
      </button>
    </div>
  );
}

export default function CustomControls() {
  return (
    <DemoFrame>
      <Deck.Root aria-label="Featured slides">
        <Deck.Viewport>
          <Deck.Slide>One</Deck.Slide>
          <Deck.Slide>Two</Deck.Slide>
          <Deck.Slide>Three</Deck.Slide>
          <Deck.Slide>Four</Deck.Slide>
        </Deck.Viewport>
        <Controls />
      </Deck.Root>
    </DemoFrame>
  );
}
