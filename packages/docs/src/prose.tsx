/** A stretch of a docs page's rendered markdown. Not an island: it ships no JavaScript. */
export default function DocsProse({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
