import type { PageContent, PageHead } from "@pagedeck/core";
import { CONTENT_PAGE } from "./catalog.ts";

const COPY = {
  title: "Bring all your content. Ship only what the page shows.",
  description:
    "pagedeck reads a whole product entry from a CMS while it builds the site, writes what the page shows as plain HTML, and sends the browser only the few fields the colour and size picker needs.",
  intro:
    "Your CMS, the place your team writes and edits content, can hold far more than any one page shows. This jacket's entry has variants, stock, reviews, SEO fields and private notes. pagedeck read all of it once, while it built this site, and wrote what you see as plain HTML. Your browser received only the few fields the colour and size picker needs. The figures show how much less your browser had to download, which matters most on a phone.",
  figures: {
    read: "Read from the CMS while the site was built: the whole product entry, every field.",
    sent: "Sent to your browser as data: only what the colour and size picker needs.",
  },
  explainer: {
    heading: "What you are looking at",
    body: [
      "pagedeck built this page once, before anyone visited. It read the jacket's whole entry and wrote the description, the specs and the review count into the page as plain HTML. The code that did that ran once, on the computer that built the site, and is never sent to your browser.",
      "The colour and size picker is the one part you can use. It arrives as HTML, then its JavaScript starts so it can respond to you. It receives only what it needs: the product code, the price, and each colour and size with the code the cart uses for it. That is the only product data on this page.",
      "There is no hidden copy of the entry anywhere in the page. Stock by warehouse, barcodes, costs, media, reviews and private notes stayed on the computer that built the site.",
    ],
  },
} as const;

export const CMS_DEMO_HEAD: PageHead = {
  title: COPY.title,
  description: COPY.description,
};

export function cmsDemoContent(): PageContent {
  return {
    tree: [
      {
        component: CONTENT_PAGE,
        props: {
          title: COPY.title,
          intro: COPY.intro,
          figures: COPY.figures,
          explainer: COPY.explainer,
        },
      },
    ],
  };
}
