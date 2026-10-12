import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";

export const DECKS = ["playdeck", "pagedeck"] as const;
export type Deck = (typeof DECKS)[number];

/** What a deck's release workflow sends in its `deck-released` dispatch. */
export interface Release {
  readonly deck: Deck;
  readonly version: string;
}

/** One dependency set to the release's version, in one workspace package. */
export interface Change {
  /** The package.json, from the workspace root. */
  readonly file: string;
  readonly name: string;
  readonly from: string;
  readonly to: string;
}

const PLAIN_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

function isDeck(value: unknown): value is Deck {
  return DECKS.some((deck) => deck === value);
}

/** Checks the dispatch's payload, which anyone holding a token for the repo can send. */
export function parseRelease(deck: unknown, version: unknown): Release {
  if (!isDeck(deck)) {
    throw new Error(`The payload's deck is ${JSON.stringify(deck)}, which is not a deck — send "playdeck" or "pagedeck"`);
  }
  if (typeof version !== "string" || !PLAIN_VERSION.test(version)) {
    throw new Error(
      `The payload's version is ${JSON.stringify(version)}, which is not a plain version — send MAJOR.MINOR.PATCH, such as "1.4.0"`,
    );
  }
  return { deck, version };
}

export function branchOf({ deck, version }: Release): string {
  return `bump/${deck}-${version}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const FIELDS = ["dependencies", "devDependencies", "optionalDependencies"] as const;

/** The X.Y.Z a spec names, such as `1.2.0` or `^1.2.0`, as numbers. */
function versionOf(spec: string): number[] | undefined {
  return /^[\^~=v]?(\d+)\.(\d+)\.(\d+)/.exec(spec)?.slice(1).map(Number);
}

/** Whether `a`'s X.Y.Z is newer than `b`'s. Each is a version or a spec. */
function isNewer(a: string, b: string): boolean {
  const left = versionOf(a);
  const right = versionOf(b) ?? [];
  if (left === undefined) return false;
  for (const [index, part] of left.entries()) {
    const other = right[index] ?? 0;
    if (part !== other) return part > other;
  }
  return false;
}

/**
 * Sets every `@<deck>/*` dependency to the exact version. A `workspace:` link is left as it is.
 * Throws if any of them is already at a newer version: an older dispatch must not open a downgrade.
 */
export function bumpManifest(text: string, { deck, version }: Release): { text: string; changes: Omit<Change, "file">[] } {
  const manifest: unknown = JSON.parse(text);
  if (!isRecord(manifest)) throw new Error("package.json is not a JSON object");
  const changes: Omit<Change, "file">[] = [];
  for (const field of FIELDS) {
    const dependencies = manifest[field];
    if (!isRecord(dependencies)) continue;
    for (const [name, from] of Object.entries(dependencies)) {
      if (typeof from !== "string") continue;
      if (!name.startsWith(`@${deck}/`) || from === version || from.startsWith("workspace:")) continue;
      if (isNewer(from, version)) {
        throw new Error(
          `${name} is at ${from}, newer than ${deck} ${version} — a deck-released dispatch never downgrades, so nothing was bumped`,
        );
      }
      dependencies[name] = version;
      changes.push({ name, from, to: version });
    }
  }
  return changes.length === 0 ? { text, changes } : { text: `${JSON.stringify(manifest, null, 2)}\n`, changes };
}

export function prBody({ deck, version }: Release, changes: readonly Change[]): string {
  const rows = changes.map(({ file, name, from, to }) => `| \`${file}\` | \`${name}\` | ${from} | ${to} |`);
  return [
    `${deck} ${version} was published to npm. This sets every \`@${deck}/*\` dependency in the workspace to ${version} and updates the lockfile.`,
    "",
    "| File | Package | From | To |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    `pnpm's release-age hold applied: the install refused any version younger than \`minimumReleaseAge\`, so every version here has been on npm for at least that long.`,
    "",
  ].join("\n");
}

/** What the daily run found on npm for one deck. */
export type Finding =
  /** No workspace package depends on the deck from npm. */
  | { readonly kind: "unused"; readonly deck: Deck }
  /** npm's latest version is no newer than the workspace's. */
  | { readonly kind: "current"; readonly deck: Deck; readonly version: string }
  /** npm's latest version is newer, but still inside pnpm's release-age hold. */
  | { readonly kind: "young"; readonly deck: Deck; readonly version: string; readonly published: Date }
  /** npm's latest version is newer and past the hold. */
  | ({ readonly kind: "bump" } & Release);

export interface RegistryOptions {
  /** The registry's URL, ending in `/`. */
  readonly registry: string;
  /** pnpm's `minimumReleaseAge`. */
  readonly holdMinutes: number;
  readonly now: Date;
  readonly fetch: typeof globalThis.fetch;
}

/** Every `@<deck>/*` dependency from npm in the manifests, as name and spec. */
function dependenciesOf(manifests: readonly string[], deck: Deck): [string, string][] {
  return manifests.flatMap((text) => {
    const manifest: unknown = JSON.parse(text);
    if (!isRecord(manifest)) throw new Error("package.json is not a JSON object");
    return FIELDS.flatMap((field) => {
      const dependencies = manifest[field];
      if (!isRecord(dependencies)) return [];
      return Object.entries(dependencies).flatMap(([name, spec]): [string, string][] =>
        typeof spec === "string" && name.startsWith(`@${deck}/`) && !spec.startsWith("workspace:") ? [[name, spec]] : [],
      );
    });
  });
}

/** npm's latest version of the package, and when it was published. The registry is untrusted too. */
async function latestOf(name: string, { registry, fetch }: RegistryOptions): Promise<{ version: string; published: Date }> {
  const url = `${registry}${name.replace("/", "%2f")}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" } });
  } catch (error) {
    throw new Error(`npm did not answer for ${name}: ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`npm did not answer for ${name}: ${url} returned HTTP ${String(response.status)}`);
  const packument: unknown = await response.json();
  const tags = isRecord(packument) ? packument["dist-tags"] : undefined;
  const version = isRecord(tags) ? tags["latest"] : undefined;
  if (typeof version !== "string" || !PLAIN_VERSION.test(version)) {
    throw new Error(`npm's latest ${name} is ${JSON.stringify(version)}, which is not a plain version, so nothing was bumped`);
  }
  const times = isRecord(packument) ? packument["time"] : undefined;
  const time = isRecord(times) ? times[version] : undefined;
  const published = typeof time === "string" ? new Date(time) : undefined;
  if (published === undefined || Number.isNaN(published.getTime())) {
    throw new Error(`npm gives no publish time for ${name} ${version}, so nothing was bumped`);
  }
  return { version, published };
}

/**
 * For each deck in turn, reads npm's latest version of every `@<deck>/*` package the
 * workspace depends on, takes the highest, and says whether the deck can be bumped to it:
 * whether any package is below it, and it has passed the hold. The bump itself goes
 * through the same path as a dispatch, which checks again.
 */
export async function findReleases(manifests: readonly string[], options: RegistryOptions): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const deck of DECKS) {
    const dependencies = dependenciesOf(manifests, deck);
    const names = [...new Set(dependencies.map(([name]) => name))].sort();
    let newest: { version: string; published: Date } | undefined;
    for (const name of names) {
      const latest = await latestOf(name, options);
      if (newest === undefined || isNewer(latest.version, newest.version)) newest = latest;
    }
    if (newest === undefined) {
      findings.push({ kind: "unused", deck });
    } else if (!dependencies.some(([, spec]) => isNewer(newest.version, spec))) {
      findings.push({ kind: "current", deck, version: newest.version });
    } else if (options.now.getTime() - newest.published.getTime() < options.holdMinutes * 60 * 1000) {
      findings.push({ kind: "young", deck, version: newest.version, published: newest.published });
    } else {
      findings.push({ kind: "bump", deck, version: newest.version });
    }
  }
  return findings;
}

const run = promisify(execFile);

/** The directory of every package in the workspace at `root`, the root's own included. */
export async function workspacePaths(root: string, env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  const listed: unknown = JSON.parse((await run("pnpm", ["ls", "-r", "--depth", "-1", "--json"], { cwd: root, env })).stdout);
  return Array.isArray(listed)
    ? listed.flatMap((project: unknown) => (isRecord(project) && typeof project["path"] === "string" ? [project["path"]] : []))
    : [];
}

/**
 * Bumps every `@<deck>/*` dependency in every workspace package under `root`, then updates
 * the lockfile with `pnpm install`. Changes nothing when no package depends on the deck at
 * another version, and throws before writing anything when one is at a newer version.
 *
 * pnpm runs in strict release-age mode: by default it would add a too-young version to
 * `minimumReleaseAgeExclude` and install it anyway.
 */
export async function bumpWorkspace(
  root: string,
  release: Release,
  env: Readonly<Record<string, string>> = {},
): Promise<{ changes: Change[] }> {
  const options = { cwd: root, env: { ...process.env, ...env, pnpm_config_minimum_release_age_strict: "true" } };
  const paths = await workspacePaths(root, options.env);

  const changes: Change[] = [];
  const writes: [string, string][] = [];
  for (const path of paths) {
    const file = join(path, "package.json");
    const bumped = bumpManifest(readFileSync(file, "utf8"), release);
    if (bumped.changes.length === 0) continue;
    writes.push([file, bumped.text]);
    const name = relative(root, file).split(sep).join("/");
    changes.push(...bumped.changes.map((change) => ({ file: name, ...change })));
  }
  changes.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.name < b.name ? -1 : 1));
  if (changes.length === 0) return { changes };

  for (const [file, text] of writes) writeFileSync(file, text);
  try {
    await run("pnpm", ["install", "--no-frozen-lockfile"], options);
  } catch (error) {
    const output = (isRecord(error) ? `${String(error["stdout"] ?? "")}${String(error["stderr"] ?? "")}` : "") || String(error);
    if (output.includes("ERR_PNPM_NO_MATURE_MATCHING_VERSION")) {
      throw new Error(
        `${release.deck} ${release.version} is younger than pnpm's release-age hold (minimumReleaseAge), so nothing was pushed. ` +
          `The daily run bumps it once the version is a day old. pnpm said:\n${output}`,
      );
    }
    throw new Error(`pnpm install failed, so nothing was pushed. pnpm said:\n${output}`);
  }
  return { changes };
}
