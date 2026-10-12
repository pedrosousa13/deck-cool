"use client";

import * as Deck from "@carouseldeck/react";
import { fade } from "@carouseldeck/react/fade";
import { SCENES, type Photo } from "./photos.ts";

interface Banner {
  eyebrow: string;
  title: string;
  body: string;
  photo: Photo;
}

const BANNERS: Banner[] = [
  {
    eyebrow: "Autumn trips",
    title: "Walk the north coast.",
    body: "Seven days of forest trails above the sound.",
    photo: SCENES.forest
  },
  {
    eyebrow: "Guided climbs",
    title: "Above the snow line.",
    body: "Small groups, local guides, every pass mapped.",
    photo: SCENES.peaks
  },
  {
    eyebrow: "Slow weekends",
    title: "A quiet bay, all to yourself.",
    body: "Cabins by the water, two nights or more.",
    photo: SCENES.bay
  }
];

/** A full-width hero: `effect={fade}`, autoplay and its toggle, first among
 * the controls. */
export default function HeroDeck() {
  return (
    <Deck.Root aria-label="Trips" className="hero-deck" autoplay={5000} loop>
      <Deck.Viewport effect={fade}>
        {BANNERS.map((banner) => (
          <Deck.Slide key={banner.title}>
            <div className="hero-slide">
              <img
                src={banner.photo.src}
                width={banner.photo.width}
                height={banner.photo.height}
                alt={banner.photo.alt}
                loading="lazy"
              />
              <div className="hero-copy">
                <p className="hero-eyebrow">{banner.eyebrow}</p>
                <h3>{banner.title}</h3>
                <p>{banner.body}</p>
              </div>
            </div>
          </Deck.Slide>
        ))}
      </Deck.Viewport>
      <Deck.AutoplayToggle />
      <Deck.Dots />
    </Deck.Root>
  );
}
