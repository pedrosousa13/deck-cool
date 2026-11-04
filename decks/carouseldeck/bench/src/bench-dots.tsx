// This bench's own dots bar (#340), rendered by every rival adapter so
// `harness.ts`'s `published()`/`index()` read the same shape off every deck
// but carouseldeck, which renders its own real `Deck.Dots` instead (#333's
// own "Dots count" signal, used as-is -- see carouseldeck-app.tsx). This is
// bench-owned instrumentation, the same convention drawerdeck's shared
// `.panel`/`.handle` CSS is (#266 rule 4): it never patches a rival's own
// behaviour, only reads back the index and count each library's own API
// already reports, through props this component takes.
//
// `data-bench-dots`, `data-count` and `data-index` are read by
// `harness.ts`'s `published()`/`index()`. `aria-current` matches
// `Deck.Dots`' own convention (ADR-0004 in carouseldeck), so a dots bar
// looks the same shape across every deck for anyone reading the markup.

export function BenchDots({
  count,
  index
}: {
  count: number;
  index: number | null;
}) {
  return (
    <div
      className="dots"
      data-bench-dots=""
      data-count={count}
      data-index={index ?? undefined}
    >
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Go to slide ${i + 1}`}
          aria-current={i === index ? 'true' : undefined}
          data-index={i}
        />
      ))}
    </div>
  );
}
