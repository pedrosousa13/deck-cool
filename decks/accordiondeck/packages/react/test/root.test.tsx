import {
  act,
  StrictMode,
  memo,
  useEffect,
  useState,
  type ReactNode
} from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Accordion from '@accordiondeck/react';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function mount(ui: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(ui));
  return container;
}

/** Server-renders `ui`, lets `beforeHydrate` act on the bare HTML (a click
 * before any JavaScript), then hydrates it. */
async function serverRendered(
  ui: ReactNode,
  beforeHydrate?: (container: HTMLElement) => void
) {
  const container = document.createElement('div');
  container.innerHTML = renderToString(ui);
  document.body.append(container);
  beforeHydrate?.(container);
  await act(async () => {
    roots.push(hydrateRoot(container, ui));
  });
  return container;
}

/** Runs `fn` where React is not told it is in a test: what the browser does
 * on its own (a `toggle` nobody caused) updates state outside any `act`. */
async function outsideAct(fn: () => void | Promise<void>) {
  const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  g.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    await fn();
    await later();
  } finally {
    g.IS_REACT_ACT_ENVIRONMENT = true;
  }
}

const later = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
const item = (c: ParentNode, id: string) =>
  c.querySelector<HTMLDetailsElement>(`details#${id}`)!;
const trigger = (c: ParentNode, id: string) =>
  item(c, id).querySelector('summary')!;
const click = (el: HTMLElement) => act(() => el.click());
const openIds = (c: ParentNode) =>
  [...c.querySelectorAll('details')].filter((d) => d.open).map((d) => d.id);

function Items({
  ids = ['a', 'b', 'c'],
  itemProps = {}
}: {
  ids?: string[];
  itemProps?: Record<string, Accordion.ItemProps>;
}) {
  return ids.map((id) => (
    <Accordion.Item key={id} id={id} value={id} {...itemProps[id]}>
      <Accordion.Trigger>{id}</Accordion.Trigger>
      <Accordion.Panel>
        <p>panel {id}</p>
      </Accordion.Panel>
    </Accordion.Item>
  ));
}

function Group({
  ids,
  itemProps,
  ...root
}: Accordion.RootProps & Parameters<typeof Items>[0]) {
  return (
    <Accordion.Root {...root}>
      <Items ids={ids} itemProps={itemProps} />
    </Accordion.Root>
  );
}

/** A parent that owns `value`, and declines every change when `decline`. */
function Controlled({
  decline = false,
  initial = [],
  onChange,
  ...rest
}: Omit<Accordion.RootProps, 'value' | 'defaultValue'> &
  Parameters<typeof Items>[0] & {
    decline?: boolean;
    initial?: string[];
    onChange: (value: string[]) => void;
  }) {
  const [value, setValue] = useState(initial);
  return (
    <Group
      {...rest}
      value={value}
      onValueChange={(next) => {
        onChange(next);
        if (!decline) setValue(next);
      }}
    />
  );
}

describe('the Root element', () => {
  it('renders a div with data-orientation vertical by default', async () => {
    const c = await mount(<Group />);
    const root = c.firstElementChild!;
    expect(root.tagName).toBe('DIV');
    expect(root.getAttribute('data-orientation')).toBe('vertical');
  });

  it('renders data-orientation horizontal', async () => {
    const c = await mount(<Group orientation="horizontal" />);
    expect(c.firstElementChild!.getAttribute('data-orientation')).toBe(
      'horizontal'
    );
  });

  it('takes render, an element or a function', async () => {
    const c = await mount(
      <>
        <Group render={<section data-kind="element" />} />
        <Group render={(props) => <article {...props} data-kind="fn" />} />
      </>
    );
    expect(c.querySelector('section[data-kind="element"]')).not.toBeNull();
    const article = c.querySelector('article[data-kind="fn"]')!;
    expect(article.getAttribute('data-orientation')).toBe('vertical');
  });

  it('passes className and other props through', async () => {
    const c = await mount(<Group className="x" data-extra="1" />);
    expect(c.firstElementChild!.className).toBe('x');
    expect(c.firstElementChild!.getAttribute('data-extra')).toBe('1');
  });
});

describe('the group name', () => {
  it('gives every Item in single mode the same name', async () => {
    const c = await mount(<Group />);
    const names = [...c.querySelectorAll('details')].map((d) =>
      d.getAttribute('name')
    );
    expect(names[0]).toBeTruthy();
    expect(new Set(names).size).toBe(1);
    expect(names).toHaveLength(3);
  });

  it('takes the name prop over its own', async () => {
    const c = await mount(<Group name="mine" />);
    expect(
      [...c.querySelectorAll('details')].map((d) => d.getAttribute('name'))
    ).toEqual(['mine', 'mine', 'mine']);
  });

  it('sets no name in multiple mode, even with a name prop', async () => {
    const c = await mount(
      <>
        <Group multiple />
        <Group multiple name="mine" />
      </>
    );
    for (const d of c.querySelectorAll('details'))
      expect(d.hasAttribute('name')).toBe(false);
  });

  it('keeps a nested Root as its own group, with its own name', async () => {
    const onOuter = vi.fn();
    const onInner = vi.fn();
    const c = await mount(
      <Accordion.Root onValueChange={onOuter} defaultValue={['x']}>
        <Accordion.Item id="x" value="x">
          <Accordion.Trigger>x</Accordion.Trigger>
          <Accordion.Panel>
            <Accordion.Root onValueChange={onInner}>
              <Accordion.Item id="inner-x" value="x">
                <Accordion.Trigger>inner x</Accordion.Trigger>
                <Accordion.Panel>p</Accordion.Panel>
              </Accordion.Item>
              <Accordion.Item id="inner-y" value="y">
                <Accordion.Trigger>inner y</Accordion.Trigger>
                <Accordion.Panel>p</Accordion.Panel>
              </Accordion.Item>
            </Accordion.Root>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item id="y" value="y">
          <Accordion.Trigger>y</Accordion.Trigger>
          <Accordion.Panel>p</Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
    );
    expect(item(c, 'x').getAttribute('name')).not.toBe(
      item(c, 'inner-x').getAttribute('name')
    );
    expect(item(c, 'inner-x').getAttribute('name')).toBe(
      item(c, 'inner-y').getAttribute('name')
    );
    // The outer value ['x'] does not open the inner Item that is also "x".
    expect(item(c, 'inner-x').open).toBe(false);
    await click(trigger(c, 'inner-y'));
    await later();
    expect(onInner.mock.calls).toEqual([[['y']]]);
    expect(onOuter).not.toHaveBeenCalled();
    expect(openIds(c)).toEqual(['x', 'inner-y']);
  });

  it('forms two groups from two server-rendered Roots given distinct names', async () => {
    const ui = (
      <>
        <Group name="one" ids={['a', 'b']} />
      </>
    );
    const second = <Group name="two" ids={['c', 'd']} />;
    const container = document.createElement('div');
    container.innerHTML = renderToString(ui) + renderToString(second);
    document.body.append(container);
    // Before any JavaScript: opening one Item in each group keeps both open.
    trigger(container, 'a').click();
    trigger(container, 'c').click();
    expect(openIds(container)).toEqual(['a', 'c']);
    // And one group still keeps one open.
    trigger(container, 'b').click();
    expect(openIds(container)).toEqual(['b', 'c']);
  });
});

describe('value, uncontrolled', () => {
  it('starts with defaultValue open', async () => {
    const c = await mount(<Group defaultValue={['b']} />);
    expect(openIds(c)).toEqual(['b']);
    expect(trigger(c, 'b').getAttribute('aria-expanded')).toBe('true');
    expect(trigger(c, 'a').getAttribute('aria-expanded')).toBe('false');
  });

  it('opens one Item and closes the other in single mode, reported once', async () => {
    const onValueChange = vi.fn();
    const c = await mount(
      <Group defaultValue={['a']} onValueChange={onValueChange} />
    );
    await click(trigger(c, 'b'));
    await later();
    expect(openIds(c)).toEqual(['b']);
    expect(onValueChange.mock.calls).toEqual([[['b']]]);
  });

  it('closes the open Item on its Trigger in single mode', async () => {
    const onValueChange = vi.fn();
    const c = await mount(
      <Group defaultValue={['a']} onValueChange={onValueChange} />
    );
    await click(trigger(c, 'a'));
    await later();
    expect(openIds(c)).toEqual([]);
    expect(onValueChange.mock.calls).toEqual([[[]]]);
  });

  it('lets any number open in multiple mode, in document order', async () => {
    const onValueChange = vi.fn();
    const c = await mount(<Group multiple onValueChange={onValueChange} />);
    await click(trigger(c, 'c'));
    await click(trigger(c, 'a'));
    await later();
    expect(openIds(c)).toEqual(['a', 'c']);
    await click(trigger(c, 'c'));
    await later();
    expect(openIds(c)).toEqual(['a']);
    expect(onValueChange.mock.calls).toEqual([[['c']], [['a', 'c']], [['a']]]);
  });
});

describe('value, controlled', () => {
  it('follows the value prop', async () => {
    const c = await mount(<Group value={['c']} />);
    expect(openIds(c)).toEqual(['c']);
  });

  it('asks the parent, which accepts', async () => {
    const onChange = vi.fn();
    const c = await mount(<Controlled initial={['a']} onChange={onChange} />);
    await click(trigger(c, 'b'));
    await later();
    expect(onChange.mock.calls).toEqual([[['b']]]);
    expect(openIds(c)).toEqual(['b']);
    expect(trigger(c, 'b').getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps the old value when the parent declines a click', async () => {
    const onChange = vi.fn();
    const c = await mount(
      <Controlled decline initial={['a']} onChange={onChange} />
    );
    await click(trigger(c, 'b'));
    await later();
    expect(onChange.mock.calls).toEqual([[['b']]]);
    expect(openIds(c)).toEqual(['a']);
    expect(trigger(c, 'a').getAttribute('aria-expanded')).toBe('true');
    expect(trigger(c, 'b').getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps a multiple Item open when the parent declines its close', async () => {
    const onChange = vi.fn();
    const c = await mount(
      <Controlled multiple decline initial={['a']} onChange={onChange} />
    );
    await click(trigger(c, 'a'));
    await later();
    expect(onChange.mock.calls).toEqual([[[]]]);
    expect(openIds(c)).toEqual(['a']);
  });
});

describe('an Item inside a Root', () => {
  it('ignores open and defaultOpen, with a dev warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = await mount(
      <Group
        defaultValue={['a']}
        itemProps={{ b: { open: true }, c: { defaultOpen: true } }}
      />
    );
    expect(openIds(c)).toEqual(['a']);
    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(
      messages.filter((m) => /Accordion\.Item.*open/i.test(m))
    ).toHaveLength(2);
  });

  it('is quiet when it sets neither', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await mount(<Group defaultValue={['a']} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('only observes with onOpenChange: once per changed Item, from one diff', async () => {
    const onValueChange = vi.fn();
    const a = vi.fn();
    const b = vi.fn();
    const c3 = vi.fn();
    const c = await mount(
      <Group
        defaultValue={['a']}
        onValueChange={onValueChange}
        itemProps={{
          a: { onOpenChange: a },
          b: { onOpenChange: b },
          c: { onOpenChange: c3 }
        }}
      />
    );
    await click(trigger(c, 'b'));
    await later();
    expect(onValueChange).toHaveBeenCalledOnce();
    expect(a.mock.calls).toEqual([[false]]);
    expect(b.mock.calls).toEqual([[true]]);
    expect(c3).not.toHaveBeenCalled();
  });

  it('does not open from an onOpenChange it ignores: the Root decides', async () => {
    const onOpenChange = vi.fn();
    const c = await mount(
      <Controlled
        decline
        onChange={() => {}}
        itemProps={{ a: { onOpenChange } }}
      />
    );
    await click(trigger(c, 'a'));
    await later();
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(openIds(c)).toEqual([]);
  });
});

describe('a group switch', () => {
  // A switch the browser makes opens the new Item first; one React makes
  // closes the old Item first (#363). Both fire two `toggle`s in one task.
  const orders = {
    'the browser: the new Item opens, and closes the old one': (
      c: HTMLElement
    ) => {
      item(c, 'b').open = true;
    },
    'React: the old Item closes, then the new one opens': (c: HTMLElement) => {
      item(c, 'a').open = false;
      item(c, 'b').open = true;
    },
    'the new Item opens, then the old one closes': (c: HTMLElement) => {
      item(c, 'b').open = true;
      item(c, 'a').open = false;
    }
  };

  for (const [label, switchTo] of Object.entries(orders)) {
    it(`is one onValueChange, uncontrolled: ${label}`, async () => {
      const onValueChange = vi.fn();
      const onOpenChange = vi.fn();
      const c = await mount(
        <Group
          defaultValue={['a']}
          onValueChange={onValueChange}
          itemProps={{ a: { onOpenChange }, b: { onOpenChange } }}
        />
      );
      await outsideAct(() => switchTo(c));
      expect(onValueChange.mock.calls).toEqual([[['b']]]);
      expect(onOpenChange).toHaveBeenCalledTimes(2);
      expect(openIds(c)).toEqual(['b']);
      expect(trigger(c, 'b').getAttribute('aria-expanded')).toBe('true');
    });

    it(`is one onValueChange, and a controlled parent accepts: ${label}`, async () => {
      const onChange = vi.fn();
      const c = await mount(<Controlled initial={['a']} onChange={onChange} />);
      await outsideAct(() => switchTo(c));
      expect(onChange.mock.calls).toEqual([[['b']]]);
      expect(openIds(c)).toEqual(['b']);
    });

    it(`reports a declined open once and writes it back: ${label}`, async () => {
      const onChange = vi.fn();
      const c = await mount(
        <Controlled decline initial={['a']} onChange={onChange} />
      );
      await outsideAct(() => switchTo(c));
      await later();
      expect(onChange.mock.calls).toEqual([[['b']]]);
      expect(openIds(c)).toEqual(['a']);
      expect(trigger(c, 'a').getAttribute('aria-expanded')).toBe('true');
    });
  }

  it('reconciles the DOM again when a declined open repeats, without a second report', async () => {
    const onChange = vi.fn();
    const c = await mount(
      <Controlled decline initial={['a']} onChange={onChange} />
    );
    await outsideAct(() => {
      item(c, 'b').open = true;
    });
    expect(openIds(c)).toEqual(['a']);
    await outsideAct(() => {
      item(c, 'b').open = true;
    });
    expect(openIds(c)).toEqual(['a']);
    expect(onChange.mock.calls).toEqual([[['b']]]);
  });

  it('reports a declined open from none open, once, and closes it', async () => {
    const onChange = vi.fn();
    const c = await mount(<Controlled decline onChange={onChange} />);
    await outsideAct(() => {
      item(c, 'b').open = true;
    });
    expect(onChange.mock.calls).toEqual([[['b']]]);
    expect(openIds(c)).toEqual([]);
  });

  it('is one onValueChange for a click too', async () => {
    const onValueChange = vi.fn();
    const c = await mount(
      <Group defaultValue={['a']} onValueChange={onValueChange} />
    );
    await click(trigger(c, 'b'));
    await later();
    expect(onValueChange.mock.calls).toEqual([[['b']]]);
  });
});

describe('opens nobody can prevent, in multiple mode', () => {
  it('reports each, and writes a declined one back', async () => {
    const onChange = vi.fn();
    const c = await mount(
      <Controlled multiple decline initial={['a']} onChange={onChange} />
    );
    await outsideAct(() => {
      item(c, 'b').open = true;
    });
    expect(onChange.mock.calls).toEqual([[['a', 'b']]]);
    expect(openIds(c)).toEqual(['a']);
  });

  it('reaches an uncontrolled Root', async () => {
    const onValueChange = vi.fn();
    const c = await mount(<Group multiple onValueChange={onValueChange} />);
    await outsideAct(() => {
      item(c, 'a').open = true;
      item(c, 'c').open = true;
    });
    expect(onValueChange.mock.calls).toEqual([[['a', 'c']]]);
    expect(trigger(c, 'c').getAttribute('aria-expanded')).toBe('true');
  });
});

describe('single mode given more than one value', () => {
  it('opens the first Item in document order and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onValueChange = vi.fn();
    const c = await mount(
      <Group value={['c', 'b']} onValueChange={onValueChange} />
    );
    await later();
    expect(openIds(c)).toEqual(['b']);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(
      warn.mock.calls.filter((call) =>
        /Accordion\.Root.*value/.test(String(call[0]))
      )
    ).toHaveLength(1);
  });

  it('never writes two open into the server HTML', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const html = renderToString(<Group value={['c', 'a', 'b']} />);
    expect(html.match(/<details[^>]* open=""/g)).toHaveLength(1);
    expect(html).toMatch(/<details[^>]*id="a"[^>]* open=""/);
  });

  it('does not warn for one value, or in multiple mode', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await mount(
      <>
        <Group value={['a']} />
        <Group multiple value={['a', 'b']} />
      </>
    );
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('before hydration', () => {
  it('adopts a click made on the server-rendered group', async () => {
    const onValueChange = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await serverRendered(
      <Group defaultValue={['a']} onValueChange={onValueChange} />,
      (container) => trigger(container, 'b').click()
    );
    await later();
    expect(onValueChange.mock.calls).toEqual([[['b']]]);
    expect(openIds(c)).toEqual(['b']);
    expect(trigger(c, 'b').getAttribute('aria-expanded')).toBe('true');
    expect(trigger(c, 'a').getAttribute('aria-expanded')).toBe('false');
    expect(error).not.toHaveBeenCalled();
  });

  it('adopts it once under StrictMode', async () => {
    const onValueChange = vi.fn();
    const c = await serverRendered(
      <StrictMode>
        <Group defaultValue={['a']} onValueChange={onValueChange} />
      </StrictMode>,
      (container) => trigger(container, 'b').click()
    );
    await later();
    expect(onValueChange.mock.calls).toEqual([[['b']]]);
    expect(openIds(c)).toEqual(['b']);
  });

  it('lets a controlled parent catch up with that click', async () => {
    const onChange = vi.fn();
    const c = await serverRendered(
      <Controlled initial={['a']} onChange={onChange} />,
      (container) => trigger(container, 'b').click()
    );
    await later();
    expect(onChange.mock.calls).toEqual([[['b']]]);
    expect(openIds(c)).toEqual(['b']);
  });

  it('closes it again when the controlled parent declines, once', async () => {
    const onChange = vi.fn();
    const c = await serverRendered(
      <Controlled decline initial={['a']} onChange={onChange} />,
      (container) => trigger(container, 'b').click()
    );
    await vi.waitFor(() => expect(openIds(c)).toEqual(['a']));
    await later();
    expect(onChange.mock.calls).toEqual([[['b']]]);
  });

  it('adopts an Item opened in multiple mode', async () => {
    const onValueChange = vi.fn();
    await serverRendered(
      <Group multiple defaultValue={['a']} onValueChange={onValueChange} />,
      (container) => trigger(container, 'c').click()
    );
    await later();
    expect(onValueChange.mock.calls).toEqual([[['a', 'c']]]);
  });

  it('does not call onValueChange when nothing differs', async () => {
    const onValueChange = vi.fn();
    await serverRendered(
      <Group defaultValue={['a']} onValueChange={onValueChange} />
    );
    await later();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('keeps two server-rendered Roots with distinct names apart after hydration', async () => {
    const onOne = vi.fn();
    const onTwo = vi.fn();
    const ui = (
      <>
        <Group name="one" ids={['a', 'b']} onValueChange={onOne} />
        <Group name="two" ids={['c', 'd']} onValueChange={onTwo} />
      </>
    );
    const c = await serverRendered(ui, (container) => {
      trigger(container, 'a').click();
      trigger(container, 'c').click();
    });
    await later();
    expect(openIds(c)).toEqual(['a', 'c']);
    expect(onOne.mock.calls).toEqual([[['a']]]);
    expect(onTwo.mock.calls).toEqual([[['c']]]);
  });
});

describe('always one open', () => {
  it('makes the open Item Trigger inert, still focusable', async () => {
    const onValueChange = vi.fn();
    const c = await mount(
      <Group alwaysOneOpen defaultValue={['a']} onValueChange={onValueChange} />
    );
    expect(trigger(c, 'a').getAttribute('aria-disabled')).toBe('true');
    expect(trigger(c, 'b').hasAttribute('aria-disabled')).toBe(false);
    expect(trigger(c, 'a').tabIndex).toBeGreaterThanOrEqual(0);
    await click(trigger(c, 'a'));
    await later();
    expect(openIds(c)).toEqual(['a']);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('closes the open Item only by opening another', async () => {
    const onValueChange = vi.fn();
    const c = await mount(
      <Group alwaysOneOpen defaultValue={['a']} onValueChange={onValueChange} />
    );
    await click(trigger(c, 'b'));
    await later();
    expect(onValueChange.mock.calls).toEqual([[['b']]]);
    expect(openIds(c)).toEqual(['b']);
    expect(trigger(c, 'a').hasAttribute('aria-disabled')).toBe(false);
    expect(trigger(c, 'b').getAttribute('aria-disabled')).toBe('true');
  });

  it('may start with none open, and does not open one', async () => {
    const onValueChange = vi.fn();
    const c = await mount(
      <Group alwaysOneOpen onValueChange={onValueChange} />
    );
    await later();
    expect(openIds(c)).toEqual([]);
    expect(onValueChange).not.toHaveBeenCalled();
    for (const id of ['a', 'b', 'c'])
      expect(trigger(c, id).hasAttribute('aria-disabled')).toBe(false);
  });

  it('restores value on mount when the DOM has no Item open', async () => {
    const onValueChange = vi.fn();
    const c = await serverRendered(
      <Group
        alwaysOneOpen
        defaultValue={['a']}
        onValueChange={onValueChange}
      />,
      (container) => trigger(container, 'a').click()
    );
    await later();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(openIds(c)).toEqual(['a']);
  });

  it('still adopts the DOM on mount when an Item is open', async () => {
    const onValueChange = vi.fn();
    const c = await serverRendered(
      <Group
        alwaysOneOpen
        defaultValue={['a']}
        onValueChange={onValueChange}
      />,
      (container) => trigger(container, 'b').click()
    );
    await later();
    expect(onValueChange.mock.calls).toEqual([[['b']]]);
    expect(openIds(c)).toEqual(['b']);
  });

  it('restores value once under StrictMode', async () => {
    const onValueChange = vi.fn();
    const c = await serverRendered(
      <StrictMode>
        <Group
          alwaysOneOpen
          defaultValue={['a']}
          onValueChange={onValueChange}
        />
      </StrictMode>,
      (container) => trigger(container, 'a').click()
    );
    await later();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(openIds(c)).toEqual(['a']);
  });

  it('writes back a close nobody can prevent, without reporting it', async () => {
    const onValueChange = vi.fn();
    const c = await mount(
      <Group alwaysOneOpen defaultValue={['a']} onValueChange={onValueChange} />
    );
    await outsideAct(() => {
      item(c, 'a').open = false;
    });
    expect(openIds(c)).toEqual(['a']);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('is ignored in multiple mode, with a dev warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = await mount(
      <Group multiple alwaysOneOpen defaultValue={['a']} />
    );
    expect(trigger(c, 'a').hasAttribute('aria-disabled')).toBe(false);
    await click(trigger(c, 'a'));
    await later();
    expect(openIds(c)).toEqual([]);
    expect(
      warn.mock.calls.filter((call) => /alwaysOneOpen/.test(String(call[0])))
    ).toHaveLength(1);
  });
});

describe('disabled', () => {
  it('applies to every Item, with aria-disabled, and still focusable', async () => {
    const onValueChange = vi.fn();
    const c = await mount(<Group disabled onValueChange={onValueChange} />);
    for (const id of ['a', 'b', 'c']) {
      expect(trigger(c, id).getAttribute('aria-disabled')).toBe('true');
      await click(trigger(c, id));
    }
    await later();
    expect(openIds(c)).toEqual([]);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(trigger(c, 'b').tabIndex).toBeGreaterThanOrEqual(0);
  });

  it('cannot be turned off by an Item', async () => {
    const onValueChange = vi.fn();
    const c = await mount(
      <Group
        disabled
        onValueChange={onValueChange}
        itemProps={{ b: { disabled: false } }}
      />
    );
    expect(trigger(c, 'b').getAttribute('aria-disabled')).toBe('true');
    await click(trigger(c, 'b'));
    await later();
    expect(openIds(c)).toEqual([]);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('leaves an Item disabled on its own, with the rest enabled', async () => {
    const c = await mount(<Group itemProps={{ b: { disabled: true } }} />);
    expect(trigger(c, 'b').getAttribute('aria-disabled')).toBe('true');
    expect(trigger(c, 'a').hasAttribute('aria-disabled')).toBe(false);
    await click(trigger(c, 'b'));
    await later();
    expect(openIds(c)).toEqual([]);
  });

  it('still adopts an open nobody caused, as find-in-page makes', async () => {
    const onValueChange = vi.fn();
    const onOpenChange = vi.fn();
    const c = await mount(
      <Group
        disabled
        onValueChange={onValueChange}
        itemProps={{ b: { onOpenChange } }}
      />
    );
    await outsideAct(() => {
      item(c, 'b').open = true;
    });
    expect(onValueChange.mock.calls).toEqual([[['b']]]);
    expect(onOpenChange.mock.calls).toEqual([[true]]);
    expect(openIds(c)).toEqual(['b']);
  });

  it('opens natively before hydration, and hydration adopts it', async () => {
    const onValueChange = vi.fn();
    const c = await serverRendered(
      <Group disabled onValueChange={onValueChange} />,
      (container) => trigger(container, 'b').click()
    );
    await later();
    expect(onValueChange.mock.calls).toEqual([[['b']]]);
    expect(openIds(c)).toEqual(['b']);
  });
});

describe('a value no Item is mounted for', () => {
  const ids = ['a', 'b'];

  it('is kept by a click, uncontrolled', async () => {
    const onValueChange = vi.fn();
    const c = await mount(
      <Group
        multiple
        ids={ids}
        defaultValue={['a', 'z']}
        onValueChange={onValueChange}
      />
    );
    await click(trigger(c, 'b'));
    await later();
    expect(onValueChange.mock.calls).toEqual([[['a', 'z', 'b']]]);
    await click(trigger(c, 'a'));
    await later();
    expect(onValueChange.mock.calls[1]).toEqual([['z', 'b']]);
  });

  it('is kept by a click, controlled', async () => {
    const onChange = vi.fn();
    const c = await mount(
      <Controlled multiple ids={ids} initial={['a', 'z']} onChange={onChange} />
    );
    await click(trigger(c, 'b'));
    await later();
    await click(trigger(c, 'a'));
    await later();
    expect(onChange.mock.calls).toEqual([[['a', 'z', 'b']], [['z', 'b']]]);
  });

  it('is kept by an open and a close nobody caused, uncontrolled', async () => {
    const onValueChange = vi.fn();
    const c = await mount(
      <Group
        multiple
        ids={ids}
        defaultValue={['a', 'z']}
        onValueChange={onValueChange}
      />
    );
    await outsideAct(() => {
      item(c, 'b').open = true;
    });
    await outsideAct(() => {
      item(c, 'a').open = false;
    });
    expect(onValueChange.mock.calls).toEqual([[['a', 'z', 'b']], [['z', 'b']]]);
  });

  it('is kept by an open and a close nobody caused, controlled', async () => {
    const onChange = vi.fn();
    const c = await mount(
      <Controlled multiple ids={ids} initial={['a', 'z']} onChange={onChange} />
    );
    await outsideAct(() => {
      item(c, 'b').open = true;
    });
    await outsideAct(() => {
      item(c, 'a').open = false;
    });
    expect(onChange.mock.calls).toEqual([[['a', 'z', 'b']], [['z', 'b']]]);
  });
});

describe('single mode with Items that move', () => {
  it('opens the first in document order after a reorder that does not render the Root', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onValueChange = vi.fn();
    let reorder!: (ids: string[]) => void;
    function Reorder() {
      const [ids, setIds] = useState(['a', 'b', 'c']);
      useEffect(() => {
        reorder = setIds;
      }, []);
      return <Items ids={ids} />;
    }
    const c = await mount(
      <Accordion.Root value={['c', 'b']} onValueChange={onValueChange}>
        <Reorder />
      </Accordion.Root>
    );
    expect(openIds(c)).toEqual(['b']);
    await act(async () => reorder(['c', 'b', 'a']));
    await later();
    expect(openIds(c)).toEqual(['c']);
    expect(trigger(c, 'c').getAttribute('aria-expanded')).toBe('true');
    expect(trigger(c, 'b').getAttribute('aria-expanded')).toBe('false');
    expect(onValueChange).not.toHaveBeenCalled();
    await click(trigger(c, 'a'));
    await later();
    expect(onValueChange.mock.calls).toEqual([[['a']]]);
  });
});

describe('the record of what was reported', () => {
  it('is cleared when the parent moves the value, in a Root', async () => {
    const onChange = vi.fn();
    let setValue!: (value: string[]) => void;
    function Declining() {
      const [value, set] = useState(['a']);
      useEffect(() => {
        setValue = set;
      }, []);
      return <Group value={value} onValueChange={onChange} />;
    }
    const c = await mount(<Declining />);
    await outsideAct(() => {
      item(c, 'b').open = true;
    });
    expect(onChange.mock.calls).toEqual([[['b']]]);
    await act(async () => setValue(['c']));
    await act(async () => setValue(['a']));
    await later();
    await outsideAct(() => {
      item(c, 'b').open = true;
    });
    expect(onChange.mock.calls).toEqual([[['b']], [['b']]]);
    expect(openIds(c)).toEqual(['a']);
  });

  it('is cleared when the parent moves open, in a standalone Item', async () => {
    const onOpenChange = vi.fn();
    let setOpen!: (open: boolean) => void;
    function Declining() {
      const [open, set] = useState(false);
      useEffect(() => {
        setOpen = set;
      }, []);
      return (
        <Accordion.Item id="x" open={open} onOpenChange={onOpenChange}>
          <Accordion.Trigger>x</Accordion.Trigger>
          <Accordion.Panel>p</Accordion.Panel>
        </Accordion.Item>
      );
    }
    const c = await mount(<Declining />);
    await outsideAct(() => {
      item(c, 'x').open = true;
    });
    expect(onOpenChange.mock.calls).toEqual([[true]]);
    await act(async () => setOpen(true));
    await act(async () => setOpen(false));
    await later();
    await outsideAct(() => {
      item(c, 'x').open = true;
    });
    expect(onOpenChange.mock.calls).toEqual([[true], [true]]);
    expect(item(c, 'x').open).toBe(false);
  });
});

describe('a toggle of a nested Item', () => {
  const part = (id: string, ...inside: ReactNode[]) => ({
    id,
    children: (
      <>
        <Accordion.Trigger>{id}</Accordion.Trigger>
        <Accordion.Panel>{inside}</Accordion.Panel>
      </>
    )
  });

  it("is not the outer Root's to adopt", async () => {
    const log: string[] = [];
    const seen = (id: string) => (event: { target: EventTarget }) =>
      log.push(`${id} sees ${(event.target as Element).id}`);
    const inner = part('inner-1');
    const x = part(
      'x',
      <Accordion.Root>
        <Accordion.Item value="1" {...inner} onToggle={seen('inner-1')} />
      </Accordion.Root>
    );
    const y = part('y');
    const c = await mount(
      <Accordion.Root multiple onValueChange={() => log.push('change')}>
        <Accordion.Item value="x" {...x} defaultOpen onToggle={seen('x')} />
        <Accordion.Item value="y" {...y} onToggle={seen('y')} />
      </Accordion.Root>
    );
    await later();
    log.length = 0;
    await outsideAct(() => {
      item(c, 'inner-1').open = true;
      item(c, 'y').open = true;
    });
    // React 18 in WebKit calls the onToggle handlers a second time; the report must still come once.
    expect(log.slice(0, 4)).toEqual([
      'inner-1 sees inner-1',
      'x sees inner-1',
      'y sees y',
      'change'
    ]);
    expect(log.filter((e) => e === 'change')).toEqual(['change']);
  });

  it("is not the outer standalone Item's to adopt", async () => {
    const log: string[] = [];
    const seen = (id: string) => (event: { target: EventTarget }) =>
      log.push(`${id} sees ${(event.target as Element).id}`);
    const c = await mount(
      <Accordion.Item
        id="outer"
        onOpenChange={() => log.push('outer opens')}
        onToggle={seen('outer')}
      >
        <Accordion.Trigger>outer</Accordion.Trigger>
        <Accordion.Panel>
          <Accordion.Item id="inner" onToggle={seen('inner')}>
            <Accordion.Trigger>inner</Accordion.Trigger>
            <Accordion.Panel>p</Accordion.Panel>
          </Accordion.Item>
        </Accordion.Panel>
      </Accordion.Item>
    );
    await later();
    log.length = 0;
    await outsideAct(() => {
      item(c, 'inner').open = true;
      item(c, 'outer').open = true;
    });
    expect(log.slice(0, 4)).toEqual([
      'inner sees inner',
      'outer sees inner',
      'outer sees outer',
      'outer opens'
    ]);
    // React 18 in WebKit calls the onToggle handlers a second time; the report must still come once.
    expect(log.filter((e) => e === 'outer opens')).toEqual(['outer opens']);
  });
});

describe('an Item inside a Root without a value', () => {
  it('warns, renders, and takes no part in the value', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onValueChange = vi.fn();
    const c = await mount(
      <Accordion.Root defaultValue={['a']} onValueChange={onValueChange}>
        <Accordion.Item id="a" value="a">
          <Accordion.Trigger>a</Accordion.Trigger>
          <Accordion.Panel>p</Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item id="n">
          <Accordion.Trigger>n</Accordion.Trigger>
          <Accordion.Panel>p</Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
    );
    expect(item(c, 'n')).not.toBeNull();
    expect(
      warn.mock.calls.filter((call) =>
        /Accordion\.Item.*`value`/.test(String(call[0]))
      )
    ).toHaveLength(1);
    await click(trigger(c, 'n'));
    await later();
    expect(openIds(c)).toEqual(['a']);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe('an Item that unmounts', () => {
  it('hands the one open place to the next Item in value', async () => {
    const onValueChange = vi.fn();
    const hide: { current: (show: boolean) => void } = { current: () => {} };
    function Maybe() {
      const [show, setShow] = useState(true);
      useEffect(() => {
        hide.current = setShow;
      }, []);
      return show ? (
        <Accordion.Item id="a" value="a">
          <Accordion.Trigger>a</Accordion.Trigger>
          <Accordion.Panel>p</Accordion.Panel>
        </Accordion.Item>
      ) : null;
    }
    const Stable = memo(function Stable({ id }: { id: string }) {
      return (
        <Accordion.Item id={id} value={id}>
          <Accordion.Trigger>{id}</Accordion.Trigger>
          <Accordion.Panel>p</Accordion.Panel>
        </Accordion.Item>
      );
    });
    const c = await mount(
      <Accordion.Root
        alwaysOneOpen
        value={['a', 'b']}
        onValueChange={onValueChange}
      >
        <Maybe />
        <Stable id="b" />
        <Stable id="c" />
      </Accordion.Root>
    );
    expect(openIds(c)).toEqual(['a']);
    await act(async () => hide.current(false));
    await later();
    expect(openIds(c)).toEqual(['b']);
    expect(trigger(c, 'b').getAttribute('aria-expanded')).toBe('true');
    await outsideAct(() => {
      item(c, 'c').open = true;
    });
    expect(onValueChange.mock.calls).toEqual([[['c']]]);
  });
});

describe('an Item inside a single Root without a value', () => {
  it('takes no name, so find-in-page opening it leaves the open Item alone', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onValueChange = vi.fn();
    const c = await mount(
      <Accordion.Root defaultValue={['a']} onValueChange={onValueChange}>
        <Accordion.Item id="a" value="a">
          <Accordion.Trigger>a</Accordion.Trigger>
          <Accordion.Panel>p</Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item id="n">
          <Accordion.Trigger>n</Accordion.Trigger>
          <Accordion.Panel>p</Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
    );
    expect(item(c, 'n').getAttribute('name')).toBeNull();
    await outsideAct(() => {
      item(c, 'n').open = true;
    });
    expect(item(c, 'a').open).toBe(true);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
