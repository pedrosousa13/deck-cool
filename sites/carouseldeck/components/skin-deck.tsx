"use client";

import * as Deck from "@carouseldeck/react";

const SLIDES = [
  { name: "Momentum", line: "The browser's own." },
  { name: "Snapping", line: "The browser's own." },
  { name: "Focus scrolling", line: "The browser's own." },
  { name: "The look", line: "Yours." },
] as const;

/**
 * The home page's one deck, rendered once per skin. It carries no class of
 * its own: each skin styles it through carouseldeck's part names alone.
 */
export default function SkinDeck({ label }: { label: string }) {
  return (
    <Deck.Root aria-label={label}>
      <Deck.Viewport>
        {SLIDES.map(({ name, line }) => (
          <Deck.Slide key={name}>
            <div>
              <strong>{name}</strong> <span>{line}</span>
            </div>
          </Deck.Slide>
        ))}
      </Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
      <Deck.Dots />
      <Deck.Counter />
    </Deck.Root>
  );
}
