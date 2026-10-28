import { drawerdeck } from "./drawerdeck.ts";

const { icons } = drawerdeck;

interface Props {
  /** The page's address on the production origin, as its canonical. */
  url: string;
}

/**
 * What every page's <head> carries that build.head has no field for: the
 * viewport, the icons and the Open Graph tags. Rendered by build.chrome;
 * Pagedeck moves each tag into the <head>. It ships no JavaScript.
 */
export default function PageMeta({ url }: Props) {
  return (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="icon" type="image/svg+xml" href={icons.still} />
      <link rel="apple-touch-icon" href={icons.appleTouch} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="drawerdeck" />
    </>
  );
}
