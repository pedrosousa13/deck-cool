"use client";

import * as Deck from "@slidedeck/react";
import { curve } from "@slidedeck/react/curve";

interface Album {
  /** Picks the cover's art in CSS: by album, never by position, as a loop's
   * copies are slides too. */
  art: string;
  title: string;
  artist: string;
}

// Made-up albums; their covers are drawn in CSS.
const ALBUMS: Album[] = [
  { art: "tide", title: "Low Tide", artist: "Harbour Lights" },
  { art: "moons", title: "Paper Moons", artist: "The Lanterns" },
  { art: "north", title: "Northbound", artist: "Ida Vale" },
  { art: "orbit", title: "Slow Orbit", artist: "Kite Year" },
  { art: "glass", title: "Glasshouse", artist: "Mira Sol" },
  { art: "swim", title: "Night Swim", artist: "Coastal Club" },
  { art: "field", title: "Fieldnotes", artist: "Oak & Ash" }
];

/** Cover flow: `effect={curve}` on album squares, looping, starting on the
 * middle one. */
export default function CoverFlowDeck() {
  return (
    <Deck.Root
      aria-label="Albums"
      className="cover-flow-deck"
      defaultIndex={3}
      loop
    >
      <Deck.Viewport effect={curve}>
        {ALBUMS.map((album) => (
          <Deck.Slide key={album.art}>
            {/* The curve draws on the slide's one child. */}
            <div className="album" data-album={album.art}>
              <strong>{album.title}</strong>
              <span>{album.artist}</span>
            </div>
          </Deck.Slide>
        ))}
      </Deck.Viewport>
      <Deck.Dots />
    </Deck.Root>
  );
}
