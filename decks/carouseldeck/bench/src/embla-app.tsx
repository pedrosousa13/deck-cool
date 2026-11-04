// Embla's own React hook (Embla's React guide, embla-carousel-react's
// README; grounded against tests/compare/entries/embla.tsx, the same
// recipe, and node_modules/.../embla-carousel-react/components/
// useEmblaCarousel.d.ts, which types `useEmblaCarousel` as
// `(options?, plugins?) => [EmblaViewportRefType, EmblaCarouselType |
// undefined]`). `embla.css` is the viewport/container/slide positioning
// CSS Embla's own docs require, since Embla ships none itself.
//
// `loop` is this bench's own `?loop=1` toggle, passed straight into
// `useEmblaCarousel`'s own `loop` option
// (embla-carousel/components/Options.d.ts: `OptionsType.loop: boolean`) --
// not a deviation from Embla's default, which is `false`.
//
// `WheelGesturesPlugin()` (embla-carousel-wheel-gestures, pinned in
// package.json) is the one non-default option this adapter sets: Embla's
// own plugin list names it as the documented way to add wheel/trackpad
// support (its README's own React example,
// `useEmblaCarousel({...}, [WheelGesturesPlugin()])`), needed for
// `wheel-scroll-next` in scenarios.ts, the same reason Swiper's adapter
// enables its own `Mousewheel` module and Splide's sets `wheel: true`.
// Passed as a fresh array literal on every render, matching the README's
// own usage exactly: `useEmblaCarousel`'s hook (embla-carousel-react's
// source) deep-compares a plugin's own options before deciding whether to
// reinit, so this never reinits Embla just because `EmblaApp` re-rendered.
// `forceWheelAxis: 'x'` is the plugin's own documented option "useful if
// you want to slide horizontally when scrolling vertically or vice versa"
// (its README's "Options" section): `wheel-scroll-next`'s gesture carries
// a small vertical component too (Splide's own `wheel` option reads only
// `deltaY`, so the same gesture has to give every deck something on
// whichever axis it reads), and this is the plugin's own documented way
// to say "this carousel is horizontal" rather than rely on its own
// per-gesture axis detection to guess right.
//
// The published/index signal is this bench's own instrumentation, not
// Embla's: `emblaApi.on('select', ...)` and the one immediate call right
// after attaching report `scrollSnapList().length` and
// `selectedScrollSnap()` into local state, rendered through `BenchDots`
// (embla-carousel/components/EmblaCarousel.d.ts: `EmblaCarouselType.on`,
// `.scrollSnapList`, `.selectedScrollSnap`). `data-bench-slide="0"` on the
// first slide, and `id="viewport"`/`id="prev"`/`id="next"`, are this
// bench's own markers (scenarios.ts, harness.ts); Embla moves the whole
// `.embla-container` track with one `translate3d`, so the first slide's own
// bounding rect shifts with it the same way harness.ts's generic
// `trackSelector` convention expects.
import useEmblaCarousel from 'embla-carousel-react';
import { WheelGesturesPlugin } from 'embla-carousel-wheel-gestures';
import { useEffect, useState } from 'react';
import { BenchDots } from './bench-dots';
import { loopFromQuery, SLIDE_COUNT, slideLabel } from './content';

export function EmblaApp() {
  const loop = loopFromQuery();
  const [viewportRef, emblaApi] = useEmblaCarousel({ loop }, [
    WheelGesturesPlugin({ forceWheelAxis: 'x' })
  ]);
  const [state, setState] = useState<{ count: number; index: number } | null>(
    null
  );

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      setState({
        count: emblaApi.scrollSnapList().length,
        index: emblaApi.selectedScrollSnap()
      });
    };
    emblaApi.on('select', onSelect);
    onSelect();
  }, [emblaApi]);

  return (
    <section>
      <div id="viewport" className="embla-viewport" ref={viewportRef}>
        <div className="embla-container">
          {Array.from({ length: SLIDE_COUNT }, (_, i) => (
            <div
              key={i}
              className="embla-slide"
              data-bench-slide={i === 0 ? '0' : undefined}
            >
              {slideLabel(i)}
            </div>
          ))}
        </div>
      </div>
      <button id="prev" type="button" onClick={() => emblaApi?.scrollPrev()}>
        Previous
      </button>
      <button id="next" type="button" onClick={() => emblaApi?.scrollNext()}>
        Next
      </button>
      <BenchDots count={state?.count ?? 0} index={state?.index ?? null} />
    </section>
  );
}
