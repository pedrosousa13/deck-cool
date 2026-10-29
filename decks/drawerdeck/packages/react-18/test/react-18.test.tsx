// What only the React 18 build does: the drawer package's own tests cover
// the rest, run again on React 18 and 19 by vitest.react-18.config.ts and
// vitest.react-19.config.ts.
import { createRef, version } from 'react';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import * as Drawer from '@drawerdeck/react';
import { version as distVersion } from '@drawerdeck/react-18/react-version';
import { warnIfUnsupportedReactVersion } from '../src/react-version';

test('runs on React 18', () => {
  expect(version).toMatch(/^18\./);
});

// Excluded from the React 18 run: the sanity check above already covers it.
// Checks the version the built dist itself imports, not only this file's own
// `react` import, which a broken alias in just one of the two configs would
// not catch.
test('runs on React 19', () => {
  expect(version).toMatch(/^19\./);
  expect(distVersion).toMatch(/^19\./);
});

test('logs no development error on this React version', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnIfUnsupportedReactVersion(version);
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});

test('logs a development error naming another major version', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnIfUnsupportedReactVersion('17.2.0');
  expect(error).toHaveBeenCalledWith(
    expect.stringContaining('this is React 17.2.0')
  );
  error.mockRestore();
});

test('a ref reaches the element of every primitive', () => {
  const refs = {
    trigger: createRef<HTMLButtonElement>(),
    popup: createRef<HTMLDialogElement>(),
    backdrop: createRef<HTMLDivElement>(),
    viewport: createRef<HTMLDivElement>(),
    panel: createRef<HTMLDivElement>(),
    handle: createRef<HTMLDivElement>(),
    title: createRef<HTMLHeadingElement>(),
    description: createRef<HTMLParagraphElement>(),
    content: createRef<HTMLDivElement>(),
    close: createRef<HTMLButtonElement>()
  };
  render(
    <Drawer.Root>
      <Drawer.Trigger ref={refs.trigger}>Open</Drawer.Trigger>
      <Drawer.Popup ref={refs.popup}>
        <Drawer.Backdrop ref={refs.backdrop} />
        <Drawer.Viewport ref={refs.viewport}>
          <Drawer.Panel ref={refs.panel}>
            <Drawer.Handle ref={refs.handle} />
            <Drawer.Title ref={refs.title}>Test drawer</Drawer.Title>
            <Drawer.Description ref={refs.description}>
              A drawer for testing.
            </Drawer.Description>
            <Drawer.Content ref={refs.content}>Row</Drawer.Content>
            <Drawer.Close ref={refs.close}>Close</Drawer.Close>
          </Drawer.Panel>
        </Drawer.Viewport>
      </Drawer.Popup>
    </Drawer.Root>
  );

  expect(refs.trigger.current).toHaveAttribute('data-drawerdeck-trigger');
  expect(refs.popup.current?.tagName).toBe('DIALOG');
  expect(refs.backdrop.current).toHaveAttribute('data-drawerdeck-backdrop');
  expect(refs.viewport.current).toHaveAttribute('data-drawerdeck-viewport');
  expect(refs.panel.current).toHaveAttribute('data-drawerdeck-panel');
  expect(refs.handle.current).toHaveAttribute('data-drawerdeck-handle');
  expect(refs.title.current).toHaveAttribute('data-drawerdeck-title');
  expect(refs.description.current).toHaveAttribute(
    'data-drawerdeck-description'
  );
  expect(refs.content.current).toHaveAttribute('data-drawerdeck-content');
  expect(refs.close.current).toHaveAttribute('data-drawerdeck-close');
});

test('a render prop clones the part onto the given element', () => {
  render(
    <Drawer.Root>
      <Drawer.Trigger render={<a href="#open" />}>Open</Drawer.Trigger>
      <Drawer.Popup>
        <Drawer.Viewport>
          <Drawer.Panel />
        </Drawer.Viewport>
      </Drawer.Popup>
    </Drawer.Root>
  );

  const trigger = screen.getByText('Open');
  expect(trigger.tagName).toBe('A');
  expect(trigger).toHaveAttribute('data-drawerdeck-trigger');
});

test('server HTML renders every part and React 18 warns of nothing', () => {
  const error = vi.spyOn(console, 'error');
  const html = renderToString(
    <Drawer.Root>
      <Drawer.Trigger>Open</Drawer.Trigger>
      <Drawer.Popup>
        <Drawer.Viewport>
          <Drawer.Panel>
            <Drawer.Title>Test drawer</Drawer.Title>
          </Drawer.Panel>
        </Drawer.Viewport>
      </Drawer.Popup>
    </Drawer.Root>
  );

  expect(html).toContain('data-drawerdeck-popup');
  expect(html).toContain('Test drawer');
  // Only the layout-effect warning a server render in a browser prints: on
  // the server, where there is no window, the build uses useEffect instead.
  const warnings = error.mock.calls
    .map(([message]) => String(message))
    .filter((message) => !message.includes('useLayoutEffect does nothing'));
  expect(warnings).toEqual([]);
});
