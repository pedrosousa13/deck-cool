// The steps of .github/workflows/bump-deck.yml. The payload arrives in DECK and VERSION.
//
//   node packages/bump-deck/src/cli.ts check        checks the payload; writes deck, version, branch
//   node packages/bump-deck/src/cli.ts bump <body>  bumps the workspace; writes changed, and the PR body to <body>
import { appendFileSync, writeFileSync } from "node:fs";
import { branchOf, bumpWorkspace, parseRelease, prBody } from "./bump.ts";

/** A step output, for `steps.<id>.outputs.<name>`. Every value is checked before it gets here. */
function output(name: string, value: string): void {
  const file = process.env["GITHUB_OUTPUT"];
  if (file !== undefined) appendFileSync(file, `${name}=${value}\n`);
  console.log(`${name}=${value}`);
}

async function main(): Promise<void> {
  const [command, body] = process.argv.slice(2);
  const release = parseRelease(process.env["DECK"], process.env["VERSION"]);
  if (command === "check") {
    output("deck", release.deck);
    output("version", release.version);
    output("branch", branchOf(release));
    return;
  }
  if (command === "bump" && body !== undefined) {
    const { changes, bypassed } = await bumpWorkspace(process.cwd(), release);
    if (changes.length === 0) {
      console.log(`No workspace package depends on @${release.deck}/* at a version other than ${release.version}. Nothing to bump.`);
      output("changed", "false");
      return;
    }
    for (const { file, name, from, to } of changes) console.log(`${file}: ${name} ${from} -> ${to}`);
    writeFileSync(body, prBody(release, changes, bypassed));
    output("changed", "true");
    return;
  }
  throw new Error("Usage: cli.ts check | cli.ts bump <body-file>");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // An annotation is one line; the whole message follows in the log.
  console.log(`::error title=Not bumped::${message.split("\n")[0] ?? ""}`);
  console.error(message);
  process.exitCode = 1;
});
