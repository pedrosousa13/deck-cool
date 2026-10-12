"use client";

import { CoursePlatformPlayer } from "../archetype-course-platform.tsx";

/**
 * The docs' course-platform demo, which the examples page renders too: the
 * archetype with the captions this site serves and a resume point. A docs
 * demo takes no props, so they are set here.
 */
export default function CoursePlatformDemo() {
  return <CoursePlatformPlayer captionsSrc="/archetype-captions.vtt" resumeAt={14} />;
}
