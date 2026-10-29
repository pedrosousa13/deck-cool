// A consumer of the React 18 build, type-checked with React 18's own types by
// tsconfig.test.json: every primitive takes a ref to its element.
import { createRef } from 'react';
import * as Drawer from '@drawerdeck/react';

const popup = createRef<HTMLDialogElement>();
const trigger = createRef<HTMLButtonElement>();
const panel = createRef<HTMLDivElement>();
const title = createRef<HTMLHeadingElement>();
const description = createRef<HTMLParagraphElement>();
const content = createRef<HTMLDivElement>();
const close = createRef<HTMLButtonElement>();

export const App = () => (
  <Drawer.Root snapPoints={[0.5, 1]}>
    <Drawer.Trigger ref={trigger}>Open</Drawer.Trigger>
    <Drawer.Popup ref={popup}>
      <Drawer.Backdrop />
      <Drawer.Viewport>
        <Drawer.Panel ref={panel}>
          <Drawer.Handle />
          <Drawer.Title ref={title}>Settings</Drawer.Title>
          <Drawer.Description ref={description}>
            Pick an option.
          </Drawer.Description>
          <Drawer.Content ref={content}>…</Drawer.Content>
          <Drawer.Close ref={close}>Done</Drawer.Close>
        </Drawer.Panel>
      </Drawer.Viewport>
    </Drawer.Popup>
  </Drawer.Root>
);

void (<Drawer.Trigger render={<a href="#open" />}>Open</Drawer.Trigger>);
