"use client";

import * as Deck from "@carouseldeck/react";
import DemoFrame from "./demo-frame.tsx";

// The recipe's inset, read from the page's own cqi and the column's width:
// styles/carouseldeck.css, .example-viewport-bleed.
export default function ViewportBleed() {
  return (
    <DemoFrame>
      <div className="example-viewport-bleed">
        <div className="example-viewport-bleed-column">
          <Deck.Root aria-label="Featured slides">
            <Deck.Viewport>
              {["One", "Two", "Three", "Four", "Five", "Six"].map((name) => (
                <Deck.Slide key={name}>{name}</Deck.Slide>
              ))}
            </Deck.Viewport>
            <Deck.Prev />
            <Deck.Next />
            <Deck.Dots />
          </Deck.Root>
        </div>
      </div>
    </DemoFrame>
  );
}
