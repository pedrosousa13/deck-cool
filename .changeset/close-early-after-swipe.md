---
"@drawerdeck/core": patch
---

A drawer a touch swipe is closing now closes when the swipe's glide leaves 32 px or less of the Panel in view, instead of when the glide ends, so the page behind takes a tap sooner on iOS. A touch lift arms this for one second at most, and a new touch, a wheel or trackpad scroll, a key press, a pointer down on the viewport, `scrollend`, or new snap points that change the margin disarm it. A glide that stalls within 4 px of closed and never fires `scrollend` also closes: once the Panel has been that close for 100 ms without crossing back out, whenever the glide began. A finger still down, a tap, a slow release near a small snap point and a flick back open never close it early, and a finger down never closes it at any distance, where it used to close 3 px from closed. What runs is one once-only scroll listener per lift plus IntersectionObserver callbacks when the Panel crosses a margin, and nothing per scroll event.
