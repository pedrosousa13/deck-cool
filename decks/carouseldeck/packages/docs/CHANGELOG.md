# @slidedeck/docs

## 1.3.2

No changes in this release.

## 1.3.1

No changes in this release.

## 1.3.0

No changes in this release.

## 1.2.0

### Minor Changes

- f83bbcb: slidedeck is now carouseldeck. `@slidedeck/core`, `@slidedeck/react` and `@slidedeck/docs` are now `@carouseldeck/core`, `@carouseldeck/react` and `@carouseldeck/docs`, and the version line goes on from `@slidedeck` 1.1.0. Change your imports from `@slidedeck/*` to `@carouseldeck/*`.

  This release breaks CSS that targets the deck's markup. The data attributes are renamed from `data-slidedeck-*` to `data-carouseldeck-*`, such as `data-carouseldeck-slide` and `data-carouseldeck-viewport`. The `<style>` elements the deck renders now use the hrefs `carouseldeck-slide` and `carouseldeck-<effect>` and the precedence `carouseldeck`. Rename these in your selectors. The `--deck-*` custom properties do not change.

  A breaking change is a major. This release is a minor all the same, once, so the version line goes on from slidedeck's.

  `@carouseldeck/react-18` is new: `@carouseldeck/react` built for React 18, with the same components, props and types. On React 18, install it in place of `@carouseldeck/react`.

## 1.1.0

### Patch Changes

- 688999f: The docs pages and the package README read more plainly, with the same facts, headings, code blocks and API.

## 1.0.3

The first release: the docs for `@slidedeck/react` and `@slidedeck/core` 1.0.3, as markdown.
