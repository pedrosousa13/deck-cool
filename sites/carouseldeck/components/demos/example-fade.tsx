"use client";

import * as Deck from "@slidedeck/react";
import { fade } from "@slidedeck/react/fade";
import DemoFrame from "./demo-frame.tsx";

export default function Fade() {
  return (
    <DemoFrame>
      <Deck.Root aria-label="Crossfade">
        <Deck.Viewport effect={fade}>
          <Deck.Slide>One</Deck.Slide>
          <Deck.Slide>Two</Deck.Slide>
          <Deck.Slide>Three</Deck.Slide>
        </Deck.Viewport>
        <Deck.Prev />
        <Deck.Next />
      </Deck.Root>
    </DemoFrame>
  );
}
