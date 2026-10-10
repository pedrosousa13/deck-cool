// The steps of .github/workflows/bump-deck.yml. A dispatch's payload, or one release the
// daily run found, arrives in DECK and VERSION.
//
//   node packages/bump-deck/src/cli.ts check        checks the release; writes deck, version, branch and releases
//   node packages/bump-deck/src/cli.ts find         reads npm for each deck; writes releases, the ones past the hold
//   node packages/bump-deck/src/cli.ts bump <body>  bumps the workspace; writes changed, and the PR body to <body>
import { execFile } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { branchOf, bumpWorkspace, findReleases, parseRelease, prBody, workspacePaths } from "./bump.ts";
import type { Release } from "./bump.ts";

/** A step output, for `steps.<id>.outputs.<name>`. Every value is checked before it gets here. */
function output(name: string, value: string): void {
  const file = process.env["GITHUB_OUTPUT"];
  if (file !== undefined) appendFileSync(file, `${name}=${value}\n`);
  console.log(`${name}=${value}`);
}

/** The releases to bump, as the JSON a matrix reads. */
function releases(list: readonly Release[]): string {
  return JSON.stringify(list.map(({ deck, version }) => ({ deck, version })));
}

/** pnpm's setting, as the workspace sets it. */
async function pnpmConfig(name: string): Promise<string> {
  return (await promisify(execFile)("pnpm", ["config", "get", name])).stdout.trim();
}

// pnpm 11 holds a version back for a day when minimumReleaseAge is not set.
const DEFAULT_HOLD_MINUTES = 1440;

async function main(): Promise<void> {
  const [command, body] = process.argv.slice(2);
  if (command === "find") {
    const root = process.cwd();
    const manifests = (await workspacePaths(root)).map((path) => readFileSync(join(path, "package.json"), "utf8"));
    const hold = await pnpmConfig("minimumReleaseAge");
    const holdMinutes = hold === "undefined" || hold === "" ? DEFAULT_HOLD_MINUTES : Number(hold);
    if (!Number.isInteger(holdMinutes) || holdMinutes < 0) throw new Error(`pnpm's minimumReleaseAge is ${JSON.stringify(hold)}, not a number of minutes`);
    const registry = (await pnpmConfig("registry")).replace(/\/?$/, "/");
    const findings = await findReleases(manifests, { registry, holdMinutes, now: new Date(), fetch });
    const bumps: Release[] = [];
    for (const finding of findings) {
      if (finding.kind === "unused") console.log(`${finding.deck}: no workspace package depends on it.`);
      if (finding.kind === "current") console.log(`${finding.deck}: npm's latest is ${finding.version}, no newer than the workspace's.`);
      if (finding.kind === "young") {
        console.log(
          `::notice title=Held back::${finding.deck} ${finding.version} was published at ${finding.published.toISOString()}, ` +
            `inside pnpm's ${String(holdMinutes)}-minute release-age hold. A later daily run bumps it.`,
        );
      }
      if (finding.kind === "bump") {
        console.log(`${finding.deck}: npm's latest is ${finding.version}, past the hold.`);
        bumps.push(finding);
      }
    }
    output("releases", releases(bumps));
    return;
  }
  const release = parseRelease(process.env["DECK"], process.env["VERSION"]);
  if (command === "check") {
    output("deck", release.deck);
    output("version", release.version);
    output("branch", branchOf(release));
    output("releases", releases([release]));
    return;
  }
  if (command === "bump" && body !== undefined) {
    const { changes } = await bumpWorkspace(process.cwd(), release);
    if (changes.length === 0) {
      console.log(`No workspace package depends on @${release.deck}/* at a version other than ${release.version}. Nothing to bump.`);
      output("changed", "false");
      return;
    }
    for (const { file, name, from, to } of changes) console.log(`${file}: ${name} ${from} -> ${to}`);
    writeFileSync(body, prBody(release, changes));
    output("changed", "true");
    return;
  }
  throw new Error("Usage: cli.ts check | cli.ts find | cli.ts bump <body-file>");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // An annotation is one line; the whole message follows in the log.
  console.log(`::error title=Not bumped::${message.split("\n")[0] ?? ""}`);
  console.error(message);
  process.exitCode = 1;
});
