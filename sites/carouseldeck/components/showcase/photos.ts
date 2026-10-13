// The examples' photos: Unsplash photos, by way of Lorem Picsum, cropped and
// saved as WebP at the size they are shown, in public/photos. Each is credited
// on /examples/ with a link to its page on Unsplash.

export interface Photo {
  src: string;
  /** The file's own pixel size, so the browser reserves its box. */
  width: number;
  height: number;
  alt: string;
  author: string;
  /** The photo's page on Unsplash. */
  url: string;
  /** What it shows, in English, for the credits. */
  subject: string;
}

const photo = (
  name: string,
  width: number,
  height: number,
  alt: string,
  author: string,
  id: string,
  subject: string
): Photo => ({
  src: `/photos/${name}.webp`,
  width,
  height,
  alt,
  author,
  url: `https://unsplash.com/photos/${id}`,
  subject
});

const HEELS = ["Alejandro Escamilla", "jVb0mSn0LbE", "Heels"] as const;
const CARRY = ["Vadim Sherbakov", "tCICLJ5ktBE", "Everyday carry"] as const;
const MUG = ["Shyamanta Baruah", "aeVA-j1y2BY", "Stamp mug"] as const;
const COFFEE = ["Justin Leibow", "ZJsseAxEcqM", "Coffee on red"] as const;
const FOREST = ["Paul Jarvis", "6J--NXulQCs", "Forest and sound"] as const;
const VALLEY = ["Paul Jarvis", "Cm7oKel-X2Q", "Valley"] as const;
const WATERFALL = ["Paul Jarvis", "NYDo21ssGao", "Waterfall"] as const;
const BAY = ["Paul Jarvis", "gkT4FfgHO5o", "Bay"] as const;
const PEAKS = ["Go Wild", "V0yAek6BgGk", "Peaks"] as const;
const STREET = ["Nicholas Swanson", "SyBYM8R6VU4", "Street"] as const;
const GRAPES = ["Jassy Onyae", "1gBUXhf0PtA", "Grapes"] as const;
const TRAIL = ["Dorothy Lin", "TIr6EwYMRUM", "Mountain trail"] as const;
const FORKS = ["Alejandro Escamilla", "8yqds_91OLw", "Forks"] as const;

export const PRODUCTS = {
  heels: photo(
    "heels",
    1200,
    800,
    "White leather heels on a red wooden floor",
    ...HEELS
  ),
  carry: photo(
    "carry",
    1200,
    800,
    "A wallet, sunglasses, a watch and headphones laid out on grey",
    ...CARRY
  ),
  mug: photo(
    "mug",
    1200,
    800,
    "A red and white mug printed with a postage stamp",
    ...MUG
  ),
  coffee: photo(
    "coffee",
    1200,
    800,
    "A cup of coffee from above, on red",
    ...COFFEE
  )
};

export const THUMBS = {
  heels: photo("heels-thumb", 144, 96, "", ...HEELS),
  carry: photo("carry-thumb", 144, 96, "", ...CARRY),
  mug: photo("mug-thumb", 144, 96, "", ...MUG),
  coffee: photo("coffee-thumb", 144, 96, "", ...COFFEE)
};

export const SCENES = {
  forest: photo(
    "forest",
    1440,
    720,
    "Pine forest above a blue sound",
    ...FOREST
  ),
  peaks: photo("peaks", 1440, 720, "Snow on a range of high peaks", ...PEAKS),
  bay: photo("bay", 1440, 720, "Driftwood and rocks on a calm bay", ...BAY)
};

export const STORIES = {
  street: photo(
    "street",
    720,
    1280,
    "A cobbled street between brick buildings",
    ...STREET
  ),
  grapes: photo("grapes", 720, 1280, "Dark grapes on the vine", ...GRAPES),
  trail: photo(
    "trail",
    720,
    1280,
    "A trail winding up a mountainside",
    ...TRAIL
  ),
  forks: photo("forks", 720, 1280, "Three forks in soft light", ...FORKS)
};

// Their alt text is Arabic, as the deck they are in is.
export const PLACES = {
  valley: photo("valley", 640, 800, "وادٍ أخضر بين الجبال", ...VALLEY),
  waterfall: photo("waterfall", 640, 800, "شلال بين الصخور", ...WATERFALL),
  summit: photo("summit", 640, 800, "جبال مغطاة بالثلوج", ...PEAKS),
  shore: photo("shore", 640, 800, "صخور على شاطئ البحر", ...BAY),
  pines: photo("pines", 640, 800, "غابة قرب البحر", ...FOREST)
};

// The same photos with English alt text, for the card stack.
export const VIEWS = {
  valley: photo("valley", 640, 800, "A green valley between mountains", ...VALLEY),
  waterfall: photo("waterfall", 640, 800, "A waterfall between rocks", ...WATERFALL),
  summit: photo("summit", 640, 800, "Snow-covered mountains", ...PEAKS),
  shore: photo("shore", 640, 800, "Rocks on a sea shore", ...BAY),
  pines: photo("pines", 640, 800, "A forest by the sea", ...FOREST)
};

/** Every photo, once each by its page on Unsplash, for the credits. */
export const CREDITS: readonly Photo[] = [
  ...new Map(
    [
      ...Object.values(PRODUCTS),
      ...Object.values(SCENES),
      ...Object.values(STORIES),
      ...Object.values(PLACES),
      ...Object.values(VIEWS)
    ].map((photo) => [photo.url, photo])
  ).values()
];
