import { parseFrontmatter } from "@pagedeck/markdown-loader";
import { Marked, Tokenizer } from "marked";
import type { Token, Tokens } from "marked";
import { posix } from "node:path";

/** A problem in the docs package, at the line an editor's gutter shows. */
export interface Fault {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

/** A stretch of a page's body: rendered markdown, or the place a demo goes. */
export type BodyPart = { readonly kind: "html"; readonly html: string } | { readonly kind: "demo"; readonly name: string };

/** What a page's checks need to know about the rest of the package and the site. */
export interface PageContext {
  readonly pages: ReadonlySet<string>;
  /** Whether a file exists in the package, by its path from the package root. */
  readonly exists: (file: string) => boolean;
  readonly hrefOf: (file: string) => string;
  /** The address a package file is published at, such as `/docs/assets/grid.svg`. */
  readonly addressOf: (file: string) => string;
  readonly demos: ReadonlySet<string>;
}

export interface ScannedPage {
  readonly file: string;
  /** Empty when missing, which is a fault. */
  readonly title: string;
  readonly description: string;
  /** What the nav names the page: its optional `label`, or else its title. */
  readonly label: string;
  /** The body with every relative link and image pointed at its address on the site. */
  readonly body: string;
  readonly faults: readonly Fault[];
}

const MARKER = /^<!-- demo:([A-Za-z0-9_-]+) -->$/;
const MARKER_START = /<!--\s*demo:/;
const MARKER_IN_HTML = /<!-- demo:([A-Za-z0-9_-]+) -->/;
const NOT_RELATIVE = /^(?:[a-z][a-z0-9+.-]*:|\/|#|$)/i;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const ALLOWED_SCHEMES = new Set(["http", "https", "mailto"]);

type Found =
  | { readonly kind: "html"; readonly raw: string; readonly block: boolean }
  | { readonly kind: "link" | "image" | "def"; readonly raw: string; readonly href: string };

/** marked's `Token` union holds a generic member, so a check on `type` alone does not narrow it. */
function found(token: Token): Found | undefined {
  if (token.type === "html") return { kind: "html", raw: token.raw, block: "block" in token && token.block === true };
  if (token.type !== "link" && token.type !== "image" && token.type !== "def") return undefined;
  if (!("href" in token) || typeof token.href !== "string") return undefined;
  return { kind: token.type, raw: token.raw, href: token.href };
}

/**
 * Where `raw` is in the body, from `from` on. Inside a block quote or a list, marked strips each
 * line's `>` and indent from a token's text, so a line break in `raw` matches one in the body
 * followed by any of those.
 */
function locate(body: string, raw: string, from: number): { at: number; text: string } | undefined {
  // marked can end a token's text with line breaks the body does not have there.
  const pattern = raw
    .trimEnd()
    .split("\n")
    .map((line) => line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\n[ \\t>]*");
  const search = new RegExp(pattern, "g");
  search.lastIndex = from;
  const match = search.exec(body);
  return match === null ? undefined : { at: match.index, text: match[0] };
}

interface Rewrite {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** Splits `path#fragment`, keeping the `#`. */
function splitFragment(href: string): [string, string] {
  const at = href.indexOf("#");
  return at === -1 ? [href, ""] : [href.slice(0, at), href.slice(at)];
}

/** The URL that reaches `address` from the page served at `href`, as a browser resolves it. */
function relativeUrl(href: string, address: string): string {
  return posix.relative(href.slice(0, href.lastIndexOf("/") + 1), address);
}

/**
 * Checks one page against the contract, and points its relative links and images at
 * their addresses on the site. The rewrite is made in the markdown, so the page renders
 * through Pagedeck's own renderer like any other.
 */
export function scanPage(file: string, text: string, context: PageContext): ScannedPage {
  // marked reads CR and CRLF as LF, so a token's text is found in the body only once the body
  // has LF line ends too. The page renders from this body as well.
  const source = text.replace(/\r\n?/g, "\n");
  const { frontmatter, body } = parseFrontmatter(source, file);
  const faults: Fault[] = [];
  const rewrites: Rewrite[] = [];
  // The body's first line is this line of the file.
  const firstLine = source.split("\n").length - body.split("\n").length + 1;
  const lineAt = (offset: number) => firstLine + (body.slice(0, offset).match(/\n/g)?.length ?? 0);
  const fault = (offset: number, message: string) => faults.push({ file, line: lineAt(offset), message });
  const href = context.hrefOf(file);
  const required = (field: "title" | "description", example: string): string => {
    const value = frontmatter[field];
    if (typeof value === "string" && value.trim() !== "") return value;
    faults.push({ file, line: 1, message: `has no "${field}" in its frontmatter — add ${field}: ${example} to its frontmatter` });
    return "";
  };
  const title = required("title", "<the page's title>");
  const description = required("description", "<one sentence on the page>");
  const label = typeof frontmatter.label === "string" && frontmatter.label.trim() !== "" ? frontmatter.label : title;

  // marked keeps a label's first definition and drops the rest without a token, so every
  // definition is recorded as it is read.
  const definitions: Tokens.Def[] = [];
  const marked = new Marked({
    tokenizer: {
      def(this: Tokenizer, src: string) {
        const definition = Tokenizer.prototype.def.call(this, src);
        if (definition) definitions.push(definition);
        return false;
      },
    },
  });
  let offset = 0;
  for (const block of marked.lexer(body)) {
    // Each token is found in the body after the one before it, so a link is placed
    // at its own line and not at an earlier one with the same text.
    let cursor = offset;
    marked.walkTokens([block], (walked: Token) => {
      const token = found(walked);
      if (token === undefined) return;
      const located = locate(body, token.raw, cursor);
      if (located === undefined) {
        // A token that is not in the body as written is refused, not left unchecked.
        const what = token.kind === "html" ? "HTML" : token.kind === "image" ? "an image" : "a link";
        fault(offset, `has ${what} the loader cannot find in the file, ${token.raw.trim().split("\n")[0] ?? ""} — write it on lines of its own, outside any block quote or list`);
        return;
      }
      const { at, text } = located;
      // A link's text and an image's alt hold tokens of their own, which come next.
      cursor = token.kind === "link" || token.kind === "image" ? at + 1 : at + text.length;

      if (token.kind === "html") {
        if (!MARKER_START.test(token.raw)) {
          const html = token.raw.trim().split("\n")[0] ?? "";
          fault(at, `has raw HTML, ${html} — write it in markdown: the only HTML a page may hold is a demo marker, <!-- demo:<name> -->`);
          return;
        }
        const name = MARKER.exec(token.raw.trim())?.[1];
        if (!token.block || name === undefined) {
          fault(at, "has a demo marker that is not on a line of its own — write it alone on its line, as <!-- demo:<name> -->");
        } else if (!context.demos.has(name)) {
          const known = [...context.demos].sort().map((demo) => `"${demo}"`).join(", ");
          const fix =
            known === ""
              ? `the site registers no demos; remove the marker, or have the site register "${name}"`
              : `use a demo the site registers (${known}), or have the site register "${name}"`;
          fault(at, `marks demo "${name}", which the site does not register — ${fix}`);
        }
        return;
      }

      // A reference-style link's destination is on its definition, which is checked there.
      if (token.kind === "link" && token.raw.startsWith("[") && !token.raw.includes("](")) return;
      if (token.href.includes("&")) {
        fault(at, `links to "${token.href}", which holds a character reference — write the path or URL with no "&": the character itself, or percent-encoded (%26 for &)`);
        return;
      }
      if (/^[/\\]{2}/.test(token.href)) {
        fault(at, `links to "${token.href}", which names no scheme — link to another host with https:, or to a page by its .md file`);
        return;
      }
      const scheme = SCHEME.exec(token.href)?.[1];
      if (scheme !== undefined && !ALLOWED_SCHEMES.has(scheme.toLowerCase())) {
        fault(at, `links to "${token.href}", a scheme the site does not allow — link with http:, https: or mailto:, or to a page by its .md file`);
        return;
      }
      if (NOT_RELATIVE.test(token.href)) return;
      const [path, fragment] = splitFragment(token.href);
      const target = posix.join(posix.dirname(file), path);

      let replacement: string;
      if (token.kind === "image") {
        if (!target.startsWith("assets/") || !context.exists(target)) {
          fault(at, `shows "${token.href}", which is not a file under assets/ — add it under assets/, or fix the path`);
          return;
        }
        replacement = relativeUrl(href, context.addressOf(target)) + fragment;
      } else if (!target.endsWith(".md")) {
        fault(at, `links to "${token.href}", which is not a .md page — link a page by its .md file, and show a file under assets/ as an image`);
        return;
      } else if (!context.pages.has(target)) {
        fault(at, `links to "${token.href}", which is not a page in this package — fix the link, or add the page`);
        return;
      } else {
        replacement = context.hrefOf(target) + fragment;
      }

      const destination = text.indexOf(token.href, text.indexOf(token.kind === "def" ? "]:" : "]("));
      if (destination === -1) {
        fault(at, `links to "${token.href}" in a form the loader cannot rewrite — write the path plainly, with no backslash escapes or character references`);
        return;
      }
      rewrites.push({ start: at + destination, end: at + destination + token.href.length, text: replacement });
    });
    offset += block.raw.length;
  }

  const labels = new Set<string>();
  let definitionCursor = 0;
  for (const definition of definitions) {
    const located = locate(body, definition.raw, definitionCursor);
    if (located !== undefined) definitionCursor = located.at + located.text.length;
    if (labels.has(definition.tag)) {
      fault(located?.at ?? 0, `defines [${definition.tag}] a second time — give each definition its own label`);
    }
    labels.add(definition.tag);
  }

  let rewritten = body;
  for (const { start, end, text } of rewrites.sort((a, b) => b.start - a.start)) {
    rewritten = rewritten.slice(0, start) + text + rewritten.slice(end);
  }
  return { file, title, description, label, body: rewritten, faults };
}

/** Cuts rendered HTML at each demo marker. A marker in a code block is escaped, so it is not cut. */
export function splitAtDemos(html: string): BodyPart[] {
  const parts: BodyPart[] = [];
  let rest = html;
  for (let match = MARKER_IN_HTML.exec(rest); match !== null; match = MARKER_IN_HTML.exec(rest)) {
    const before = rest.slice(0, match.index);
    if (before.trim() !== "") parts.push({ kind: "html", html: before });
    parts.push({ kind: "demo", name: match[1] ?? "" });
    rest = rest.slice(match.index + match[0].length).replace(/^\n/, "");
  }
  if (rest.trim() !== "") parts.push({ kind: "html", html: rest });
  return parts;
}
