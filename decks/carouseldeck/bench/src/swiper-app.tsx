// Swiper's own React components (swiper/react's `Swiper`/`SwiperSlide`,
// typed by node_modules/.../swiper/swiper-react.d.ts, the file the
// package's own `./react` export points `types` at). Base layout comes
// from `swiper/css` (swiper/package.json's `./css` export); no
// `src/swiper.css`: Swiper's own default `slidesPerView` (1) and its
// bundled stylesheet already lay out one full-width slide per view at
// the bench's own viewport width (playwright.config.ts) with nothing
// extra.
//
// `loop` is this bench's own `?loop=1` toggle, passed straight into
// `<Swiper>`'s own `loop` prop (`SwiperOptions.loop` is merged into
// `SwiperProps` through the core's own declaration-merged options type).
// `modules={[Mousewheel]}` and `mousewheel` are the one non-default option
// this adapter sets: Swiper supports wheel/trackpad scrolling only through
// its own bundled `Mousewheel` module
// (node_modules/.../swiper/modules/mousewheel/mousewheel.d.ts:
// `MousewheelOptions.enabled` defaults to `false`), and `wheel-scroll-next`
// in scenarios.ts needs it, same as fairness rule 11 in that file's header
// comment.
//
// The published/index signal is this bench's own instrumentation, not
// Swiper's: `onSwiper`/`onSlideChange` report `s.realIndex` (not
// `activeIndex`, which double-counts Swiper's own loop-duplicate slides,
// per swiper/core/core.d.ts's distinction between the two) into local
// state, rendered through `BenchDots`. `SLIDE_COUNT` is used directly for
// `count` here, rather than read off a Swiper API, since Swiper's own
// events report only the index; the slide count is this adapter's own
// static JSX, the same way it is for Keen and Embla before their first
// callback fires. `data-bench-slide="0"` on the first `SwiperSlide`, and
// `id="viewport"`/`id="prev"`/`id="next"`, are this bench's own markers:
// `<Swiper>` and `<SwiperSlide>` both forward arbitrary HTML attributes to
// their own rendered elements (swiper-react.d.ts: both prop types extend
// `React.HTMLAttributes<HTMLElement>`).
import type { Swiper as SwiperClass } from 'swiper';
import { Mousewheel } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import { useRef, useState } from 'react';
import 'swiper/css';
import { BenchDots } from './bench-dots';
import { loopFromQuery, SLIDE_COUNT, slideLabel } from './content';

export function SwiperApp() {
  const loop = loopFromQuery();
  const [state, setState] = useState<{ count: number; index: number } | null>(
    null
  );
  const swiperRef = useRef<SwiperClass | null>(null);

  return (
    <section>
      <Swiper
        id="viewport"
        loop={loop}
        modules={[Mousewheel]}
        mousewheel
        onSwiper={(s) => {
          swiperRef.current = s;
          setState({ count: SLIDE_COUNT, index: s.realIndex });
        }}
        onSlideChange={(s) =>
          setState({ count: SLIDE_COUNT, index: s.realIndex })
        }
      >
        {Array.from({ length: SLIDE_COUNT }, (_, i) => (
          <SwiperSlide key={i} data-bench-slide={i === 0 ? '0' : undefined}>
            {slideLabel(i)}
          </SwiperSlide>
        ))}
      </Swiper>
      <button
        id="prev"
        type="button"
        onClick={() => swiperRef.current?.slidePrev()}
      >
        Previous
      </button>
      <button
        id="next"
        type="button"
        onClick={() => swiperRef.current?.slideNext()}
      >
        Next
      </button>
      <BenchDots count={state?.count ?? 0} index={state?.index ?? null} />
    </section>
  );
}
