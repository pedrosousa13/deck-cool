import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { branchOf, bumpManifest, bumpWorkspace, findReleases, parseRelease, prBody } from "./bump.ts";

describe("the payload", () => {
  test.each(["playdeck", "pagedeck"])("accepts %s at a plain version", (deck) => {
    expect(parseRelease(deck, "1.20.3")).toEqual({ deck, version: "1.20.3" });
  });

  test.each<[string, unknown]>([
    ["a deck that is not in the family", "formdeck"],
    // It lives in this repo now, and its release deploys its site (ADR 0002).
    ["carouseldeck", "carouseldeck"],
    ["slidedeck, carouseldeck's old name", "slidedeck"],
    ["an empty deck", ""],
    ["no deck", undefined],
    ["a deck with a path in it", "../playdeck"],
    ["a deck with a command in it", "playdeck; rm -rf /"],
    ["a deck in capitals", "Playdeck"],
  ])("rejects %s", (_name, deck) => {
    expect(() => parseRelease(deck, "1.2.3")).toThrow(
      `The payload's deck is ${JSON.stringify(deck)}, which is not a deck — send "playdeck" or "pagedeck"`,
    );
  });

  test.each<[string, unknown]>([
    ["a version with two parts", "1.2"],
    ["a version with a v", "v1.2.3"],
    ["a prerelease", "1.2.3-rc.1"],
    ["build metadata", "1.2.3+abc"],
    ["a leading zero", "01.2.3"],
    ["a trailing newline", "1.2.3\n"],
    ["a version with a command in it", "1.2.3; rm -rf /"],
    ["a number", 1.2],
    ["no version", undefined],
  ])("rejects %s", (_name, version) => {
    expect(() => parseRelease("playdeck", version)).toThrow(
      `The payload's version is ${JSON.stringify(version)}, which is not a plain version — send MAJOR.MINOR.PATCH, such as "1.4.0"`,
    );
  });

  test("names the bump's branch", () => {
    expect(branchOf({ deck: "pagedeck", version: "0.3.0" })).toBe("bump/pagedeck-0.3.0");
  });
});

describe("a manifest's bump", () => {
  const manifest = (fields: object) => `${JSON.stringify({ name: "@sites/x", ...fields }, null, 2)}\n`;

  test("sets every @<deck>/* dependency to the exact version, and only those", () => {
    const before = manifest({
      dependencies: { "@playdeck/core": "1.0.0", "@pagedeck/core": "0.2.3", playdeck: "1.0.0" },
      devDependencies: { "@playdeck/docs": "^1.0.0" },
      optionalDependencies: { "@playdeck/extra": "1.0.0" },
      peerDependencies: { "@playdeck/core": "^1.0.0" },
    });
    const { text, changes } = bumpManifest(before, { deck: "playdeck", version: "1.1.0" });
    expect(JSON.parse(text)).toEqual({
      name: "@sites/x",
      dependencies: { "@playdeck/core": "1.1.0", "@pagedeck/core": "0.2.3", playdeck: "1.0.0" },
      devDependencies: { "@playdeck/docs": "1.1.0" },
      optionalDependencies: { "@playdeck/extra": "1.1.0" },
      peerDependencies: { "@playdeck/core": "^1.0.0" },
    });
    expect(text.endsWith("}\n")).toBe(true);
    expect(changes).toEqual([
      { name: "@playdeck/core", from: "1.0.0", to: "1.1.0" },
      { name: "@playdeck/docs", from: "^1.0.0", to: "1.1.0" },
      { name: "@playdeck/extra", from: "1.0.0", to: "1.1.0" },
    ]);
  });

  test("bumps a dependency at an older version", () => {
    const before = manifest({ dependencies: { "@playdeck/core": "1.9.9" } });
    expect(bumpManifest(before, { deck: "playdeck", version: "1.10.0" }).changes).toEqual([
      { name: "@playdeck/core", from: "1.9.9", to: "1.10.0" },
    ]);
  });

  test("refuses a downgrade, naming the package and both versions", () => {
    const before = manifest({ dependencies: { "@playdeck/core": "1.10.0" } });
    expect(() => bumpManifest(before, { deck: "playdeck", version: "1.9.9" })).toThrow(
      "@playdeck/core is at 1.10.0, newer than playdeck 1.9.9 — a deck-released dispatch never downgrades, so nothing was bumped",
    );
  });

  test("refuses a downgrade from a range's version", () => {
    const before = manifest({ devDependencies: { "@playdeck/docs": "^2.0.0" } });
    expect(() => bumpManifest(before, { deck: "playdeck", version: "1.9.9" })).toThrow(
      "@playdeck/docs is at ^2.0.0, newer than playdeck 1.9.9",
    );
  });

  test("refuses the whole manifest when one package is newer", () => {
    const before = manifest({ dependencies: { "@playdeck/core": "1.0.0", "@playdeck/docs": "1.3.0" } });
    expect(() => bumpManifest(before, { deck: "playdeck", version: "1.2.0" })).toThrow(
      "@playdeck/docs is at 1.3.0, newer than playdeck 1.2.0",
    );
  });

  test("refuses a manifest that is not a JSON object", () => {
    expect(() => bumpManifest("[]\n", { deck: "playdeck", version: "1.1.0" })).toThrow("package.json is not a JSON object");
  });

  test("leaves a workspace link as it is", () => {
    const before = manifest({ dependencies: { "@carouseldeck/docs": "workspace:*" } });
    expect(bumpManifest(before, { deck: "playdeck", version: "1.1.0" })).toEqual({ text: before, changes: [] });
  });

  test("changes nothing when every dependency is already at the version", () => {
    const before = manifest({ dependencies: { "@playdeck/docs": "1.1.0" } });
    expect(bumpManifest(before, { deck: "playdeck", version: "1.1.0" })).toEqual({ text: before, changes: [] });
  });
});

describe("the PR body", () => {
  const changes = [
    { file: "sites/page/package.json", name: "@pagedeck/core", from: "0.2.3", to: "0.3.0" },
    { file: "packages/docs/package.json", name: "@pagedeck/core", from: "0.2.3", to: "0.3.0" },
  ];

  test("lists every change, and says the hold applied", () => {
    const body = prBody({ deck: "pagedeck", version: "0.3.0" }, changes);
    expect(body).toContain("| `sites/page/package.json` | `@pagedeck/core` | 0.2.3 | 0.3.0 |");
    expect(body).toContain("| `packages/docs/package.json` | `@pagedeck/core` | 0.2.3 | 0.3.0 |");
    expect(body).toContain("pnpm's release-age hold applied");
    expect(body).not.toContain("bypassed");
  });
});

describe("the daily run", () => {
  const HOUR = 60 * 60 * 1000;
  const now = new Date("2026-10-09T06:17:00Z");
  const manifests = [
    JSON.stringify({ name: "a", dependencies: { "@pagedeck/core": "0.2.3", "@pagedeck/content": "0.2.3" } }),
    JSON.stringify({ name: "b", devDependencies: { "@pagedeck/islands": "0.2.3", "@carouseldeck/docs": "workspace:*" } }),
  ];

  /** A fetch that answers for each package name in `latest`, and records what it was asked for. */
  function npm(latest: Readonly<Record<string, { version: string; published: Date }>>) {
    const asked: string[] = [];
    const fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      asked.push(url);
      const name = decodeURIComponent(url.slice("https://registry.npmjs.org/".length));
      const entry = latest[name];
      if (entry === undefined) return new Response("{}", { status: 404 });
      return Response.json({ name, "dist-tags": { latest: entry.version }, time: { [entry.version]: entry.published.toISOString() } });
    };
    return { asked, fetch };
  }
  const options = (fetch: typeof globalThis.fetch) => ({ registry: "https://registry.npmjs.org/", fetch, now, holdMinutes: 1440 });
  const ago = (hours: number) => new Date(now.getTime() - hours * HOUR);
  /** npm's answer for every @pagedeck/* package the manifests use, with `rest` in front. */
  const pagedeck = (version: string, published: Date, rest: Readonly<Record<string, { version: string; published: Date }>> = {}) => ({
    "@pagedeck/content": { version, published },
    "@pagedeck/core": { version, published },
    "@pagedeck/islands": { version, published },
    ...rest,
  });

  test("finds nothing newer, and asks npm about every package of the decks the workspace uses", async () => {
    const { asked, fetch } = npm(pagedeck("0.2.3", ago(48)));
    expect(await findReleases(manifests, options(fetch))).toEqual([
      { kind: "unused", deck: "playdeck" },
      { kind: "current", deck: "pagedeck", version: "0.2.3" },
    ]);
    expect(asked).toEqual([
      "https://registry.npmjs.org/@pagedeck%2fcontent",
      "https://registry.npmjs.org/@pagedeck%2fcore",
      "https://registry.npmjs.org/@pagedeck%2fislands",
    ]);
  });

  test("skips a newer version that is still inside the hold", async () => {
    const { fetch } = npm(pagedeck("0.3.0", ago(2)));
    expect((await findReleases(manifests, options(fetch))).at(-1)).toEqual({ kind: "young", deck: "pagedeck", version: "0.3.0", published: ago(2) });
  });

  test("bumps a newer version that has passed the hold", async () => {
    const { fetch } = npm(pagedeck("0.3.0", ago(25)));
    expect((await findReleases(manifests, options(fetch))).at(-1)).toEqual({ kind: "bump", deck: "pagedeck", version: "0.3.0" });
  });

  test("bumps a workspace that is half bumped: one package at the latest, another below it", async () => {
    const mixed = [JSON.stringify({ name: "a", dependencies: { "@pagedeck/content": "0.2.3", "@pagedeck/core": "0.3.0" } })];
    const { fetch } = npm(pagedeck("0.3.0", ago(48)));
    expect((await findReleases(mixed, options(fetch))).at(-1)).toEqual({ kind: "bump", deck: "pagedeck", version: "0.3.0" });
  });

  test("takes the highest latest among the deck's packages, and reads the hold from that one", async () => {
    const { fetch } = npm(pagedeck("0.3.0", ago(48), { "@pagedeck/islands": { version: "0.3.1", published: ago(2) } }));
    expect((await findReleases(manifests, options(fetch))).at(-1)).toEqual({ kind: "young", deck: "pagedeck", version: "0.3.1", published: ago(2) });
  });

  test("fails on a registry error for any of the deck's packages", async () => {
    const { fetch } = npm({ "@pagedeck/content": { version: "0.3.0", published: ago(48) }, "@pagedeck/islands": { version: "0.3.0", published: ago(48) } });
    await expect(findReleases(manifests, options(fetch))).rejects.toThrow(
      "npm did not answer for @pagedeck/core: https://registry.npmjs.org/@pagedeck%2fcore returned HTTP 404",
    );
  });

  test("fails on a registry error, naming the package and the status", async () => {
    const { fetch } = npm({});
    await expect(findReleases(manifests, options(fetch))).rejects.toThrow(
      "npm did not answer for @pagedeck/content: https://registry.npmjs.org/@pagedeck%2fcontent returned HTTP 404",
    );
  });

  test("fails when the registry cannot be reached", async () => {
    const fetch = async (): Promise<Response> => {
      throw new TypeError("fetch failed");
    };
    await expect(findReleases(manifests, options(fetch))).rejects.toThrow(
      "npm did not answer for @pagedeck/content: https://registry.npmjs.org/@pagedeck%2fcontent: fetch failed",
    );
  });

  test.each<[string, object]>([
    ["a latest version that is not plain", { "dist-tags": { latest: "0.3.0-rc.1" }, time: { "0.3.0-rc.1": "2026-10-01T00:00:00Z" } }],
    ["no latest version", { "dist-tags": {}, time: {} }],
  ])("fails on %s", async (_name, packument) => {
    const fetch = async (): Promise<Response> => Response.json(packument);
    await expect(findReleases(manifests, options(fetch))).rejects.toThrow(/^npm's latest @pagedeck\/content is .*, which is not a plain version/);
  });

  test("fails when npm gives no publish time for the version", async () => {
    const fetch = async (): Promise<Response> => Response.json({ "dist-tags": { latest: "0.3.0" }, time: {} });
    await expect(findReleases(manifests, options(fetch))).rejects.toThrow("npm gives no publish time for @pagedeck/content 0.3.0");
  });
});

/**
 * A registry with one package per name in `versions`, each version published at the time given.
 * pnpm reads the packument's `time` for its release-age hold.
 */
async function registry(dir: string, versions: Readonly<Record<string, Readonly<Record<string, Date>>>>): Promise<Server> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const tarballs = new Map<string, Buffer>();
  const packuments = new Map<string, object>();
  for (const [name, published] of Object.entries(versions)) {
    const entries: Record<string, object> = {};
    for (const version of Object.keys(published)) {
      const source = join(dir, "tarballs", `${name}-${version}`);
      mkdirSync(join(source, "package"), { recursive: true });
      writeFileSync(join(source, "package", "package.json"), JSON.stringify({ name, version }));
      const tgz = join(source, "package.tgz");
      execFileSync("tar", ["-czf", tgz, "-C", source, "package"]);
      const data = readFileSync(tgz);
      const path = `/tarballs/${name}/-/${version}.tgz`;
      tarballs.set(path, data);
      entries[version] = {
        name,
        version,
        dist: {
          tarball: origin + path,
          integrity: `sha512-${createHash("sha512").update(data).digest("base64")}`,
          shasum: createHash("sha1").update(data).digest("hex"),
        },
      };
    }
    const times = Object.values(published).map((date) => date.getTime());
    const latest = Object.keys(published).at(-1) ?? "";
    packuments.set(name, {
      name,
      "dist-tags": { latest },
      versions: entries,
      modified: new Date(Math.max(...times)).toISOString(),
      time: {
        created: new Date(Math.min(...times)).toISOString(),
        modified: new Date(Math.max(...times)).toISOString(),
        ...Object.fromEntries(Object.entries(published).map(([version, date]) => [version, date.toISOString()])),
      },
    });
  }
  server.on("request", (request, response) => {
    const path = decodeURIComponent(request.url ?? "");
    const tarball = tarballs.get(path);
    const packument = packuments.get(path.slice(1));
    if (tarball !== undefined) {
      response.writeHead(200, { "content-type": "application/octet-stream" }).end(tarball);
    } else if (packument !== undefined) {
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(packument));
    } else {
      response.writeHead(404).end("{}");
    }
  });
  return server;
}

describe("a workspace's bump", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const old = new Date(Date.now() - 3 * DAY);
  const mature = new Date(Date.now() - 2 * DAY);
  const fresh = new Date(Date.now() - 60 * 1000);
  const published = { "1.0.0": old, "1.1.0": mature, "1.2.0": fresh };

  let dir: string;
  let server: Server;
  let env: Record<string, string>;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bump-deck-"));
    server = await registry(dir, {
      "@playdeck/core": published,
      "@playdeck/docs": published,
      "@pagedeck/core": published,
    });
    const { port } = server.address() as AddressInfo;
    env = {
      pnpm_config_registry: `http://127.0.0.1:${String(port)}/`,
      pnpm_config_store_dir: join(dir, "store"),
      pnpm_config_cache_dir: join(dir, "cache"),
    };
  });
  afterAll(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const workspaces: string[] = [];
  afterEach(() => {
    for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true });
  });

  const packageManager = (JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as { packageManager: string })
    .packageManager;

  /** A workspace of two packages, installed at 1.0.0. */
  async function workspace(site: Record<string, string> = { "@playdeck/core": "1.0.0", "@pagedeck/core": "1.0.0" }): Promise<string> {
    const root = mkdtempSync(join(dir, "workspace-"));
    workspaces.push(root);
    const write = (file: string, value: object) => {
      mkdirSync(join(root, file, ".."), { recursive: true });
      writeFileSync(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
    };
    write("package.json", { name: "root", private: true, packageManager });
    write("sites/a/package.json", { name: "a", private: true, dependencies: site });
    write("packages/b/package.json", { name: "b", private: true, devDependencies: { "@playdeck/docs": "1.0.0" } });
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - sites/*\n  - packages/*\n");
    // Not execFileSync: the registry answers on this process's event loop.
    await promisify(execFile)("pnpm", ["install"], { cwd: root, env: { ...process.env, ...env } });
    return root;
  }

  const read = (root: string, file: string) => readFileSync(join(root, file), "utf8");

  test("bumps every @<deck>/* dependency in every package, and the lockfile", { timeout: 60_000 }, async () => {
    const root = await workspace();
    const { changes } = await bumpWorkspace(root, { deck: "playdeck", version: "1.1.0" }, env);
    expect(changes).toEqual([
      { file: "packages/b/package.json", name: "@playdeck/docs", from: "1.0.0", to: "1.1.0" },
      { file: "sites/a/package.json", name: "@playdeck/core", from: "1.0.0", to: "1.1.0" },
    ]);
    expect(JSON.parse(read(root, "sites/a/package.json"))).toMatchObject({
      dependencies: { "@playdeck/core": "1.1.0", "@pagedeck/core": "1.0.0" },
    });
    const lockfile = read(root, "pnpm-lock.yaml");
    expect(lockfile).toContain("'@playdeck/core@1.1.0'");
    expect(lockfile).toContain("'@playdeck/docs@1.1.0'");
    expect(lockfile).not.toContain("'@playdeck/core@1.0.0'");
  });

  test("changes nothing on a repeat", { timeout: 60_000 }, async () => {
    const root = await workspace();
    await bumpWorkspace(root, { deck: "playdeck", version: "1.1.0" }, env);
    const lockfile = read(root, "pnpm-lock.yaml");
    expect(await bumpWorkspace(root, { deck: "playdeck", version: "1.1.0" }, env)).toEqual({ changes: [] });
    expect(read(root, "pnpm-lock.yaml")).toBe(lockfile);
  });

  test("refuses a downgrade in any package, and writes nothing", { timeout: 60_000 }, async () => {
    const root = await workspace();
    await bumpWorkspace(root, { deck: "playdeck", version: "1.1.0" }, env);
    // One package newer than the dispatch, the other older.
    const site = read(root, "sites/a/package.json").replace('"@playdeck/core": "1.1.0"', '"@playdeck/core": "1.0.0"');
    writeFileSync(join(root, "sites/a/package.json"), site);
    const files = ["sites/a/package.json", "packages/b/package.json", "pnpm-lock.yaml"].map((file) => read(root, file));
    await expect(bumpWorkspace(root, { deck: "playdeck", version: "1.0.5" }, env)).rejects.toThrow(
      "@playdeck/docs is at 1.1.0, newer than playdeck 1.0.5",
    );
    expect(["sites/a/package.json", "packages/b/package.json", "pnpm-lock.yaml"].map((file) => read(root, file))).toEqual(files);
  });

  test("changes nothing for a deck the workspace does not use", { timeout: 60_000 }, async () => {
    const root = await workspace({ "@playdeck/core": "1.0.0" });
    expect(await bumpWorkspace(root, { deck: "pagedeck", version: "1.1.0" }, env)).toEqual({ changes: [] });
  });

  test("cli.ts find bumps nothing, and writes a notice, for versions inside the hold", { timeout: 60_000 }, async () => {
    const root = await workspace();
    const outputs = join(root, "github-output");
    const { stdout } = await promisify(execFile)(process.execPath, [new URL("./cli.ts", import.meta.url).pathname, "find"], {
      cwd: root,
      env: { ...process.env, ...env, GITHUB_OUTPUT: outputs },
    });
    expect(stdout).toContain("::notice title=Held back::playdeck 1.2.0 was published at");
    expect(stdout).toContain("::notice title=Held back::pagedeck 1.2.0 was published at");
    expect(read(root, "github-output")).toBe("releases=[]\n");
  });

  test("fails on a version younger than the release-age hold, and excludes nothing", { timeout: 60_000 }, async () => {
    const root = await workspace();
    const yaml = read(root, "pnpm-workspace.yaml");
    await expect(bumpWorkspace(root, { deck: "playdeck", version: "1.2.0" }, env)).rejects.toThrow(
      /playdeck 1\.2\.0 is younger than pnpm's release-age hold \(minimumReleaseAge\)/,
    );
    expect(read(root, "pnpm-workspace.yaml")).toBe(yaml);
  });
});
