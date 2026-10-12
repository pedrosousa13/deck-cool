"use client";

import { StreamingServicePlayer } from "../archetype-streaming-service.tsx";

/**
 * The docs' streaming-service demo, which the examples page renders too: the
 * archetype with the captions this site serves and a resume point. A docs
 * demo takes no props, so they are set here.
 */
export default function StreamingServiceDemo() {
  return <StreamingServicePlayer captionsSrc="/archetype-captions.vtt" resumeAt={18} />;
}
