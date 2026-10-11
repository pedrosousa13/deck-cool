// Code a site shows highlighted at build time: a skin's stylesheet, the
// README's quickstart. It goes through the sites' markdown renderer, so it
// looks the same. That renderer passes raw HTML through. The fence is one
// backtick longer than the code's longest run, so no line of the code can
// close it.
import { createMarkdownRenderer, type MarkdownRendererOptions } from "@pagedeck/markdown-loader";

/** Highlights code in one language and theme: the code in, one `<pre>` out, as Shiki writes it. */
export async function highlighter(language: MarkdownRendererOptions["languages"][number], theme: MarkdownRendererOptions["theme"]) {
  const renderer = await createMarkdownRenderer({ languages: [language], theme });
  return async (code: string, file: string): Promise<string> => {
    const fence = "`".repeat(Math.max(2, ...(code.match(/`+/g) ?? []).map((run) => run.length)) + 1);
    return (await renderer.render(`${fence}${language}\n${code}\n${fence}\n`, file)).html;
  };
}
