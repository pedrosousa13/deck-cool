import { availableParallelism, loadavg } from "node:os";

/** A warning when the 1-minute load average is above the core count, else undefined. */
export function loadWarning(load: number, cores: number): string | undefined {
  if (load <= cores) return undefined;
  return `Load average ${load.toFixed(2)} is above the machine's ${String(cores)} cores: browser tests may time out.`;
}

/** Warns once per test run, from the root vitest.config.ts. */
export default function setup(): void {
  const warning = loadWarning(loadavg()[0] ?? 0, availableParallelism());
  if (warning !== undefined) console.warn(warning);
}
