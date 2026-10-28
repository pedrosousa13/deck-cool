---
title: Quickstart
description: 'A minimal drawerdeck drawer: Drawer.Root, Trigger, Popup, Viewport and Panel, with a Handle, Title and Close, from the beta API proposed in #234.'
---

<!-- demo:example-quickstart -->

```tsx
import * as Drawer from '@drawerdeck/react';

export function Settings() {
  return (
    <Drawer.Root>
      <Drawer.Trigger>Open</Drawer.Trigger>
      <Drawer.Popup>
        <Drawer.Backdrop />
        <Drawer.Viewport>
          <Drawer.Panel>
            <Drawer.Handle />
            <Drawer.Title>Settings</Drawer.Title>
            <Drawer.Content>…</Drawer.Content>
            <Drawer.Close>Done</Drawer.Close>
          </Drawer.Panel>
        </Drawer.Viewport>
      </Drawer.Popup>
    </Drawer.Root>
  );
}
```

With no `snapPoints`, the drawer has one open point: the panel shown at its
content height, capped by its own CSS `max-height`. `Drawer.Popup` renders
the `<dialog>` on the top layer, so it needs no portal.

This is the beta API proposed in #234. `@drawerdeck/core` and
`@drawerdeck/react` are still placeholders (#240), so this example does not
run yet; the demo above is a static mock, marked for #240 to replace with a
live one.
