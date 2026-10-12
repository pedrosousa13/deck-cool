"use client";

import { useCallback, useSyncExternalStore } from "react";
import * as Deck from "@carouseldeck/react";
import { fade } from "@carouseldeck/react/fade";
import DemoFrame from "./demo-frame.tsx";

function useMediaQuery(query: string, initial = false) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(query).matches,
    () => initial
  );
}

// The recipe's deck: a crossfade on a narrow screen; from 768px, three
// slides in view that loop. Resize the window across 768px to see it switch.
export default function PerBreakpoint() {
  const wide = useMediaQuery("(min-width: 768px)");
  return (
    <DemoFrame>
      <Deck.Root
        aria-label="Per breakpoint"
        className="example-per-breakpoint"
        loop={wide}
      >
        <Deck.Viewport effect={wide ? undefined : fade}>
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
