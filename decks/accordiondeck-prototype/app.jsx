// The prototype's accordion logic, minimal. This is what the checks test.
import React, { useLayoutEffect, useRef, useState } from 'react';

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ctl: { calls: [], decline: bool, naive: bool, buttonClicks: number }
function Root({ ids, name, value, onValueChange, naive, probe, children }) {
  const rootRef = useRef(null);
  // The last diff reported and the value it was reported against. While the parent has
  // not answered (value unchanged), the same diff is not reported again, including the
  // toggles the write-back itself causes.
  const reported = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const domOpen = () =>
    [...rootRef.current.querySelectorAll('details')].filter((d) => d.open).map((d) => d.id);

  // Write `open` back wherever the DOM disagrees with state. Closed first, so the
  // named group never holds two open items.
  const writeBack = () => {
    const ds = [...rootRef.current.querySelectorAll('details')];
    for (const d of ds) if (!valueRef.current.includes(d.id) && d.open) d.open = false;
    for (const d of ds) if (valueRef.current.includes(d.id) && !d.open) d.open = true;
  };
  // After React's own render (when the parent accepts), so a decline is the only thing left.
  const settle = () => setTimeout(writeBack, 0);

  // Hydration adopts the DOM: report what is open on mount (single mode: the first).
  useLayoutEffect(() => {
    if (naive) return;
    const opens = domOpen().slice(0, 1);
    if (!same(opens, valueRef.current)) onValueChange(opens);
  }, []);

  const onClick = (e) => {
    if (naive || e.defaultPrevented) return;
    const nearest = e.target.closest('a[href],button,input,select,textarea,label,summary');
    if (nearest !== e.currentTarget) return;
    e.preventDefault();
    reported.current = null;
    const id = e.currentTarget.parentElement.id;
    onValueChange(valueRef.current.includes(id) ? [] : [id]);
    settle();
  };

  // toggle carries the opens nobody can prevent. Read the whole group at the first one.
  const onToggle = (e) => {
    if (naive) return;
    const opens = domOpen().slice(0, 1);
    probe?.push({ id: e.currentTarget.id, opens });
    if (same(opens, valueRef.current)) return;
    const r = reported.current;
    if (r && same(opens, r.opens) && same(valueRef.current, r.value)) return;
    reported.current = { opens, value: valueRef.current };
    onValueChange(opens);
    settle();
  };

  return (
    <div ref={rootRef}>
      {ids.map((id) =>
        children(id, {
          name,
          open: value.includes(id),
          onToggle,
          triggerProps: { onClick },
        }),
      )}
    </div>
  );
}

export function App({ variant, ctl, initial }) {
  const [value, setValue] = useState(initial);
  ctl.getValue = () => value;
  ctl.setValue = setValue;
  const onValueChange = (next) => {
    ctl.calls.push(next);
    if (!ctl.decline) setValue(next);
  };
  if (variant === 'summary') {
    return (
      <Root ids={['x']} name="solo" value={value} onValueChange={onValueChange} naive={ctl.naive} probe={ctl.probe}>
        {(id, p) => (
          <details key={id} id={id} name={p.name} open={p.open} onToggle={p.onToggle} suppressHydrationWarning>
            <summary id="sx" {...p.triggerProps}>
              <span id="label">Title</span>{' '}
              <a id="lnk" href="#elsewhere">link</a>{' '}
              <button id="btn" type="button" onClick={() => { ctl.buttonClicks = (ctl.buttonClicks ?? 0) + 1; }}>btn</button>{' '}
              <span id="stop" onClick={(e) => e.preventDefault()}>stop</span>
            </summary>
            <div id="linked">Panel.</div>
          </details>
        )}
      </Root>
    );
  }
  return (
    <Root ids={['a', 'b', 'c']} name="g" value={value} onValueChange={onValueChange} naive={ctl.naive} probe={ctl.probe}>
      {(id, p) => (
        <details key={id} id={id} name={p.name} open={p.open} onToggle={p.onToggle} suppressHydrationWarning>
          <summary id={'s' + id} {...p.triggerProps}>{id}</summary>
          <div>panel {id} <span id={'deep-' + id}>word {id}</span></div>
        </details>
      )}
    </Root>
  );
}
