import type { ReactNode } from "react";

/**
 * The frame every docs demo sits in. Search skips it: a demo's own words say
 * what it shows.
 */
export default function DemoFrame({ children }: { children: ReactNode }) {
  return (
    <div className="docs-demo" data-fw-search="ignore">
      {children}
    </div>
  );
}
