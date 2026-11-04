// Keen's own React hook and stylesheet (tests/compare/entries/keen.tsx: the
// slider does not lay out without `keen-slider/keen-slider.min.css`), typed
// by node_modules/.../keen-slider/keen-slider.d.ts's `useKeenSlider` as
// `(options?, plugins?) => [(node: T | null) => void,
// MutableRefObject<KeenSliderInstance | null>]`. No `src/keen.css`: the
// bundled keen-slider.css already sets `display: flex`/`overflow: hidden`
// on `.keen-slider` and `width: 100%` on `.keen-slider__slide`, and Keen's
// own per-slide render step then pins each slide's exact pixel width at
// mount from its `slides.perView` option -- which already defaults to `1`
// in the installed package (keen-slider.es.js's own default argument,
// `p(n.options.slides,"perView",1,!0)`), so one slide per view needs no
// override and no extra stylesheet.
//
// `initial: 0` and `loop` are passed straight into `useKeenSlider`'s own
// options (keen-slider.d.ts's `SliderOptions.initial`/`.loop`); `loop` is
// this bench's own `?loop=1` toggle, not a deviation. `slideChanged` and
// `created` are not optional extras: they are how this adapter learns the
// slide count and index at all, since Keen reports neither as a prop.
//
// The published/index signal is this bench's own instrumentation, not
// Keen's: both hooks report `s.track.details.slides.length` and
// `s.track.details.rel` (keen-slider.d.ts's `TrackDetails`) into local
// state, rendered through `BenchDots`. `data-bench-slide="0"` on the first
// `.keen-slider__slide`, and `id="viewport"`/`id="prev"`/`id="next"`, are
// this bench's own markers: Keen moves each slide's own `transform`
// individually, not one shared track element (keen-slider.es.js's render
// step sets `n.style.transform` per slide), so the first slide's own
// bounding rect is the right thing to read, same convention as every other
// adapter's `trackSelector`.
//
// `WheelControls` below is Keen's own documented wheel-support recipe, not
// a library option: Keen ships none (unlike Swiper's `Mousewheel` module
// or Splide's `wheel` option), and its docs' "Scroll wheel controls"
// example (https://keen-slider.io/examples#scroll-wheel-controls) is a
// plugin function you copy into your own code. Copied verbatim from that
// example's source,
// https://github.com/rcbyr/keen-slider-sandboxes/blob/v6/navigation-controls/scroll-wheel-controls/javascript/index.html
// (only types added): it dispatches the same `ksDragStart`/`ksDrag`/
// `ksDragEnd` custom events on `slider.container` that Keen's own
// compiled drag handler already listens for
// (keen-slider.es.js's own `C.input(t,"ksDragStart",z)` etc. in the `b()`
// drag component), so a wheel tick drives the slider exactly the way a
// real drag would. Needed for `wheel-scroll-next` in scenarios.ts, fairness
// rule 3; its own velocity tracking (keen-slider's own pointer-up velocity
// calculation) is why that scenario dispatches a burst of small ticks
// over real elapsed time rather than one big tick -- one tick gives
// `wheelStart`/`wheel` the same timestamp, reading as zero velocity and
// settling back where it started rather than on the next slide.
import 'keen-slider/keen-slider.min.css';
import { useKeenSlider, type KeenSliderInstance } from 'keen-slider/react';
import { useState } from 'react';
import { BenchDots } from './bench-dots';
import { loopFromQuery, SLIDE_COUNT, slideLabel } from './content';

function WheelControls(slider: KeenSliderInstance): void {
  let touchTimeout: ReturnType<typeof setTimeout>;
  let position: { x: number; y: number };
  let wheelActive: boolean;

  function dispatch(e: WheelEvent, name: string) {
    position.x -= e.deltaX;
    position.y -= e.deltaY;
    slider.container.dispatchEvent(
      new CustomEvent(name, { detail: { x: position.x, y: position.y } })
    );
  }

  function wheelStart(e: WheelEvent) {
    position = { x: e.pageX, y: e.pageY };
    dispatch(e, 'ksDragStart');
  }

  function wheel(e: WheelEvent) {
    dispatch(e, 'ksDrag');
  }

  function wheelEnd(e: WheelEvent) {
    dispatch(e, 'ksDragEnd');
  }

  function eventWheel(e: WheelEvent) {
    e.preventDefault();
    if (!wheelActive) {
      wheelStart(e);
      wheelActive = true;
    }
    wheel(e);
    clearTimeout(touchTimeout);
    touchTimeout = setTimeout(() => {
      wheelActive = false;
      wheelEnd(e);
    }, 50);
  }

  slider.on('created', () => {
    slider.container.addEventListener('wheel', eventWheel, {
      passive: false
    });
  });
}

export function KeenApp() {
  const loop = loopFromQuery();
  const [state, setState] = useState<{ count: number; index: number } | null>(
    null
  );
  const [sliderRef, instanceRef] = useKeenSlider<HTMLDivElement>(
    {
      initial: 0,
      loop,
      slideChanged(s) {
        setState({
          count: s.track.details.slides.length,
          index: s.track.details.rel
        });
      },
      created(s) {
        setState({
          count: s.track.details.slides.length,
          index: s.track.details.rel
        });
      }
    },
    [WheelControls]
  );

  return (
    <section>
      <div id="viewport" className="keen-slider" ref={sliderRef}>
        {Array.from({ length: SLIDE_COUNT }, (_, i) => (
          <div
            key={i}
            className="keen-slider__slide"
            data-bench-slide={i === 0 ? '0' : undefined}
          >
            {slideLabel(i)}
          </div>
        ))}
      </div>
      <button
        id="prev"
        type="button"
        onClick={() => instanceRef.current?.prev()}
      >
        Previous
      </button>
      <button
        id="next"
        type="button"
        onClick={() => instanceRef.current?.next()}
      >
        Next
      </button>
      <BenchDots count={state?.count ?? 0} index={state?.index ?? null} />
    </section>
  );
}
