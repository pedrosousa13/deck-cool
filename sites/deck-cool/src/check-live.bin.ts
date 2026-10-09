// Kept out of `pnpm test`, which stays offline; docs/deploy.md says when to run it.
import { checkSite } from "./live-check.ts";

const origin = process.argv[2] ?? "https://deck.cool";
const failures = await checkSite(origin);
for (const failure of failures) console.error(failure);
console.log(failures.length === 0 ? `${origin}: every check passed` : `${origin}: ${failures.length} failed`);
process.exitCode = failures.length === 0 ? 0 : 1;
