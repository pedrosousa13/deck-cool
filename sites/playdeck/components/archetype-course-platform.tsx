// Ported from pedrosousa13/playdeck's examples/archetype-course-platform.tsx at
// cf72813. One change: its stylesheet moved out of an inline <style> into
// styles/archetype-course-platform.css, because the site's CSP takes styles from the
// site alone. The island is components/demos/course-platform.tsx.
import * as Player from '@playdeck/react';
import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactElement
} from 'react';

/*
 * The course-platform archetype: a layout for studying rather than watching.
 *
 * Named for the job, like its sibling — no logo, company name or brand
 * colour, and the two glyphs below are drawn in this file rather than
 * borrowed.
 *
 * ---- what makes this the OTHER archetype ------------------------------------
 *
 * `examples/archetype-streaming-service.tsx` is the same primitives arranged
 * for someone who has sat down in front of a film. Four differences are
 * structural rather than cosmetic, and they are the whole reason both files
 * exist — remove them and this would be the first archetype with different
 * colours:
 *
 * 1. **The video is not the only thing on screen.** A two-column study page —
 *    the lesson beside the picture — with the picture giving up width for it.
 * 2. **The chrome is docked, not overlaid.** The transport sits under the
 *    picture in normal flow rather than on top of it, so nothing auto-hides.
 * 3. **Speed is a first-class control**, a visible segmented group rather
 *    than a menu item, because somebody studying changes rate constantly. The
 *    streaming layout omits it: a viewer watching a film has no use for it.
 * 4. **Navigation is by outline** — real buttons that seek to a section, the
 *    one playing marked — where the streaming layout draws chapters as ticks
 *    on the scrubber, a hint while scrubbing rather than a way to get around.
 */

/*
 * The clip: the Big Buck Bunny trailer, standing in for a lesson recording.
 * CC-BY 3.0, credited under the player and on every page that mounts this
 * file.
 *
 * Two containers, and the order is load-bearing: the first is an MPEG-4 file
 * the host serves as `video/x-m4v`, which not every engine accepts, and the
 * Theora file behind it is what those engines take instead of failing source
 * selection outright.
 */
const bigBuckBunnyTrailer = {
  type: 'video',
  sources: [
    {
      src: 'https://download.blender.org/peach/trailer/trailer_iphone.m4v',
      mimeType: 'video/mp4'
    },
    {
      src: 'https://download.blender.org/peach/trailer/trailer_400p.ogg',
      mimeType: 'video/ogg'
    }
  ]
} as const satisfies Player.RootProps['source'];

/*
 * The recording AND everything the lesson says about it, as one value —
 * overridable together through the `media` prop below, so a page that serves
 * its own recording (e.g. because it makes no cross-origin request) can
 * replace it.
 *
 * One object because this file has already been caught with the two apart:
 * with only the source replaceable, a page pointed it at its own test
 * pattern and the heading, note and credit went on describing a Blender
 * movie that was not playing.
 */
const openMovieLesson = {
  source: bigBuckBunnyTrailer,
  title: 'Rendering an open movie',
  note: 'This lesson plays a Blender Foundation open movie. Its outline, the notes beside it and the caption text are fixtures this example ships — they mark time in the clip and make no claim about the film.',
  credit: 'Big Buck Bunny © Blender Foundation, licensed CC BY 3.0.'
} as const;

/*
 * The lesson outline: deliberately the course's own data, not read from the
 * media — a course platform knows its structure because it authored it,
 * where the streaming archetype prefers whatever chapters the provider
 * publishes. The titles are fixture text marking time in the clip, not a
 * claim about the film.
 *
 * The times are spaced to land inside the trailer above; a section starting
 * after its last frame would be an unreachable button and progress step.
 * Pointing this at a longer recording means respacing these — the cost of an
 * outline being the course's data rather than the media's.
 */
const outline = [
  { id: 's1', title: 'Introduction', startTime: 0 },
  { id: 's2', title: 'Part one', startTime: 7 },
  { id: 's3', title: 'Part two', startTime: 14 },
  { id: 's4', title: 'Part three', startTime: 21 },
  { id: 's5', title: 'Wrap-up', startTime: 28 }
] as const;

const two = (value: number): string =>
  String(Math.floor(value)).padStart(2, '0');

/** `m:ss`, which is the whole of the arithmetic this example needs. */
const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${two(seconds % 60)}`;

/** The rungs a person studying actually reaches for. */
const rates = [0.75, 1, 1.25, 1.5, 2] as const;

/*
 * A bracket opening to the right: the mark this layout uses for "outline".
 * Drawn here because the library ships no such icon and there is no borrowed
 * glyph to reach for.
 */
const OutlineGlyph = (): ReactElement => (
  <svg
    aria-hidden="true"
    className="study-glyph"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeWidth="1.6"
    viewBox="0 0 24 24"
  >
    <path d="M5 5.5h14M5 12h9M5 18.5h11" />
  </svg>
);

/*
 * The resume mark: an arc returning on itself. Same idea as the streaming
 * archetype's, drawn separately because each example is one paste for a
 * consumer and neither may import from the other.
 */
const ResumeGlyph = (): ReactElement => (
  <svg
    aria-hidden="true"
    className="study-glyph"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeWidth="1.7"
    viewBox="0 0 24 24"
  >
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M3.4 4.6v3.2h3.2" />
  </svg>
);

/**
 * The playback-rate control. Gated on `setPlaybackRate` reading `available`
 * — absent where the provider will not honour the command, never present and
 * disabled. The checked rung follows `PlayerState.playbackRate` rather than a
 * local copy, so a rate the provider declined to apply cannot show selected.
 *
 * `aria-pressed` on plain buttons rather than a radio group: a toolbar of
 * toggles operated by Tab and Enter is what someone reaching for 1.25×
 * repeatedly wants, where a radio group would trade that for arrow-key
 * roving inside one stop.
 */
const RateControl = (): ReactElement | null => {
  const { playbackRate, status } = Player.usePlayerState((state) => ({
    playbackRate: state.playbackRate,
    status: state.capabilities.setPlaybackRate.status
  }));
  const actions = Player.usePlayerActions();
  if (status !== 'available') return null;
  return (
    <div aria-label="Playback speed" className="study-rates" role="group">
      <span aria-hidden="true" className="study-rates__label">
        Speed
      </span>
      {rates.map((rate) => (
        <button
          aria-pressed={playbackRate === rate}
          className="study-rate"
          key={rate}
          onClick={() => {
            void actions.setPlaybackRate(rate);
          }}
          type="button"
        >
          {rate}&times;
        </button>
      ))}
    </div>
  );
};

/**
 * The outline: every entry a real button that seeks, gated as a set on
 * `capabilities.seek` — where seeking is not `available` the same list
 * renders as plain text, so nothing offers an action that cannot be taken.
 *
 * `unavailable` and `unknown` get different treatment, not just two cases
 * collapsed to one: `unknown` is what every capability reads before a
 * provider has attached, which this `loading="interaction"` player's visitor
 * meets first, and printing a refusal there would be false about a source
 * that simply hasn't answered yet. So the hint is bound to `unavailable`
 * alone.
 *
 * The section being played is marked with `aria-current`, what a screen
 * reader announces; the visible marker beside it is a shape and a weight
 * rather than colour alone.
 */
const Outline = (): ReactElement => {
  const { currentTime, seekStatus } = Player.usePlayerState((state) => ({
    currentTime: state.currentTime,
    seekStatus: state.capabilities.seek.status
  }));
  const actions = Player.usePlayerActions();
  const active = [...outline]
    .reverse()
    .find((section) => currentTime >= section.startTime);
  const navigable = seekStatus === 'available';

  return (
    <nav aria-label="Lesson outline" className="study-outline">
      <h3 className="study-panel__title">
        <OutlineGlyph />
        Outline
      </h3>
      <ol className="study-sections">
        {outline.map((section, index) => {
          const current = section.id === active?.id;
          const body = (
            <>
              <span className="study-section__index">{index + 1}</span>
              <span className="study-section__title">{section.title}</span>
              <span className="study-section__time">
                {clock(section.startTime)}
              </span>
            </>
          );
          return (
            <li key={section.id}>
              {navigable ? (
                <button
                  aria-current={current ? 'true' : undefined}
                  className="study-section"
                  onClick={() => {
                    void actions.seekTo(section.startTime);
                  }}
                  type="button"
                >
                  {body}
                </button>
              ) : (
                <span
                  aria-current={current ? 'true' : undefined}
                  className="study-section study-section--static"
                >
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {seekStatus === 'unavailable' ? (
        <p className="study-hint">
          This source cannot be seeked, so the outline reads rather than
          navigates.
        </p>
      ) : null}
    </nav>
  );
};

/** How far through the outline the playhead is — a study readout, not a clock. */
const Progress = (): ReactElement => {
  const currentTime = Player.usePlayerState((state) => state.currentTime);
  const reached = outline.filter(
    (section) => currentTime >= section.startTime
  ).length;
  return (
    <p className="study-progress">
      Section {Math.max(reached, 1)} of {outline.length}
    </p>
  );
};

/*
 * Undoes `ActivationButton`'s full-bleed overlay style (`position`, `inset`,
 * `margin`, `z-index` — see `loading-error.tsx`), so the resume banner below
 * gets an ordinary button in a row of text instead. `margin: 0` matters here
 * specifically: once this box is a flex item, an auto margin absorbs free
 * space in its line.
 *
 * The picture's own start affordance below does NOT take this — its
 * positioning is left exactly as the library ships it, because there the
 * full-bleed overlay is the design; `.study-start` only gives it a look.
 */
const inFlow: CSSProperties = {
  position: 'static',
  inset: 'auto',
  margin: 0,
  zIndex: 'auto'
};

export type CoursePlatformPlayerProps = {
  /**
   * A same-origin WebVTT captions file. It arrives as a prop because each
   * surface serves its own copy from its own base path — the one thing about
   * this composition Storybook and the site cannot answer identically.
   */
  readonly captionsSrc: string;
  /**
   * Where this learner stopped last time, in seconds, or `null` for a first
   * visit. A real platform reads it from an enrolment record; the example takes
   * it as a prop rather than inventing a persistence layer it would then have
   * to defend.
   */
  readonly resumeAt?: number | null;
  /**
   * The recording to play, and what the lesson says about it — `source` the
   * recording, `title` the heading, `note` the notes panel's first
   * paragraph, `credit` the attribution line (see `openMovieLesson` for why
   * the four travel together). Defaults to the trailer above, so a consumer
   * who passes nothing gets the whole archetype from one paste.
   *
   * The outline above is spaced for a recording at least as long as the
   * trailer; a much shorter one would leave sections nobody could reach.
   */
  readonly media?: {
    readonly source: Player.RootProps['source'];
    readonly title: string;
    readonly note: string;
    readonly credit: string;
  };
};

/**
 * The archetype: the composition, the recording it is pointed at, and the
 * loading strategy that holds it dormant. This is what a page mounts.
 *
 * `loading="interaction"` means nothing is fetched and no provider is attached
 * until the learner starts the lesson, so a course page carrying this player
 * makes no request for media — cross-origin or otherwise — before that press.
 */
export const CoursePlatformPlayer = ({
  captionsSrc,
  media = openMovieLesson,
  resumeAt = null
}: CoursePlatformPlayerProps): ReactElement => (
  <Player.Root loading="interaction" source={media.source}>
    <CoursePlatformSurface
      captionsSrc={captionsSrc}
      media={media}
      resumeAt={resumeAt}
    />
  </Player.Root>
);

/**
 * Everything inside `Player.Root` — separable because every hook below reads
 * the player, and a hook can only reach one from inside the root.
 *
 * Exported so a workbench story can supply its own root and dial the
 * capabilities in, the only way to see the whole control surface with no
 * media and no network, while `CoursePlatformPlayer` mounts the recording. It
 * reads every field of `media` except `source`, which the root above mounts —
 * see the comment on `openMovieLesson` for why the two travel together.
 */
export const CoursePlatformSurface = ({
  captionsSrc,
  media = openMovieLesson,
  resumeAt = null
}: CoursePlatformPlayerProps): ReactElement => {
  const state = Player.usePlayerState((snapshot) => ({
    activation: snapshot.activation,
    commandsReady: snapshot.commandsReady,
    errored: snapshot.error !== null,
    playing: snapshot.playback === 'playing',
    muted: snapshot.muted,
    fullscreen: snapshot.fullscreen
  }));
  const actions = Player.usePlayerActions();

  /*
   * The resume decision, carried from the press to the moment there is a
   * player to act on. A ref rather than state: nothing renders from it, and
   * the affordance that writes it unmounts as soon as the player is ready.
   * The effect clears the flag so a later source swap cannot silently seek
   * somewhere nobody asked for.
   *
   * Gated on `commandsReady` rather than `activation === 'ready'`: the latter
   * only means there is a picture, and a seek issued right there can land on
   * an element a queued `load()` is about to empty. `commandsReady` is the
   * provider's signal that a command now will stick
   * (`PlayerState.commandsReady`) — gating on it is what keeps the resume
   * position from being silently lost (#551).
   */
  const resumeRequested = useRef(false);
  const ready = state.activation === 'ready';
  useEffect(() => {
    if (!state.commandsReady || !resumeRequested.current || resumeAt === null)
      return;
    resumeRequested.current = false;
    void actions.seekTo(resumeAt);
  }, [actions, state.commandsReady, resumeAt]);

  /*
   * The transport is docked below the picture, not overlaid, but the
   * accessibility problem is the same one either way: while
   * `ActivationButton` or `ErrorDisplay` owns the picture, the commands under
   * it act on a player that does not exist yet, so `hidden` takes the row
   * out of layout and the accessibility tree rather than merely dimming it.
   */
  const notReady = !ready || state.errored;

  return (
    <>
      <section aria-label="Lesson" className="study">
        <div className="study-main">
          {resumeAt === null || ready ? null : (
            <div className="study-resume">
              <p className="study-resume__text">
                You stopped at {clock(resumeAt)}.
              </p>
              <Player.ActivationButton
                aria-label={`Resume the lesson from ${clock(resumeAt)}`}
                className="study-resume__button"
                onClick={() => {
                  resumeRequested.current = true;
                }}
                style={inFlow}
              >
                <ResumeGlyph />
                Resume
              </Player.ActivationButton>
            </div>
          )}

          <Player.Viewport className="study-stage">
            <Player.Media
              className="study-media"
              textTracks={[
                {
                  src: captionsSrc,
                  srcLang: 'en',
                  label: 'English',
                  kind: 'captions',
                  default: true
                }
              ]}
            />
            <Player.LoadingIndicator className="study-loading" />
            <Player.ErrorDisplay className="study-error">
              {({ error, retry }) => (
                <>
                  <p>{error.message}</p>
                  {retry ? (
                    <button
                      className="study-retry"
                      onClick={retry}
                      type="button"
                    >
                      Try again
                    </button>
                  ) : null}
                </>
              )}
            </Player.ErrorDisplay>
            {/* Left at its own full-bleed size, this is the whole picture —
                one control, and a press anywhere starts the lesson. The
                badge inside is an `aria-hidden` span, not a second control,
                so it adds nothing to the tab order or accessible name. */}
            <Player.ActivationButton
              aria-label="Start the lesson"
              className="study-start"
            >
              <span aria-hidden="true" className="study-start__badge" />
            </Player.ActivationButton>
            <Player.Captions className="study-captions" hidden={notReady} />
          </Player.Viewport>

          {/* The docked transport. Two rows in normal flow under the picture:
              the scrubber, then the commands. Nothing auto-hides, because
              nothing is covering anything. */}
          <Player.Controls
            aria-label="Lesson player controls"
            className="study-transport"
            hidden={notReady}
          >
            <div className="study-row">
              <Player.Time className="study-time" type="current" />
              <Player.SeekSlider className="study-seek" />
              <Player.Time className="study-time" type="duration" />
            </div>
            <div className="study-row study-row--wrap">
              <Player.PlayButton className="study-chip">
                {state.playing ? <Player.PauseIcon /> : <Player.PlayIcon />}
              </Player.PlayButton>
              <Player.MuteButton className="study-chip">
                {state.muted ? <Player.MutedIcon /> : <Player.VolumeHighIcon />}
              </Player.MuteButton>
              <Player.VolumeSlider className="study-volume" />
              <RateControl />
              <span className="study-spacer" />
              <Player.CaptionsButton className="study-chip">
                <Player.CaptionsIcon />
              </Player.CaptionsButton>
              <Player.FullscreenButton className="study-chip">
                {state.fullscreen ? (
                  <Player.FullscreenExitIcon />
                ) : (
                  <Player.FullscreenEnterIcon />
                )}
              </Player.FullscreenButton>
            </div>
          </Player.Controls>

          <div className="study-heading">
            <h2 className="study-title">{media.title}</h2>
            <Progress />
          </div>

          {/* The material. It is here because a study page that showed only a
              video would be the viewing archetype with a sidebar bolted on —
              somebody working through a lesson reads while the recording
              plays, and this is the half of the screen that says so. */}
          <div className="study-notes">
            <h3 className="study-panel__title">Notes</h3>
            <p>{media.note}</p>
            <p>
              Every control under the picture is drawn only where the player
              reports it can honour the command. Change the source to one that
              refuses seeking and the outline stops being buttons; change it to
              one that refuses a rate change and the speed row is not drawn at
              all.
            </p>
            <p className="study-credit">{media.credit}</p>
          </div>
        </div>

        <aside className="study-rail">
          <Outline />
        </aside>
      </section>
    </>
  );
};

