import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  type Ref
} from 'react';
import * as Deck from '@carouseldeck/react';
import * as Player from '@playdeck/react';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** A deck of videos: the one in the focal slide plays, muted; the rest pause.
 * Under reduced motion none plays by itself; a viewer can still press play. */
export function VideoDeck({
  sources,
  loop = false,
  ref
}: {
  sources: readonly string[];
  loop?: boolean;
  /** Each slide's player handle, by slide index, null while unmounted. */
  ref?: Ref<readonly (Player.PlayerHandle | null)[]>;
}) {
  const players = useRef<(Player.PlayerHandle | null)[]>([]);
  const focal = useRef(0);
  useImperativeHandle(ref, () => players.current, []);

  const playFocal = (slide: number) => {
    focal.current = slide;
    const still = () => matchMedia(REDUCED_MOTION).matches;
    players.current.forEach((player, i) => {
      if (i !== slide || still()) void player?.pause();
    });
    if (still()) return;
    // A player loads as its slide comes into view: wait until it can play,
    // and play only if its slide is still the focal one.
    const player = players.current[slide];
    void player?.whenReady().then((ready) => {
      if (ready && focal.current === slide && !still()) void player.play();
    });
  };

  // onFocalChange does not fire for where the deck starts, nor when the
  // viewer's motion preference changes: play or pause for both.
  const replay = useEffectEvent(() => playFocal(focal.current));
  useEffect(() => {
    const query = matchMedia(REDUCED_MOTION);
    const onChange = () => replay();
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return (
    <Deck.Root
      aria-label="Featured slides"
      onFocalChange={playFocal}
      loop={loop}
    >
      <Deck.Viewport>
        {sources.map((source, i) => (
          <Deck.Slide key={i}>
            <SlideVideo
              source={source}
              register={(slide, player) => {
                players.current[slide] = player;
              }}
            />
          </Deck.Slide>
        ))}
      </Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
    </Deck.Root>
  );
}

/** A slide's player, registered by the slide's index. Each slide mounts
 * once (ADR-0013): only a small-deck fallback's copy of it renders this
 * again, showing the video's first frame, still, and registering nothing,
 * so it never replaces or clears the slide's own player. */
function SlideVideo({
  source,
  register
}: {
  source: string;
  register: (slide: number, player: Player.PlayerHandle | null) => void;
}) {
  const { index, copy } = Deck.useSlide();
  if (copy) {
    return (
      <video
        // A start time, as a media fragment, makes Safari load and paint the
        // first frame too, where metadata alone shows nothing.
        src={`${source}#t=0.001`}
        muted
        playsInline
        preload="metadata"
        style={{
          display: 'block',
          width: '100%',
          aspectRatio: '16 / 9',
          objectFit: 'contain'
        }}
      />
    );
  }
  return (
    <Player.Root
      ref={(player) => register(index, player)}
      source={source}
      defaultMuted
      loop
    >
      <Player.Viewport style={{ aspectRatio: '16 / 9' }}>
        <Player.Media />
        <Player.Controls>
          <Player.PlayButton />
        </Player.Controls>
      </Player.Viewport>
    </Player.Root>
  );
}
