"use client";

import * as Deck from "@slidedeck/react";
import DemoFrame from "./demo-frame.tsx";

// A deck a mouse can drag, as every deck by default.
export default function Drag() {
  return (
    <DemoFrame>
      <Deck.Root aria-label="Drag me" className="example-layout">
        <Deck.Viewport>
          <Deck.Slide>One</Deck.Slide>
          <Deck.Slide>Two</Deck.Slide>
          <Deck.Slide>Three</Deck.Slide>
          <Deck.Slide>Four</Deck.Slide>
          <Deck.Slide>Five</Deck.Slide>
          <Deck.Slide>Six</Deck.Slide>
        </Deck.Viewport>
        <Deck.Prev />
        <Deck.Next />
      </Deck.Root>
    </DemoFrame>
  );
}
