import { act, useState, type ReactNode } from 'react';
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
  history.replaceState(null, '', location.pathname + location.search);
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
const details = (c: HTMLElement) => c.querySelector('details')!;
const summary = (c: HTMLElement) => c.querySelector('summary')!;
const click = (el: HTMLElement) => act(() => el.click());

function Basic(props: Accordion.ItemProps & { level?: Accordion.Level }) {
  const { level, ...item } = props;
  return (
    <Accordion.Item {...item}>
      <Accordion.Trigger level={level}>More</Accordion.Trigger>
      <Accordion.Panel>
        <p id="body">Hidden words</p>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

/** A parent that owns `open`, and declines every change when `decline`. */
function Parent({
  decline = false,
  initial = false,
  onChange
}: {
  decline?: boolean;
  initial?: boolean;
  onChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(initial);
  return (
    <Basic
      open={open}
      onOpenChange={(next) => {
        onChange(next);
        if (!decline) setOpen(next);
      }}
    />
  );
}

describe('structure', () => {
  it('renders a details with a summary and a div panel', async () => {
    const c = await mount(<Basic />);
    expect(details(c).tagName).toBe('DETAILS');
    expect(summary(c).parentElement).toBe(details(c));
    expect(summary(c).textContent).toBe('More');
    expect(details(c).querySelector('div')!.textContent).toBe('Hidden words');
  });

  it('keeps the panel content in the DOM while closed', async () => {
    const c = await mount(<Basic />);
    expect(details(c).open).toBe(false);
    expect(c.querySelector('#body')!.textContent).toBe('Hidden words');
  });

  it('gives Item a value attribute for the Root to read', async () => {
    const c = await mount(<Basic value="a" />);
    expect(details(c).getAttribute('data-value')).toBe('a');
  });
});

describe('render', () => {
  it('takes an element, merging its props and composing refs', async () => {
    const own = { current: null as HTMLElement | null };
    const mine = { current: null as HTMLDetailsElement | null };
    const c = await mount(
      <Accordion.Item ref={mine}>
        <Accordion.Trigger render={<summary className="x" ref={own} />}>
          More
        </Accordion.Trigger>
        <Accordion.Panel render={<section data-kind="p" />}>p</Accordion.Panel>
      </Accordion.Item>
    );
    expect(summary(c).className).toBe('x');
    expect(own.current).toBe(summary(c));
    expect(mine.current).toBe(details(c));
    expect(c.querySelector('section[data-kind="p"]')).not.toBeNull();
  });

  it('takes a function given the part props', async () => {
    const c = await mount(
      <Accordion.Item>
        <Accordion.Trigger
          render={(props) => <summary {...props} data-custom="" />}
        >
          More
        </Accordion.Trigger>
        <Accordion.Panel />
      </Accordion.Item>
    );
    expect(summary(c).hasAttribute('data-custom')).toBe(true);
    expect(summary(c).getAttribute('aria-expanded')).toBe('false');
  });
});

describe('dev warnings', () => {
  it('names an Item that does not render a details', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await mount(
      <Accordion.Item render={<div />}>
        <Accordion.Panel />
      </Accordion.Item>
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Accordion\.Item.*<details>/)
    );
  });

  it('names a Trigger that does not render a summary', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await mount(
      <Accordion.Item>
        <Accordion.Trigger render={<button />}>More</Accordion.Trigger>
      </Accordion.Item>
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Accordion\.Trigger.*<summary>/)
    );
  });

  it('names a Trigger that is not the Item direct child', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await mount(
      <Accordion.Item>
        <div>
          <Accordion.Trigger>More</Accordion.Trigger>
        </div>
      </Accordion.Item>
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Accordion\.Trigger.*direct child/)
    );
  });

  it('is quiet for the right shape', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await mount(<Basic />);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('uncontrolled', () => {
  it('opens and closes on click and reports each change', async () => {
    const onOpenChange = vi.fn();
    const c = await mount(<Basic onOpenChange={onOpenChange} />);
    await click(summary(c));
    expect(details(c).open).toBe(true);
    expect(onOpenChange.mock.calls).toEqual([[true]]);
    await click(summary(c));
    expect(details(c).open).toBe(false);
    await later();
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it('starts open with defaultOpen', async () => {
    const c = await mount(<Basic defaultOpen />);
    expect(details(c).open).toBe(true);
    expect(summary(c).getAttribute('aria-expanded')).toBe('true');
  });
});

describe('controlled', () => {
  it('follows the open prop', async () => {
    const c = await mount(<Basic open />);
    expect(details(c).open).toBe(true);
  });

  it('asks the parent, which accepts', async () => {
    const onChange = vi.fn();
    const c = await mount(<Parent onChange={onChange} />);
    await click(summary(c));
    expect(onChange.mock.calls).toEqual([[true]]);
    expect(details(c).open).toBe(true);
    expect(summary(c).getAttribute('aria-expanded')).toBe('true');
  });

  it('writes open back when the parent declines a click', async () => {
    const onChange = vi.fn();
    const c = await mount(<Parent decline onChange={onChange} />);
    await click(summary(c));
    await later();
    expect(onChange.mock.calls).toEqual([[true]]);
    expect(details(c).open).toBe(false);
    expect(summary(c).getAttribute('aria-expanded')).toBe('false');
  });

  it('writes open back when the parent declines a close', async () => {
    const onChange = vi.fn();
    const c = await mount(<Parent decline initial onChange={onChange} />);
    await click(summary(c));
    await later();
    expect(onChange.mock.calls).toEqual([[false]]);
    expect(details(c).open).toBe(true);
  });
});

describe('the click', () => {
  it('leaves a link inside the Trigger alone', async () => {
    const onOpenChange = vi.fn();
    const c = await mount(
      <Accordion.Item onOpenChange={onOpenChange}>
        <Accordion.Trigger>
          <a id="link" href="#elsewhere">
            link
          </a>
        </Accordion.Trigger>
      </Accordion.Item>
    );
    await click(c.querySelector('a')!);
    await later();
    expect(details(c).open).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(location.hash).toBe('#elsewhere');
  });

  it('leaves a button inside the Trigger alone', async () => {
    const onOpenChange = vi.fn();
    const onButton = vi.fn();
    const c = await mount(
      <Accordion.Item onOpenChange={onOpenChange}>
        <Accordion.Trigger>
          <button type="button" onClick={onButton}>
            go
          </button>
        </Accordion.Trigger>
      </Accordion.Item>
    );
    await click(c.querySelector('button')!);
    await later();
    expect(onButton).toHaveBeenCalledOnce();
    expect(details(c).open).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('does nothing when a child already prevented the event', async () => {
    const onOpenChange = vi.fn();
    const c = await mount(
      <Accordion.Item onOpenChange={onOpenChange}>
        <Accordion.Trigger>
          <span id="stop" onClick={(event) => event.preventDefault()}>
            stop
          </span>
        </Accordion.Trigger>
      </Accordion.Item>
    );
    await click(c.querySelector('#stop')!);
    await later();
    expect(details(c).open).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('does nothing when the Trigger own onClick prevents it', async () => {
    const onOpenChange = vi.fn();
    const c = await mount(
      <Accordion.Item onOpenChange={onOpenChange}>
        <Accordion.Trigger onClick={(event) => event.preventDefault()}>
          More
        </Accordion.Trigger>
      </Accordion.Item>
    );
    await click(summary(c));
    await later();
    expect(details(c).open).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('opens nobody can prevent', () => {
  // Find-in-page cannot be triggered by script. Setting `details.open`
  // directly is the stand-in: the browser fires `toggle` for it the same
  // way, and React did not cause it.
  it('reach onOpenChange and the uncontrolled state', async () => {
    const onOpenChange = vi.fn();
    const c = await mount(<Basic onOpenChange={onOpenChange} />);
    await outsideAct(() => {
      details(c).open = true;
    });
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true));
    expect(onOpenChange).toHaveBeenCalledOnce();
    expect(summary(c).getAttribute('aria-expanded')).toBe('true');
  });

  it('reach a controlled parent, which accepts', async () => {
    const onChange = vi.fn();
    const c = await mount(<Parent onChange={onChange} />);
    await outsideAct(() => {
      details(c).open = true;
    });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(true));
    expect(onChange).toHaveBeenCalledOnce();
    expect(details(c).open).toBe(true);
    expect(summary(c).getAttribute('aria-expanded')).toBe('true');
  });

  it('are written back when a controlled parent declines, once', async () => {
    const onChange = vi.fn();
    const c = await mount(<Parent decline onChange={onChange} />);
    await outsideAct(() => {
      details(c).open = true;
    });
    await vi.waitFor(() => expect(details(c).open).toBe(false));
    await later();
    expect(onChange.mock.calls).toEqual([[true]]);
    expect(summary(c).getAttribute('aria-expanded')).toBe('false');
  });

  it('include a fragment link into a closed Panel', async () => {
    const onOpenChange = vi.fn();
    const c = await mount(
      <>
        <a id="jump" href="#body">
          jump
        </a>
        <Basic onOpenChange={onOpenChange} />
      </>
    );
    expect(details(c).open).toBe(false);
    await outsideAct(() =>
      c.querySelector<HTMLAnchorElement>('#jump')!.click()
    );
    await vi.waitFor(() => expect(details(c).open).toBe(true));
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true));
    expect(summary(c).getAttribute('aria-expanded')).toBe('true');
  });
});

describe('before hydration', () => {
  it('adopts a click made on the server-rendered Item', async () => {
    const onOpenChange = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await serverRendered(
      <Basic onOpenChange={onOpenChange} />,
      (container) => summary(container).click()
    );
    expect(onOpenChange.mock.calls).toEqual([[true]]);
    expect(details(c).open).toBe(true);
    expect(summary(c).getAttribute('aria-expanded')).toBe('true');
    await later();
    expect(onOpenChange).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
  });

  it('lets a controlled parent catch up with that click', async () => {
    const onChange = vi.fn();
    const c = await serverRendered(
      <Parent onChange={onChange} />,
      (container) => summary(container).click()
    );
    expect(onChange.mock.calls).toEqual([[true]]);
    expect(details(c).open).toBe(true);
    expect(summary(c).getAttribute('aria-expanded')).toBe('true');
    await later();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('closes it again when the controlled parent declines', async () => {
    const onChange = vi.fn();
    const c = await serverRendered(
      <Parent decline onChange={onChange} />,
      (container) => summary(container).click()
    );
    await vi.waitFor(() => expect(details(c).open).toBe(false));
    await later();
    expect(onChange.mock.calls).toEqual([[true]]);
  });

  it('does not call onOpenChange when nothing differs', async () => {
    const onOpenChange = vi.fn();
    await serverRendered(<Basic defaultOpen onOpenChange={onOpenChange} />);
    await later();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('disabled', () => {
  it('makes the Trigger inert, with aria-disabled, and still focusable', async () => {
    const onOpenChange = vi.fn();
    const c = await mount(<Basic disabled onOpenChange={onOpenChange} />);
    expect(summary(c).getAttribute('aria-disabled')).toBe('true');
    await click(summary(c));
    await later();
    expect(details(c).open).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
    summary(c).focus();
    expect(document.activeElement).toBe(summary(c));
  });

  it('has no aria-disabled when enabled', async () => {
    const c = await mount(<Basic />);
    expect(summary(c).hasAttribute('aria-disabled')).toBe(false);
  });

  it('can still be opened by find-in-page', async () => {
    // The stand-in for find-in-page: see "opens nobody can prevent".
    const onOpenChange = vi.fn();
    const c = await mount(<Basic disabled onOpenChange={onOpenChange} />);
    await outsideAct(() => {
      details(c).open = true;
    });
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true));
    expect(details(c).open).toBe(true);
    expect(summary(c).getAttribute('aria-expanded')).toBe('true');
  });

  it('opens natively before hydration, and hydration adopts it', async () => {
    const onOpenChange = vi.fn();
    const c = await serverRendered(
      <Basic disabled onOpenChange={onOpenChange} />,
      (container) => {
        expect(summary(container).getAttribute('aria-disabled')).toBe('true');
        summary(container).click();
        expect(details(container).open).toBe(true);
      }
    );
    expect(onOpenChange.mock.calls).toEqual([[true]]);
    expect(details(c).open).toBe(true);
  });
});

describe('aria-expanded', () => {
  it('is server-rendered from the starting state', () => {
    expect(renderToString(<Basic />)).toContain('aria-expanded="false"');
    expect(renderToString(<Basic defaultOpen />)).toContain(
      'aria-expanded="true"'
    );
    expect(renderToString(<Basic open />)).toContain('aria-expanded="true"');
  });

  it('stays in step with each click', async () => {
    const c = await mount(<Basic />);
    expect(summary(c).getAttribute('aria-expanded')).toBe('false');
    await click(summary(c));
    expect(summary(c).getAttribute('aria-expanded')).toBe('true');
    await click(summary(c));
    expect(summary(c).getAttribute('aria-expanded')).toBe('false');
  });
});

describe('level', () => {
  it('renders the text in that heading inside the summary', async () => {
    const c = await mount(<Basic level={3} />);
    const heading = summary(c).querySelector('h3')!;
    expect(heading.textContent).toBe('More');
    expect(summary(c).children).toHaveLength(1);
  });

  it('renders no heading without it', async () => {
    const c = await mount(<Basic />);
    expect(summary(c).querySelector('h1,h2,h3,h4,h5,h6')).toBeNull();
  });

  it('takes 1 to 6', () => {
    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      expect(renderToString(<Basic level={level} />)).toContain(
        `<h${level}>More</h${level}>`
      );
    }
  });
});

describe('hydration', () => {
  it('sets suppressHydrationWarning so a pre-hydration toggle is not a mismatch', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await serverRendered(<Basic />, (container) => {
      details(container).open = true;
    });
    expect(error).not.toHaveBeenCalled();
  });
});
