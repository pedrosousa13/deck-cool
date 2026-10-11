import type { ReactNode } from "react";

/**
 * The frame every docs demo sits in. Search skips it: a demo's slides say
 * "One", "Two", and the page's prose says what it shows.
 */
export default function DemoFrame({ children }: { children: ReactNode }) {
  return (
    <div className="docs-demo" data-fw-search="ignore">
      {children}
    </div>
  );
}
