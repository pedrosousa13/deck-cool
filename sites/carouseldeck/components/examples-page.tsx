// The Examples page, /examples/. A server component: it ships no JavaScript
// of its own. Each example's deck is an island, a 'use client' module of its
// own in components/showcase.
import type { ReactNode } from "react";
import CoverFlowDeck from "./showcase/cover-flow-deck.tsx";
import GalleryDeck from "./showcase/gallery-deck.tsx";
import HeroDeck from "./showcase/hero-deck.tsx";
import { CREDITS } from "./showcase/photos.ts";
import RtlDeck from "./showcase/rtl-deck.tsx";
import StoriesDeck from "./showcase/stories-deck.tsx";
import TestimonialsDeck from "./showcase/testimonials-deck.tsx";

interface Example {
  id: string;
  title: string;
  /** One line on what it shows. */
  body: string;
  /** The docs pages for the features it uses, each with what it is for when
   * there are several. */
  code: readonly { href: string; topic?: string }[];
  /** Spans the page rather than sitting in a frame. */
  bleed?: boolean;
  deck: ReactNode;
}

const EXAMPLES: Example[] = [
  {
    id: "product-gallery",
    title: "Product gallery",
    body: "Large photos with a thumbnail for each page, built on useDeck. Swipe, drag or pick a thumbnail.",
    code: [{ href: "/docs/recipes/custom-controls/" }],
    deck: <GalleryDeck eager />
  },
  {
    id: "hero-banner",
    title: "Hero banner",
    body: "Full width, edge to edge, crossfading with effect={fade}, and autoplay with its toggle. Reduced motion starts it stopped.",
    code: [
      { href: "/docs/guides/effects/", topic: "fade" },
      { href: "/docs/guides/autoplay/", topic: "autoplay" }
    ],
    bleed: true,
    deck: <HeroDeck />
  },
  {
    id: "testimonials",
    title: "Testimonials",
    body: "Sample copy: reviews for Hearth & Kiln, an invented roastery. Centred cards with their neighbours in view, the first and the last centred too.",
    code: [{ href: "/docs/recipes/centred-ends/" }],
    deck: <TestimonialsDeck />
  },
  {
    id: "stories",
    title: "Stories",
    body: 'orientation="vertical" in a phone-shaped frame, one full-height story at a time.',
    code: [{ href: "/docs/guides/vertical-and-rtl/" }],
    deck: <StoriesDeck />
  },
  {
    id: "right-to-left",
    title: "Right to left",
    body: 'The same deck in an Arabic, dir="rtl" container. It starts at the right, and Next goes left.',
    code: [{ href: "/docs/guides/vertical-and-rtl/" }],
    deck: <RtlDeck />
  },
  {
    id: "cover-flow",
    title: "Cover flow",
    body: "effect={curve} on album covers drawn in CSS, looping, sized with the curve recipe.",
    code: [{ href: "/docs/recipes/size-a-curve/" }],
    deck: <CoverFlowDeck />
  }
];

/** A line's `code spans` as <code>. */
function Line({ text }: { text: string }) {
  return text
    .split(/(\w+=\{\w+\}|\w+="[\w-]+"|useDeck)/)
    .map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part));
}

export default function ExamplesPage() {
  return (
    <>
      <section className="examples-intro">
        <h1>Examples</h1>
        <p>
          Real decks, built only on carouseldeck’s public API and plain CSS. Each
          one is live: drag it, swipe it, or use the keyboard.
        </p>
      </section>

      {EXAMPLES.map((example) => (
        <section
          key={example.id}
          className={example.bleed ? "example example-bleed" : "example"}
          aria-labelledby={example.id}
        >
          <div className="example-text">
            <h2 id={example.id}>{example.title}</h2>
            <p>
              <Line text={example.body} />
            </p>
            {example.code.map(({ href, topic }) => (
              <a key={href} href={href}>
                {topic === undefined ? "View code ›" : `View code: ${topic} ›`}
              </a>
            ))}
          </div>
          <div className="example-frame">{example.deck}</div>
        </section>
      ))}

      <section className="examples-credits" aria-labelledby="credits">
        <h2 id="credits">Photo credits</h2>
        <p>
          Photos from Unsplash, under the Unsplash License. Album covers are
          drawn in CSS.
        </p>
        <ul>
          {CREDITS.map((photo) => (
            <li key={photo.url}>
              {photo.subject} by <a href={photo.url}>{photo.author}</a>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
