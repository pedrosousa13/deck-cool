"use client";

import * as Player from "@playdeck/react";

/*
 * The Sintel trailer, the clip /examples' streaming service plays, from the
 * Blender Foundation's own host: the one media origin the CSP allows. MP4
 * first, and Theora for an engine with no H.264 decoder.
 */
const SINTEL = {
  type: "video",
  sources: [
    { src: "https://download.blender.org/durian/trailer/sintel_trailer-720p.mp4", mimeType: "video/mp4" },
    { src: "https://download.blender.org/durian/trailer/sintel_trailer-720p.ogv", mimeType: "video/ogg" },
  ],
} as const satisfies Player.RootProps["source"];

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
 * The home page's one player, rendered once per skin. It carries no class of
 * its own: each skin styles it through playdeck's part names alone. It loads
 * nothing, neither the clip nor the provider, until someone presses play.
 */
export default function SkinPlayer() {
  return (
    <Player.Root loading="interaction" source={SINTEL}>
      <Player.Viewport>
        <Player.Media />
        <Player.ActivationButton />
        <Player.LoadingIndicator />
        <Player.ErrorDisplay />
        <Controls />
      </Player.Viewport>
    </Player.Root>
  );
}
