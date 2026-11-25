---
"@drawerdeck/core": patch
---

A drawer a touch swipe is closing now closes when the swipe's glide leaves 32 px or less of the Panel in view, instead of when the glide ends, so the page behind takes a tap sooner on iOS. It only watches the glide that follows a lift, and only closes while the scroll is moving toward closed: a finger still down, a tap, a later key press or `snapTo` scroll, a slow release near a small snap point, a flick back open and a wheel or trackpad scroll never close it early. A drawer also no longer closes 3 px from closed while a finger is still holding it.
