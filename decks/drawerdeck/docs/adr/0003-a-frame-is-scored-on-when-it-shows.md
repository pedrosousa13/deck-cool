# A frame is scored on when it shows, not when it starts

This decision is accepted, on 2026-11-04. **Status: built, in #345.**

#329 found that the bench's longest-stall metric (`bench/trace.ts`) keyed
each frame on its `PipelineReporter`'s begin ts: when Chromium's compositor
started that frame attempt, not when it actually reached the screen. Under
a busy main thread, those two moments can be hundreds of milliseconds
apart, and a frame that misses its vsync can fork into a second
`PipelineReporter` (`frame_reporter.frame_type: 'FORKED'`) that carries the
same content to the vsync it actually shows at. Keyed on begin time:

- A stall could be stamped onto the wrong gap. Base UI's own shard-5 rep0
  trace from run 41798197057 scored an 84.4ms-to-284.4ms gap as its
  longest stall (200.0ms); both reporters belong to one frame that
  commits and shows at 301.5ms, so the real gap, to the previous shown
  frame, is 248.2ms.
- Two reporters for one shown frame were double-counted as two frames.
- Which library this helps or hurts depends on how far ahead of its own
  commit each one starts a frame, not on anything the user sees:
  drawerdeck applies a touch's scroll in the frame already running
  (begins slightly before the touch, shows slightly after); React Aria's
  Sheet waits for the next vsync. Scored on begin time, drawerdeck's last
  frame before a busy tick is stamped a vsync earlier than React Aria's,
  which lengthens its scored gap by one frame in 18 of 30 heavy-load
  `touch-drag-half-full-back` reps in that same run -- not because the
  drag stalls more, but because of where each library happens to start
  its own frames.

None of this is a fixable difference between the rivals (#266's fairness
rules: no rival is patched or reconfigured to change it); it is the
metric crediting the wrong moment.

## The fix

`pipelineFrames` now pairs each `PipelineReporter`'s begin (`ph: 'b'`,
carrying `args.frame_reporter`) with its own end (`ph: 'e'`), by `id2`
within the same `pid`/`tid` -- Chromium reuses an id once its reporter
closes, so pairing needs this, not just `ts` order. A frame is keyed on
that end ts: for a presented frame, the moment it is shown. Several
_presented_ reporters that end at the exact same ts, on the same
`pid`/`tid`/`layer_tree_host_id` -- a forked pair -- are deduped to the
one frame they show, not two; a `DROPPED` or `NO_UPDATE_DESIRED` reporter
is never merged with anything else ending at its ts, even another one of
the same state, and nothing merges across a different compositor or
renderer thread (a fairness review of this PR found the first cut merged
on ts alone, which wrongly collapsed 31 `DROPPED`/`DROPPED` and 110
`NO_UPDATE_DESIRED`/`NO_UPDATE_DESIRED` groups in run 41798197057's
traces, and once dropped a presented frame that happened to end at the
same ts as a `NO_UPDATE_DESIRED` one). A begin with no later end, or an
end with no earlier begin, is dropped rather than guessed at, the same
way `activeWindows` already drops an unmatched window mark (#266 rule
10); a gesture's own active window is now also checked against a frame's
end ts, the same ts it's scored on, not its begin ts.

This is the one change `trace.ts`'s `pipelineFrames` needed; every metric
`scoreFrames` derives from its output moves with it, because they share
that one array: `longestStallMs`, `hitchRatioMsPerS`, `droppedCount`,
`droppedPct`, `frameCount`, and the `legacy` mirror of each.
`inputToFirstMovedMs` and `checkerboardedFrames` read the same `frames`
too, so they would move for the same reason; across run 41798197057 they
did not move (see `bench/RESULTS.md`, "Presentation time, not begin
time"). `settleMs`, `opennessAfter`, `raf.*`, `loaf.*`, `initDurationMs`
and `closed` are untouched: `bench.spec.ts` computes them from its own
wall-clock reads and `window.__bench`, never from a trace.

Rescored against run 41798197057's saved traces, the heavy-load
`touch-drag-half-full-back` `longestStallMs` medians move from 233.3ms
(drawerdeck) / 216.7ms (React Aria) / 216.7ms (Base UI) / 233.3ms (vaul)
to 231.2ms / 228.6ms / 243.6ms / 243.6ms. drawerdeck's own number moves
very little; the rivals' move up, because begin-time scoring had been
crediting them for frames they had not actually shown yet.

## Also found

CDP's `Input.dispatchTouchEvent` reaches the renderer only after a main
frame ends, so under a busy tick every library's drag freezes for that
tick, native scroll included. The heavy-load drag in this bench cannot
show native scrolling's main advantage over a JS-driven one; the
comparison page notes this next to the stall row.
