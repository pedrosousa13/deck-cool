"use client";

import { useState } from "react";

/** The fixture's demo: an island, so its page ships JavaScript. */
export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" className="counter" onClick={() => setCount(count + 1)}>
      Pressed {count} times
    </button>
  );
}
