// `@splidejs/react-splide`'s own `Splide`/`SplideSlide` components
// (node_modules/.../@splidejs/react-splide/dist/types/components/Splide/
// Splide.d.ts, SplideSlide.d.ts), with the base stylesheet its own
// `./css` export ships (@splidejs/react-splide/package.json). No
// `src/splide.css`: Splide's own bundled CSS already sets
// `.splide__slide{flex-shrink:0}` and Splide's own mount step pins each
// slide's exact pixel width from `perPage` at runtime, which defaults to
// `1` already (@splidejs/splide's own `DEFAULTS.perPage`), so one slide per
// view needs nothing extra.
//
// `type: loop ? 'loop' : 'slide'` is this bench's own `?loop=1` toggle
// (`'slide'` is Splide's own default `type`, so the no-loop branch changes
// nothing); `perPage: 1` is passed explicitly to document the intent
// alongside `type`, even though it matches Splide's own default.
// `arrows: false` and `pagination: false` are the two non-default options
// this adapter sets: Splide renders its own arrow buttons and pagination
// dots by default (`DEFAULTS.arrows`/`.pagination`, both `true`), which
// would double up on this bench's own `#next`/`#prev` buttons and
// `BenchDots` bar inside the same `#viewport` element -- every scenario
// here drives the bench's own controls, never Splide's.
//
// The published/index signal is this bench's own instrumentation, not
// Splide's: `onMounted`/`onMoved` report `s.length`/`s.index` (the first
// callback argument is always the core `Splide` instance, per
// react-splide's own `SplideEventHandlers` type: `(splide, ...args) =>
// ...`; `onMoved`'s own second argument is the event's own `newIndex`,
// per @splidejs/splide's `EventMap['moved']: (index, prev, dest) => void`)
// into local state, rendered through `BenchDots`. `data-bench-slide="0"`
// on the first `SplideSlide` (`React.FC<JSX.IntrinsicElements['li']>`, so
// it forwards to the real `<li>`), and `id="viewport"`/`id="prev"`/
// `id="next"`, are this bench's own markers.
import '@splidejs/react-splide/css';
import { Splide, SplideSlide } from '@splidejs/react-splide';
import { useRef, useState } from 'react';
import { BenchDots } from './bench-dots';
import { loopFromQuery, SLIDE_COUNT, slideLabel } from './content';

export function SplideApp() {
  const loop = loopFromQuery();
  const [state, setState] = useState<{ count: number; index: number } | null>(
    null
  );
  const splideRef = useRef<Splide>(null);

  return (
    <section>
      <Splide
        ref={splideRef}
        id="viewport"
        options={{
          type: loop ? 'loop' : 'slide',
          perPage: 1,
          arrows: false,
          pagination: false
        }}
        onMounted={(s) => setState({ count: s.length, index: s.index })}
        onMoved={(s, newIndex) =>
          setState({ count: s.length, index: newIndex })
        }
      >
        {Array.from({ length: SLIDE_COUNT }, (_, i) => (
          <SplideSlide key={i} data-bench-slide={i === 0 ? '0' : undefined}>
            {slideLabel(i)}
          </SplideSlide>
        ))}
      </Splide>
      <button
        id="prev"
        type="button"
        onClick={() => splideRef.current?.go('-1')}
      >
        Previous
      </button>
      <button
        id="next"
        type="button"
        onClick={() => splideRef.current?.go('+1')}
      >
        Next
      </button>
      <BenchDots count={state?.count ?? 0} index={state?.index ?? null} />
    </section>
  );
}
