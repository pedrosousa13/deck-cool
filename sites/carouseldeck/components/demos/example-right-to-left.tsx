"use client";

import * as Deck from "@slidedeck/react";
import DemoFrame from "./demo-frame.tsx";

// A deck in a right-to-left context: it starts at the right, and Next moves
// toward the left.
export default function RightToLeft() {
  return (
    <DemoFrame>
      <div dir="rtl">
        <Deck.Root aria-label="Right-to-left slides" className="example-layout">
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
      </div>
    </DemoFrame>
  );
}
