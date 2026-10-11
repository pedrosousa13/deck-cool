// Code a site shows highlighted at build time: a skin's stylesheet, the
// README's quickstart. It goes through the same renderer as the sites'
// markdown, so it looks the same, but that renderer passes raw HTML through.
// So the fence must hold whatever the code says: CommonMark closes a backtick
// fence only at a line of as many backticks or more, and this fence is one
// longer than the code's longest run.
import { createMarkdownRenderer, type MarkdownRendererOptions } from "@pagedeck/markdown-loader";

/** Highlights code in one language and theme: the code in, one `<pre>` out, as Shiki writes it. */
export async function highlighter(language: MarkdownRendererOptions["languages"][number], theme: MarkdownRendererOptions["theme"]) {
  const renderer = await createMarkdownRenderer({ languages: [language], theme });
  return async (code: string, file: string): Promise<string> => {
    const fence = "`".repeat(Math.max(2, ...(code.match(/`+/g) ?? []).map((run) => run.length)) + 1);
    return (await renderer.render(`${fence}${language}\n${code}\n${fence}\n`, file)).html;
  };
}
