"use client";

import * as Player from "@playdeck/react";

/*
 * Sprite Fright (Blender Studio, 2021, CC BY 4.0), as playdeck.video's bench
 * played it: Blender Studio's own uploads to YouTube and to Vimeo.
 */
const SOURCES = {
  youtube: "https://www.youtube.com/watch?v=_cMxraX_5RE",
  vimeo: "https://vimeo.com/640499893",
} as const;

export type SkinProvider = keyof typeof SOURCES;

/** A frame of the film, served from this site, so nothing reaches either host before a press. */
const STILL = {
  src: "/sprite-fright-poster-1024w.webp",
  srcSet: "/sprite-fright-poster-1024w.webp 1024w, /sprite-fright-poster-2048w.webp 2048w",
} as const;

/**
 * The still for each place the player stands, `sizes` being the player's
 * width there. A skin is 416px once the skins sit side by side, from 870px,
 * and the page less its gutters below that; it is far down the page, so its
 * still loads lazily. The showcase, under the hero, fills the 936px measure.
 */
const POSTERS = {
  skin: { ...STILL, sizes: "(min-width: 870px) 416px, calc(100vw - 84px)", loading: "lazy" },
  showcase: { ...STILL, sizes: "(min-width: 980px) 936px, calc(100vw - 44px)" },
} as const satisfies Record<string, Player.ResponsivePoster>;

/**
 * The controls, once there is a player to control. Before that the activation
 * button owns the picture, and a bar under it would be tabbable but covered.
 */
function Controls() {
  const { ready, playing, muted, fullscreen } = Player.usePlayerState((state) => ({
    ready: state.activation === "ready" && state.error === null,
    playing: state.playback === "playing",
    muted: state.muted,
    fullscreen: state.fullscreen,
  }));
  if (!ready) return null;
  return (
    <Player.Controls>
      <Player.PlayButton>{playing ? <Player.PauseIcon /> : <Player.PlayIcon />}</Player.PlayButton>
      <Player.SeekSlider />
      <Player.Time type="current" />
      <Player.MuteButton>{muted ? <Player.MutedIcon /> : <Player.VolumeHighIcon />}</Player.MuteButton>
      <Player.FullscreenButton>
        {fullscreen ? <Player.FullscreenExitIcon /> : <Player.FullscreenEnterIcon />}
      </Player.FullscreenButton>
    </Player.Controls>
  );
}

/**
 * The home page's one player: the showcase under the hero, then once per skin,
 * differing only in the host it plays from. It carries no class of its own:
 * the page styles it through playdeck's part names alone. It loads nothing,
 * neither the film nor the provider, until someone presses play.
 */
export default function SkinPlayer({ provider, stage = "skin" }: { provider: SkinProvider; stage?: keyof typeof POSTERS }) {
  return (
    <Player.Root loading="interaction" source={SOURCES[provider]} poster={POSTERS[stage]}>
      <Player.Viewport>
        <Player.Media />
        {/* YouTube draws its own title and shelf over a paused embed: the
            still covers them. Vimeo shows its own paused frame. */}
        <Player.Poster showWhilePaused={provider === "youtube"} />
        <Player.ActivationButton />
        <Player.LoadingIndicator />
        <Player.ErrorDisplay />
        <Controls />
      </Player.Viewport>
    </Player.Root>
  );
}
