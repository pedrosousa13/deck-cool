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
