import { umbrella } from "@deck-cool/brand/decks";

interface Props {
  title: string;
  html: string;
}

export default function Layout({ title, html }: Props) {
  return (
    <>
      <title>{title}</title>
      {/* Pagedeck 0.2.1 hoists only <title> and <meta> into <head>, and
          compiles build.css only on a site with an island, so these links
          land at the start of <main> until they can move to <head> (#21).
          brand.css is linked before the Family bar, in build.chrome. */}
      <link rel="icon" type="image/svg+xml" href={umbrella.icons.still} />
      <link rel="apple-touch-icon" href={umbrella.icons.appleTouch} />
      <article>
        <h1>{title}</h1>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </>
  );
}
