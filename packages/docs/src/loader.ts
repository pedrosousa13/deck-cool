import type { Loader } from "@pagedeck/content";
import type { TrailingSlash } from "@pagedeck/core";
import { createMarkdownRenderer } from "@pagedeck/markdown-loader";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { DocsOptions } from "./index.ts";
import { scanPage, splitAtDemos } from "./page.ts";
import type { BodyPart, Fault } from "./page.ts";

export interface DocsPage {
  readonly title: string;
  readonly description: string;
  /** The page's file in the docs package, such as `guides/layout.md`. */
  readonly file: string;
  /** The address the site serves the page at, such as `/docs/guides/layout/`. */
  readonly href: string;
  /** The whole docs nav, the same on every page. */
  readonly nav: readonly NavGroup[];
  /** The page's rendered markdown, cut at each demo marker. */
  readonly body: readonly BodyPart[];
}

export interface NavGroup {
  readonly label: string;
  /** Each page's `title` here is what the nav names it: its `label`, or else its title. */
  readonly pages: readonly { readonly title: string; readonly href: string }[];
}

/** nav.json as the contract writes it. */
interface NavFile {
  readonly label: string;
  readonly pages: readonly string[];
}

const LOCALE = "en";
const EXTENSION = ".md";

/** Node's lookup, without `exports`: the package need not export its `package.json`. */
function resolvePackage(name: string, from: string | URL): string {
  const require = createRequire(from);
  for (const directory of require.resolve.paths(name) ?? []) {
    const root = join(directory, name);
    if (existsSync(join(root, "package.json"))) return root;
  }
  throw new Error(
    `Docs package "${name}": cannot be found from ${String(from)} — add it to the site's dependencies and install`,
  );
}

/** npm puts these in every package, so they are not pages. */
const NOT_PAGES = new Set(["readme.md", "changelog.md", "license.md"]);
const SKIPPED_DIRECTORIES = new Set(["assets", "node_modules"]);

/** Every page's path from the package root, POSIX-spelled and sorted. */
function pageFiles(root: string, directory = root): string[] {
  const files: string[] = [];
  for (const dirent of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, dirent.name);
    if (dirent.isDirectory()) {
      if (!(directory === root && SKIPPED_DIRECTORIES.has(dirent.name))) files.push(...pageFiles(root, absolute));
      continue;
    }
    if (!dirent.isFile() || !dirent.name.endsWith(EXTENSION)) continue;
    if (directory === root && NOT_PAGES.has(dirent.name.toLowerCase())) continue;
    files.push(relative(root, absolute).split(sep).join(posix.sep));
  }
  return files.sort();
}

function segments(path: string): string[] {
  return path.split("/").filter((segment) => segment !== "");
}

/** The entry path Pagedeck routes by: the base, then the file without `.md`. */
function entryPath(base: string, file: string): string {
  return [...segments(base), ...segments(file.slice(0, -EXTENSION.length))].join("/");
}

/**
 * The address a page is served at, from its file in the docs package, under the site's base
 * and trailing-slash policy: `guides/layout.md` under `/docs` is `/docs/guides/layout/`.
 */
export function docsHref(base: string, file: string, trailingSlash: TrailingSlash = "always"): string {
  const parts = segments(entryPath(base, file));
  if (parts.at(-1) === "index") parts.pop();
  if (parts.length === 0) return "/";
  const path = `/${parts.join("/")}`;
  return trailingSlash === "always" ? `${path}/` : path;
}

function hrefOf(options: DocsOptions, file: string): string {
  return docsHref(options.base, file, options.trailingSlash);
}

const NAV = "nav.json";

function isNav(value: unknown): value is NavFile[] {
  return (
    Array.isArray(value) &&
    value.every(
      (group: unknown) =>
        typeof group === "object" &&
        group !== null &&
        "label" in group &&
        typeof group.label === "string" &&
        "pages" in group &&
        Array.isArray(group.pages) &&
        group.pages.every((page: unknown) => typeof page === "string"),
    )
  );
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** nav.json, checked against the pages: what it lists, and the faults between the two. */
function readNav(root: string, pages: ReadonlySet<string>): { groups: NavFile[]; faults: Fault[] } {
  const path = join(root, NAV);
  const example = '[{ "label": "Start", "pages": ["index.md"] }]';
  if (!isFile(path)) {
    return { groups: [], faults: [{ file: NAV, line: 1, message: `is missing — add ${NAV} at the package root: ${example}` }] };
  }
  const text = readFileSync(path, "utf8");
  const groups = parseJson(text);
  if (!isNav(groups)) {
    return { groups: [], faults: [{ file: NAV, line: 1, message: `is not a list of groups — write it as ${example}` }] };
  }
  const faults: Fault[] = [];
  const listed = new Set<string>();
  // Each listing is found in the text after the one before it, so a page listed twice is
  // placed at its second listing.
  let cursor = 0;
  for (const page of groups.flatMap((group) => group.pages)) {
    const at = text.indexOf(JSON.stringify(page), cursor);
    cursor = at === -1 ? cursor : at + 1;
    const line = text.slice(0, Math.max(at, 0)).split("\n").length;
    if (listed.has(page)) {
      faults.push({ file: NAV, line, message: `lists "${page}" a second time — list each page once` });
    } else if (!pages.has(page)) {
      faults.push({ file: NAV, line, message: `lists "${page}", which is not a page — remove it, or add the page` });
    }
    listed.add(page);
  }
  for (const page of pages) {
    if (!listed.has(page)) faults.push({ file: page, line: 1, message: `is not listed in ${NAV} — add "${page}" to a group in ${NAV}` });
  }
  return { groups, faults };
}

/** `guides.md` and `guides/index.md` are both served at `<base>/guides`. */
function routeCollisions(files: readonly string[], hrefOf: (file: string) => string): Fault[] {
  const owners = new Map<string, string>();
  const faults: Fault[] = [];
  for (const file of files) {
    const href = hrefOf(file);
    const owner = owners.get(href);
    if (owner === undefined) owners.set(href, file);
    else faults.push({ file, line: 1, message: `has the route ${href}, as ${owner} does — rename or remove one of the two` });
  }
  return faults;
}

/** Every fault in one report, by file and then by line. */
function problems(name: string, faults: readonly Fault[]): Error {
  const sorted = [...faults].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  const subject = sorted.length === 1 ? "1 problem — fix it" : `${String(sorted.length)} problems — fix each`;
  const lines = sorted.map(({ file, line, message }) => `${file}:${String(line)} — ${message}`);
  // One line: Pagedeck's CLI prints a loader's error as a cause, with each newline replaced.
  return new Error(`Docs package "${name}": ${subject} in the docs package: ${lines.join("; ")}`);
}

/** Where the docs' assets are staged, laid out by the address each is published at. */
export function contentRootOf(from: string | URL): string {
  return fileURLToPath(new URL(".pagedeck-docs/", from));
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

export function createDocsLoader(options: DocsOptions): Loader<DocsPage> {
  const syncAll: Loader<DocsPage>["syncAll"] = async (writer) => {
    const startedAt = Date.now();
    const root = resolvePackage(options.package, options.from);
    const files = pageFiles(root);
    const context = {
      pages: new Set(files),
      exists: (file: string) => isFile(join(root, file)),
      hrefOf: (file: string) => hrefOf(options, file),
      addressOf: (file: string) => `/${[...segments(options.base), file].join("/")}`,
      demos: new Set(Object.keys(options.demos)),
    };
    const scanned = files.map((file) => scanPage(file, readFileSync(join(root, file), "utf8"), context));
    const nav = readNav(root, context.pages);
    const faults = [...nav.faults, ...routeCollisions(files, context.hrefOf), ...scanned.flatMap((page) => page.faults)];
    if (faults.length > 0) throw problems(options.package, faults);

    const renderer = await createMarkdownRenderer({
      languages: options.languages,
      ...(options.theme === undefined ? {} : { theme: options.theme }),
    });
    const pages = [];
    for (const page of scanned) {
      const rendered = await renderer.render(page.body, page.file);
      pages.push({
        title: page.title,
        description: page.description,
        file: page.file,
        href: hrefOf(options, page.file),
        body: splitAtDemos(rendered.html),
      });
    }

    const contentRoot = contentRootOf(options.from);
    rmSync(contentRoot, { recursive: true, force: true });
    // build.passthrough refuses a contentRoot that does not exist, so a package with no images has one too.
    mkdirSync(contentRoot, { recursive: true });
    if (existsSync(join(root, "assets"))) {
      cpSync(join(root, "assets"), join(contentRoot, ...segments(options.base), "assets"), { recursive: true });
    }

    const byFile = new Map(pages.map((page) => [page.file, page]));
    const labels = new Map(scanned.map((page) => [page.file, page.label]));
    const navGroups = nav.groups.map((group) => ({
      label: group.label,
      pages: group.pages.flatMap((file) => {
        const page = byFile.get(file);
        return page === undefined ? [] : [{ title: labels.get(file) ?? page.title, href: page.href }];
      }),
    }));
    const changed = [];
    for (const page of pages) {
      const id = { locale: LOCALE, path: entryPath(options.base, page.file) };
      writer.upsert({ ...id, data: { ...page, nav: navGroups } });
      changed.push(id);
    }
    return { changed, deleted: [], authoritative: true, cursor: startedAt };
  };
  // Every check spans the whole package, so an incremental sync reads it all too. Only a
  // full sync may report itself authoritative, so a page removed since is pruned by the next one.
  const syncSince: Loader<DocsPage>["syncSince"] = async (writer) => ({ ...(await syncAll(writer)), authoritative: false });
  return { syncAll, syncSince };
}
