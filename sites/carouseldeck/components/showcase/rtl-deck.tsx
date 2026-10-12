"use client";

import * as Deck from "@slidedeck/react";
import { PLACES, type Photo } from "./photos.ts";

interface Place {
  name: string;
  trip: string;
  photo: Photo;
}

// Destinations, in Arabic: "a green valley, a one-day trip", "a waterfall in
// the forest, an easy trail", "snow-covered peaks, a three-day trip", "a
// rocky beach, a walk at sunset", "a forest by the sea, a two-night stay".
const PLACE_LIST: Place[] = [
  { name: "وادٍ أخضر", trip: "رحلة ليوم واحد", photo: PLACES.valley },
  { name: "شلال في الغابة", trip: "مسار سهل", photo: PLACES.waterfall },
  { name: "قمم مغطاة بالثلوج", trip: "رحلة لثلاثة أيام", photo: PLACES.summit },
  { name: "شاطئ صخري", trip: "نزهة عند الغروب", photo: PLACES.shore },
  { name: "غابة قرب البحر", trip: "إقامة لليلتين", photo: PLACES.pines }
];

/** The same kind of deck in a right-to-left container: it starts at the
 * right, and Next moves toward the left. */
export default function RtlDeck() {
  return (
    <div lang="ar" dir="rtl" className="rtl-example">
      <Deck.Root aria-label="وجهات للسفر" className="rtl-deck">
        <Deck.Viewport>
          {PLACE_LIST.map((place) => (
            <Deck.Slide key={place.name}>
              <figure className="place">
                <img
                  src={place.photo.src}
                  width={place.photo.width}
                  height={place.photo.height}
                  alt={place.photo.alt}
                  loading="lazy"
                />
                <figcaption>
                  <h3>{place.name}</h3>
                  <p>{place.trip}</p>
                </figcaption>
              </figure>
            </Deck.Slide>
          ))}
        </Deck.Viewport>
        {/* "Previous" and "Next". */}
        <Deck.Prev>السابق</Deck.Prev>
        <Deck.Next>التالي</Deck.Next>
      </Deck.Root>
    </div>
  );
}
