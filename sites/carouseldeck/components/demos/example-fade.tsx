"use client";

import * as Deck from "@carouseldeck/react";
import { fade } from "@carouseldeck/react/fade";
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
