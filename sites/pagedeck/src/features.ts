import { fileURLToPath } from "node:url";
import { defineScripts } from "@pagedeck/core";
import type {
  FontsSetting,
  Page,
  PageContent,
  PageHead,
  ScriptsSetting,
  SocialImagesSetting,
  EntryNode,
} from "@pagedeck/core";
import { defineImages, imageAttributes, urlTemplate } from "@pagedeck/core/images";
import type { ImagesSetting } from "@pagedeck/core/images";
import { defineFontSubset } from "@pagedeck/font-subset";
import { defineSocialImage } from "@pagedeck/social-image";
import { DOCS_ORIGIN, PATHS } from "../components/links.ts";
import {
  CONSENT_BANNER,
  EMBED_FRAME,
  FONT_SPECIMEN,
  FEATURE_SECTION,
  FEATURES_PAGE,
  ISLAND_IDLE,
  ISLAND_LOAD,
  ISLAND_VISIBLE,
  RESPONSIVE_IMAGE,
  SEARCH,
  SOCIAL_CARD,
  STATIC_PROBE,
} from "./catalog.ts";

// The specimen's face, and the social card's. The site's own type is the
// brand's system stack; this face is subset for the fonts demo alone. Its
// licence is fonts/OFL.txt.
const FIRA_SANS = fileURLToPath(new URL("../fonts/FiraSans-Regular.ttf", import.meta.url));

const EMBED_MOUNT = "embed-demo";

// Plain ASCII where the fonts demo sets it: the face is subset to printable
// ASCII, and anything else would fall back mid-word.
const COPY = {
  title: "Every feature, running on this page",
  description:
    "Everything pagedeck does, each explained in a few sentences and running live: interactive parts that start when you choose, search, embeds that wait for consent, images sized for each screen, a trimmed font, a link preview and more than one language.",
  intro:
    "Each section says what one feature gives you, then runs it right here. The boxes come alive, the search box searches, and the embed waits for your permission. The only JavaScript on this page is the code those demos need.",
  islands: {
    heading: "Interactive when you choose",
    body: [
      'A component you mark "use client" arrives as plain HTML first, then its JavaScript starts so it can respond to you. Developers call that start hydration. You choose when it happens: load starts it right away, idle waits until the browser has nothing else to do, and visible waits until you scroll to it.',
      'Each box shows when it started, counted from the moment the page opened. The last box is the same component without "use client". It ships no JavaScript, so its text never changes.',
    ],
    docs: "Choosing when each component starts",
    waiting: "Plain HTML. Not started yet.",
    hydrated: "Started {seconds} s after the page opened.",
    staticWaiting: "Plain HTML. It ships no JavaScript, so it never starts.",
  },
  search: {
    heading: "Search",
    body: [
      "When pagedeck builds your site, it writes the words of every page into a few small files. The search box downloads nothing until you click into it, then finds pages as you type.",
      'Try "budget", "consent" or "font".',
    ],
    docs: "Site search",
    label: "Search this site",
    emptyLabel: "No page on this site matches that.",
  },
  consent: {
    heading: "Embeds that wait for consent",
    body: [
      "A video, map or chat widget from another company can start tracking your visitors the moment it loads. pagedeck puts a button in its place, and loads the real thing only once the visitor has agreed. In code, that is one script entry with a consent category.",
      "Here the embed is a small script from this site, standing in for another company's, so the demo contacts nobody. The panel is pagedeck's sample consent banner. Press the button first to see it refuse, then accept and press it again.",
    ],
    docs: "Third-party scripts: facades and consent",
    banner: {
      heading: "Consent for this demo",
      body: "The embed below is in the functional category. Your answer is kept in this browser only.",
      acceptLabel: "Accept",
      rejectLabel: "Reject",
      manageLabel: "Change consent",
    },
    frame: "Embed",
    facade:
      '<button type="button" class="fw-embed__load">Load the embed</button><p class="fw-embed__denied">Not granted yet: pressing loads nothing until you accept in the panel above.</p>',
  },
  images: {
    heading: "Images sized for every screen",
    body: [
      "Give pagedeck one picture, and it offers the browser several sizes of it. A phone can download a small file and a large screen a sharp one, and the browser picks.",
      "Each file below has its width drawn on it, so the picture shows which one your browser chose. Widen or narrow the window and reload to see it choose another.",
    ],
    docs: "Images",
    alt: "A drafting grid with the chosen candidate's width drawn on it in large type",
  },
  fonts: {
    heading: "Fonts cut to what you use",
    body: [
      "pagedeck trims a font file down to the characters your pages need, and sets a fallback font sized to match, so the text does not jump when the real font arrives.",
      "This site's own text uses your device's fonts, so this face is here for the sample below and nothing else. Only this page downloads it, and the other pages here never do.",
    ],
    docs: "Fonts",
    sample:
      "Fira Sans, cut down to printable ASCII: 0123456789 and every letter from A to z. A page that sets no text in this face never downloads it.",
  },
  social: {
    heading: "Link previews, drawn for you",
    body: [
      "When someone shares a page in a chat or on social media, the picture in the preview is the page's social card. pagedeck draws one while it builds the site, and names it in the page's head as og:image. This page has one, and the other pages of this site do not.",
      "The image below is this page's card, the same file the og:image tag names. A component can show it because pagedeck draws the cards before it writes the pages.",
    ],
    docs: "Page head: cards the build draws",
    missing:
      "No card here: pagedeck dev draws no cards. Run pagedeck build to see this page's card.",
  },
  i18n: {
    heading: "One site, many languages",
    body: [
      "This site is in one language. pagedeck can publish several from the same project, and each version of a page then points to the others with canonical and hreflang links, so search engines know which version is for which reader.",
    ],
    docs: "Canonicals and hreflang",
  },
} as const;

// This site's own files: a static host cannot resize, so the three widths are
// checked-in WebP files, which is why `format` is `webp`.
const IMAGES: ImagesSetting = defineImages({
  adapter: urlTemplate("/images{src}-{width}.{format}"),
  widths: [320, 640, 1280],
  quality: 80,
  format: "webp",
  sizes: "(min-width: 60rem) 36rem, calc(100vw - 2rem)",
});

const DEMO_IMAGE = { src: "/features/stack", width: 1280, height: 720 };

export const FONTS: FontsSetting = {
  adapter: defineFontSubset(),
  faces: [
    {
      family: "Fira Sans",
      src: FIRA_SANS,
      weight: 400,
      style: "normal",
      display: "swap",
      unicodeRanges: ["U+0020-007E"],
      fallback: ["Helvetica", "Arial", "sans-serif"],
      aboveFold: true,
      pages: [PATHS.features],
    },
  ],
};

const CARD_EYEBROW = "Pagedeck";

const CARD_ALT = `This page's social card: the word ${CARD_EYEBROW} above the headline "${COPY.title}"`;

export const SOCIAL_IMAGES: SocialImagesSetting = {
  adapter: defineSocialImage({
    fonts: [{ family: "Fira Sans", src: FIRA_SANS, weight: 400 }],
  }),
  inputs: (page) =>
    page.path === PATHS.features ? { eyebrow: CARD_EYEBROW } : undefined,
};

// No `build.prePaint`: a facade's trigger is a press, after hydration, and the
// snippet would put inline script on every page, `/` included.
export const SCRIPTS: ScriptsSetting = defineScripts({
  scripts: [
    {
      name: "embed",
      src: "/embed/demo-embed.js",
      strategy: "facade",
      facade: { html: COPY.consent.facade, mount: EMBED_MOUNT },
      category: "functional",
    },
  ],
  pageTypes: { "/**": { embed: "off" } },
  pages: { [`en:${PATHS.features}`]: { embed: "facade" } },
});

export const FEATURES_HEAD: PageHead = {
  title: COPY.title,
  description: COPY.description,
};

/** `path` is a docs page's path, with no leading or trailing slash, then any `#fragment`. */
function docs(path: string, label: string) {
  const [page, fragment] = path.split("#");
  return { href: `${DOCS_ORIGIN}/${page}/${fragment === undefined ? "" : `#${fragment}`}`, label };
}

function section(
  id: string,
  copy: { readonly heading: string; readonly body: readonly string[] },
  link: ReturnType<typeof docs>,
  children: EntryNode[],
): EntryNode {
  return {
    component: FEATURE_SECTION,
    props: {
      id,
      heading: copy.heading,
      body: copy.body,
      docs: link,
    },
    children,
  };
}

// The islands section comes first so `island_load` sits above the fold
// threshold; below it, fold tuning would demote its declared `load` (#24).
export function featuresContent(page: Page): PageContent {
  const probe = (name: string, waiting: string = COPY.islands.waiting) => ({
    copy: { name, waiting, hydrated: COPY.islands.hydrated },
  });
  const image = imageAttributes({ images: IMAGES, image: DEMO_IMAGE, page });
  const candidates = image.srcSet
    .split(", ")
    .map((entry) => entry.split(" ") as [string, string]);
  const formats = [
    ...new Set(candidates.map(([url]) => url.slice(url.lastIndexOf(".") + 1))),
  ];
  return {
    tree: [
      {
        component: FEATURES_PAGE,
        props: { title: COPY.title, intro: COPY.intro },
        children: [
          section(
            "islands",
            COPY.islands,
            docs("reference/fold-strategy", COPY.islands.docs),
            [
              { component: ISLAND_LOAD, props: probe("load") },
              { component: ISLAND_IDLE, props: probe("idle") },
              { component: ISLAND_VISIBLE, props: probe("visible") },
              {
                component: STATIC_PROBE,
                props: probe("static", COPY.islands.staticWaiting),
              },
            ],
          ),
          section(
            "search",
            COPY.search,
            docs("reference/site-search", COPY.search.docs),
            [
              {
                component: SEARCH,
                props: {
                  locale: "en",
                  label: COPY.search.label,
                  emptyLabel: COPY.search.emptyLabel,
                },
              },
            ],
          ),
          section(
            "consent",
            COPY.consent,
            docs("reference/third-party-scripts#facades", COPY.consent.docs),
            [
              { component: CONSENT_BANNER, props: { ...COPY.consent.banner } },
              {
                component: EMBED_FRAME,
                props: { mount: EMBED_MOUNT, label: COPY.consent.frame },
              },
            ],
          ),
          section("images", COPY.images, docs("reference/images", COPY.images.docs), [
            {
              component: RESPONSIVE_IMAGE,
              props: {
                image,
                alt: COPY.images.alt,
                facts: [
                  { label: "srcset", value: candidates.map(([url]) => url).join(", ") },
                  { label: "widths", value: candidates.map(([, width]) => width).join(", ") },
                  { label: "formats", value: formats.join(", ") },
                  { label: "sizes", value: image.sizes },
                  { label: "loading", value: image.loading },
                ],
              },
            },
          ]),
          section("fonts", COPY.fonts, docs("reference/fonts", COPY.fonts.docs), [
            {
              component: FONT_SPECIMEN,
              props: {
                sample: COPY.fonts.sample,
                facts: [
                  { label: "face", value: "Fira Sans 400" },
                  { label: "unicode-range", value: "U+0020-007E" },
                  { label: "fallback", value: "Helvetica, Arial, size-adjusted" },
                ],
              },
            },
          ]),
          section(
            "social-cards",
            COPY.social,
            docs("reference/page-head#cards-the-build-draws", COPY.social.docs),
            [
              {
                component: SOCIAL_CARD,
                props: { alt: CARD_ALT, missing: COPY.social.missing },
              },
            ],
          ),
          section(
            "i18n",
            COPY.i18n,
            docs("reference/canonicals-and-hreflang", COPY.i18n.docs),
            [],
          ),
        ],
      },
    ],
  };
}
