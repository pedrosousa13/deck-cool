import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";

export const DECKS = ["slidedeck", "playdeck", "pagedeck"] as const;
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
    throw new Error(`The payload's deck is ${JSON.stringify(deck)}, which is not a deck — send "slidedeck", "playdeck" or "pagedeck"`);
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

function isNewer(spec: string, version: string): boolean {
  const current = versionOf(spec);
  const next = versionOf(version) ?? [];
  if (current === undefined) return false;
  for (const [index, part] of current.entries()) {
    const other = next[index] ?? 0;
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

/** Whether a `minimumReleaseAgeExclude` entry (`@scope/*`, `name`, or `name@1.0.0 || 1.0.1`) lets this version skip the hold. */
export function isExcluded(name: string, version: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    const at = pattern.lastIndexOf("@");
    const namePattern = at > 0 ? pattern.slice(0, at) : pattern;
    const versions = at > 0 ? pattern.slice(at + 1).split("||").map((entry) => entry.trim()) : undefined;
    const glob = new RegExp(`^${namePattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\/]/g, "\\$&")).join(".*")}$`);
    return glob.test(name) && (versions === undefined || versions.includes(version));
  });
}

export function prBody({ deck, version }: Release, changes: readonly Change[], bypassed: readonly string[]): string {
  const rows = changes.map(({ file, name, from, to }) => `| \`${file}\` | \`${name}\` | ${from} | ${to} |`);
  const hold =
    bypassed.length === 0
      ? `pnpm's release-age hold applied: the install refused any version younger than \`minimumReleaseAge\`, so every version here has been on npm for at least that long.`
      : [
          `**The release-age hold was bypassed for ${bypassed.map((name) => `\`${name}\``).join(", ")}.** ` +
            "`minimumReleaseAgeExclude` in `pnpm-workspace.yaml` exempts them, so pnpm installed this version without waiting, " +
            "and this PR merges itself once CI passes. That is by design today: the exclusion lets the maintainer take a release of their own framework the day it ships.",
          "",
          `Proposal: remove \`@${deck}/*\` from \`minimumReleaseAgeExclude\`, so an automated bump waits a day like every other dependency and a bad release has time to be noticed before it reaches \`main\`. ` +
            "A same-day upgrade by hand can still list the one version (`name@x.y.z`). This PR does not change the exclusion.",
        ].join("\n");
  return [
    `${deck} ${version} was published, and its release workflow sent \`deck-released\`. This sets every \`@${deck}/*\` dependency in the workspace to ${version} and updates the lockfile.`,
    "",
    "| File | Package | From | To |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    hold,
    "",
  ].join("\n");
}

const run = promisify(execFile);

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
): Promise<{ changes: Change[]; bypassed: string[] }> {
  const options = { cwd: root, env: { ...process.env, ...env, pnpm_config_minimum_release_age_strict: "true" } };
  const listed: unknown = JSON.parse((await run("pnpm", ["ls", "-r", "--depth", "-1", "--json"], options)).stdout);
  const paths = Array.isArray(listed)
    ? listed.flatMap((project: unknown) => (isRecord(project) && typeof project["path"] === "string" ? [project["path"]] : []))
    : [];
  const excluded: unknown = JSON.parse((await run("pnpm", ["config", "get", "minimumReleaseAgeExclude", "--json"], options)).stdout || "[]");
  const patterns = Array.isArray(excluded) ? excluded.filter((pattern): pattern is string => typeof pattern === "string") : [];

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
  if (changes.length === 0) return { changes, bypassed: [] };

  for (const [file, text] of writes) writeFileSync(file, text);
  try {
    await run("pnpm", ["install", "--no-frozen-lockfile"], options);
  } catch (error) {
    const output = (isRecord(error) ? `${String(error["stdout"] ?? "")}${String(error["stderr"] ?? "")}` : "") || String(error);
    if (output.includes("ERR_PNPM_NO_MATURE_MATCHING_VERSION")) {
      throw new Error(
        `${release.deck} ${release.version} is younger than pnpm's release-age hold (minimumReleaseAge), so nothing was pushed. ` +
          `Send deck-released again once the version is a day old. pnpm said:\n${output}`,
      );
    }
    throw new Error(`pnpm install failed, so nothing was pushed. pnpm said:\n${output}`);
  }
  const bypassed = [...new Set(changes.map((change) => change.name))].filter((name) => isExcluded(name, release.version, patterns)).sort();
  return { changes, bypassed };
}
