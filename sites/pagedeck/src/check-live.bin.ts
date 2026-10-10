// Kept out of `pnpm test`, which stays offline; docs/deploy.md says when to run it.
import { reportLiveCheck } from "@deck-cool/site-kit/live-check";
import { LIVE_SITE } from "./live-check.ts";

await reportLiveCheck(LIVE_SITE, process.argv[2] ?? "https://page.deck.cool");
