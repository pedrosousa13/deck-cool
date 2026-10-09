import type { Loader } from "@pagedeck/content";
import { createMarkdownRenderer } from "@pagedeck/markdown-loader";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { DocsOptions } from "./index.ts";
import { scanPage, splitAtDemos } from "./page.ts";
import type { BodyPart } from "./page.ts";

/** One docs page, as the collection stores it. */
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

/** The address a page is served at, under the site's trailing-slash policy. */
function hrefOf(options: DocsOptions, file: string): string {
  const parts = segments(entryPath(options.base, file));
  if (parts.at(-1) === "index") parts.pop();
  if (parts.length === 0) return "/";
  const path = `/${parts.join("/")}`;
  return (options.trailingSlash ?? "always") === "always" ? `${path}/` : path;
}

function readNav(root: string): NavFile[] {
  return JSON.parse(readFileSync(join(root, "nav.json"), "utf8")) as NavFile[];
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
    const renderer = await createMarkdownRenderer({
      languages: options.languages,
      ...(options.theme === undefined ? {} : { theme: options.theme }),
    });
    const pages = [];
    for (const page of scanned) {
      const rendered = await renderer.render(page.body, page.file);
      pages.push({
        title: String(page.frontmatter["title"]),
        description: String(page.frontmatter["description"]),
        file: page.file,
        href: hrefOf(options, page.file),
        body: splitAtDemos(rendered.html),
      });
    }

    const contentRoot = contentRootOf(options.from);
    rmSync(contentRoot, { recursive: true, force: true });
    if (existsSync(join(root, "assets"))) {
      cpSync(join(root, "assets"), join(contentRoot, ...segments(options.base), "assets"), { recursive: true });
    }

    const byFile = new Map(pages.map((page) => [page.file, page]));
    const nav = readNav(root).map((group) => ({
      label: group.label,
      pages: group.pages.flatMap((file) => {
        const page = byFile.get(file);
        return page === undefined ? [] : [{ title: page.title, href: page.href }];
      }),
    }));
    const changed = [];
    for (const page of pages) {
      const id = { locale: LOCALE, path: entryPath(options.base, page.file) };
      writer.upsert({ ...id, data: { ...page, nav } });
      changed.push(id);
    }
    return { changed, deleted: [], authoritative: true, cursor: startedAt };
  };
  return { syncAll, syncSince: (writer) => syncAll(writer) };
}
