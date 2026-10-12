"use client";

import * as Deck from "@carouseldeck/react";
import DemoFrame from "./demo-frame.tsx";

// Slides that shrink with their distance from the focal one, read from
// `--deck-slide-progress` every frame: styles/carouseldeck.css.
export default function Progress() {
  return (
    <DemoFrame>
      <Deck.Root aria-label="Scaled by progress" className="example-progress">
        <Deck.Viewport>
          <Deck.Slide>One</Deck.Slide>
          <Deck.Slide>Two</Deck.Slide>
          <Deck.Slide>Three</Deck.Slide>
          <Deck.Slide>Four</Deck.Slide>
          <Deck.Slide>Five</Deck.Slide>
        </Deck.Viewport>
        <Deck.Prev />
        <Deck.Next />
      </Deck.Root>
    </DemoFrame>
  );
}
