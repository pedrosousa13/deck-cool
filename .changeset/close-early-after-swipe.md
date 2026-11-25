---
"@drawerdeck/core": patch
---

A drawer a touch swipe is closing now closes when the swipe's glide leaves 32 px or less of the Panel in view, instead of when the glide ends, so the page behind takes a tap sooner on iOS. A glide that stalls within 4 px of closed and never fires `scrollend` also closes, 100 ms after it stalls. Only a lift arms this, for one second at most, and a new touch, a wheel or trackpad scroll, a key press, a pointer down on the viewport, new snap points or a resize disarms it. A finger still down, a tap, a slow release near a small snap point and a flick back open never close it early. What runs is one once-only scroll listener per lift plus IntersectionObserver callbacks when the Panel crosses a margin, and nothing per scroll event. A drawer also no longer closes 3 px from closed while a finger is still holding it.
