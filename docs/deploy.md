# Deploying deck.cool and its package sites

The umbrella site (`sites/deck-cool`) is served at `https://deck.cool` by **Workers Static Assets**, the way pagedeck deploys its landing page. One `wrangler deploy` uploads the built `site/` and publishes a Worker named `deck-cool` that serves it. The Worker has no code of its own.

wrangler is `sites/deck-cool`'s exact-version dev dependency. Run it as `pnpm exec wrangler` in `sites/deck-cool`, never as `npx wrangler`, which takes whatever version is latest.


slidedeck's site (`sites/slidedeck`), pagedeck's (`sites/pagedeck`) and playdeck's (`sites/playdeck`) deploy the same way, each to its own Worker, at `https://slide.deck.cool`, `https://page.deck.cool` and `https://play.deck.cool`. Everything below describes deck.cool; [slidedeck at slide.deck.cool](#slidedeck-at-slidedeckcool), [pagedeck at page.deck.cool](#pagedeck-at-pagedeckcool) and [playdeck at play.deck.cool](#playdeck-at-playdeckcool) list what differs.
## What gets deployed

`sites/deck-cool/wrangler.jsonc` declares the Worker:

- `assets.directory` is `./site`, the build output.
- One route, `{ "pattern": "deck.cool", "custom_domain": true }`. Cloudflare creates the DNS record and the certificate for it.
- `workers_dev` is `false`, so the site has one address.
- `html_handling` is `auto-trailing-slash`, and `not_found_handling` is `none`: the site declares no 404 page, so a missing path answers a bare `404`.
- `account_id` is the account's ID. It is not a secret.

`pagedeck build` writes three files that wrangler reads as configuration and does not upload:

- `_headers`: a `/*` rule and an `/assets/*` rule. Every page and file gets the CSP from `src/csp.ts`, then `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and `Strict-Transport-Security: max-age=31536000; includeSubDomains`, all from `src/headers.ts`, which takes every field but the CSP from `packages/site-kit`. Files under `/assets/` also get `Cache-Control: public, max-age=31536000, immutable`.
- `_redirects`: three rows that proxy `/manifest.json`, `/.pagedeck` and `/.pagedeck/*` to `/404.html`.
- `.assetsignore`, from `packages/brand/public/` through passthrough. It keeps `/manifest.json`, `/.pagedeck` and `/404.html` out of the upload. Because `/404.html` is not uploaded, the proxy rows answer `404`.

**Only `/assets/` is cached as `immutable`.** The build compiles the stylesheets in `build.css` into one sheet, `/assets/fw-core-<hash>.css`, named by its content's hash, so a changed sheet gets a new URL. Every other file keeps its name from build to build, the icons under `/icons/` among them, so it gets Cloudflare's default `Cache-Control`. If a build writes a hashed name outside `/assets/`, add a header rule for its directory in `pagedeck.config.ts`. `site.build.test.ts` fails until you do.

## Setting up

Once, in the Cloudflare account that holds the `deck.cool` zone.

### The API token

Create an **account-owned** token named `deck-cool-deploy`: Manage Account → Account API Tokens → Create Token. It has two permission policies and nothing else. This token deployed the site from CI on 2026-10-09.

| Policy | Resource | Permission | Why |
| --- | --- | --- | --- |
| 1 | Entire account | Workers → **Editor** | Deploys new versions and rolls back. It can't create or delete a Worker. Keep it at the Workers product scope: Cloudflare doesn't support per-Worker roles for custom domains yet. |
| 2 | the `deck.cool` zone | **Workers Routes Write** | Each deploy sends the Worker's custom domain for that zone. |

The permission search shows only the permissions for the policy's resource type. **Workers Routes Write** is a zone permission, so it appears only in a policy whose resource is the `deck.cool` zone.

The `deck-cool` Worker already exists; the first deploy created it on 2026-10-09 from a `wrangler login` session. Creating a new Worker needs Workers → **Admin**, so give a token Admin only for that one-off, then take it away.

If a deploy is refused with an authorization error, add only the permission that the error names.

### The zone settings

`wrangler deploy` sets only the Worker and its custom domain. The site also relies on this setting of the `deck.cool` zone, which you set once:

- **Always Use HTTPS** on: SSL/TLS → Edge Certificates → Always Use HTTPS, or the zone setting `always_use_https` set to `on` through the API. Cloudflare then answers every `http://` request on the zone, `*.deck.cool` included, with a `301` to the same URL over `https://`, before the Worker runs. Browsers ignore `Strict-Transport-Security` on a plain-HTTP response, so without the redirect a first visit over `http://` gets the page in cleartext. It was turned on 2026-10-09.

To check it:

```sh
curl -sI http://deck.cool/   # HTTP/1.1 301 Moved Permanently, Location: https://deck.cool/
```

`check-live` fails if the setting is off.

### The secret

Add the token as `CLOUDFLARE_API_TOKEN`, a secret of the repository's `production` environment, not a repository secret:

```sh
gh secret set CLOUDFLARE_API_TOKEN --env production -R pedrosousa13/deck-cool
```

`gh` reads the value from standard input when you paste it, so the value is not on a command line. The `production` environment's deployment branch policy allows `main` only, so no other branch's run can read the secret. In the workflow, only the publish job uses the environment, and only its publish step reads the secret.

## Deploying

`.github/workflows/deploy-deck-cool.yml` builds the site from the checked-out commit and then:

- on every push, and on a manual run without `apply`, runs `wrangler deploy --dry-run` in the `dry-run` job. The dry run uses no environment and no credential, and sends nothing to Cloudflare.
- on a manual run on `main` with `apply`, builds the site in the `build` job, which has no environment and no secret, and uploads `site/` as an artifact. The `publish` job, in the `production` environment, downloads that `site/`, runs `wrangler deploy`, then `pnpm check-live` against `https://deck.cool`, retrying for up to five minutes while a new custom domain gets its certificate. `pnpm build` runs dependency code, so it never runs in the job that holds `CLOUDFLARE_API_TOKEN`.

```sh
gh workflow run deploy-deck-cool.yml -R pedrosousa13/deck-cool --ref main               # dry run
gh workflow run deploy-deck-cool.yml -R pedrosousa13/deck-cool --ref main -f apply=true # publish
gh run watch -R pedrosousa13/deck-cool
```

A run with `apply` on any branch but `main`, or with no secret in `production`, fails, says so, and publishes nothing.

Before the first deploy, check the zone's DNS records. The zone had none on 2026-10-09; check again. A custom domain cannot be created on a hostname that already has a CNAME record, and the custom domain creates its own record for `deck.cool`. Write down any record it would replace.

To deploy from your machine instead, after `pnpm install` at the repository root:

```sh
cd sites/deck-cool
pnpm build
pnpm exec wrangler deploy --dry-run   # lists the upload; sends nothing
CLOUDFLARE_API_TOKEN=... pnpm exec wrangler deploy
```

## Verifying

The publishing run checks the live site itself. To check it by hand:

```sh
pnpm --filter @sites/deck-cool check-live                      # https://deck.cool
pnpm --filter @sites/deck-cool check-live https://example.com  # any other origin
```

`check-live` fetches `/` and `/icons/deck-cool/still.svg` and fails unless each answers `200` with every header in `src/headers.ts`, at its exact value, and no `immutable`. It then fetches the hashed stylesheet `/` links, and fails unless it answers `200` with the same headers and `Cache-Control: public, max-age=31536000, immutable`. It also fails unless `/manifest.json` answers `404`, and unless `http://<host>/` answers `301` with `Location` set to the same path over `https://`, which is the zone's Always Use HTTPS. It is not part of `pnpm test`, which stays offline. `src/live-check.test.ts` runs the same checks against the build served locally.

The checks themselves are in `packages/site-kit/src/live-check.ts`, which every site shares, and its test runs each against a local host that fails it. A site's `src/live-check.ts` lists only what its check fetches: the paths that must answer `200`, the hashed stylesheets, and the paths that must answer `404`.

For a quick look with curl:

```sh
curl -sI https://deck.cool/
curl -sI https://deck.cool/manifest.json   # 404
curl -sI http://deck.cool/                  # 301 to https://deck.cool/
```

## Rolling back

Each `wrangler deploy` makes a new version of the Worker, with its assets, and Cloudflare keeps the earlier ones. From `sites/deck-cool`, with the token in `CLOUDFLARE_API_TOKEN` (or after `pnpm exec wrangler login`):

```sh
pnpm exec wrangler deployments list        # what was deployed, newest first
pnpm exec wrangler rollback                # back to the version before the live one
pnpm exec wrangler rollback <version id>   # back to a named version
```

The dashboard does the same: Workers & Pages → `deck-cool` → Deployments.

A rollback publishes an earlier version as it was. The next run with `apply` deploys the checked-out commit again, so revert the change on `main` first if the rollback should stay.

**A rollback does not take back HSTS.** Once a browser has seen `Strict-Transport-Security` with `includeSubDomains`, it refuses plain HTTP to `deck.cool` and to every subdomain for a year. Every package site serves HTTPS on Cloudflare, so this costs nothing today, but never put a subdomain of deck.cool on a host without HTTPS.

## Taking the site off the domain

Remove the custom domain from the Worker (Workers & Pages → `deck-cool` → Settings → Domains & Routes). That deletes the DNS record Cloudflare created for it. Recreate the records you wrote down before the first deploy. Then take the route out of `wrangler.jsonc`, so the next deploy does not add it again.

## slidedeck at slide.deck.cool

`sites/slidedeck` is served at `https://slide.deck.cool` by a second Worker, `slidedeck`, on the same `deck.cool` zone. It replaces the Pages project `slidedeck` at `slidedeck.pages.dev`. There are no users yet, so `slidedeck.pages.dev` gets no redirect: the Pages project is deleted.

Every section above applies, with these differences:

- **The config.** `sites/slidedeck/wrangler.jsonc` declares the Worker `slidedeck`, with the route `{ "pattern": "slide.deck.cool", "custom_domain": true }`. The other settings are the same as deck.cool's. wrangler is `sites/slidedeck`'s exact-version dev dependency, at the same version as deck.cool's.
- **The build.** `_headers` gets its CSP from `sites/slidedeck/src/csp.ts` and the other headers from `sites/slidedeck/src/headers.ts`, the same fields as deck.cool's. The pages' scripts and the stylesheet are content-hashed under `/assets/`, so they are `immutable`. `_redirects` and `.assetsignore` are the same as deck.cool's.
- **The workflow.** `.github/workflows/deploy-slidedeck.yml` has the same three jobs as `deploy-deck-cool.yml`. A push runs its dry run only when it changes `sites/slidedeck/`, `packages/`, the root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` or the workflow itself. A manual run always runs.
- **The token and the secret.** The publish job uses the same `CLOUDFLARE_API_TOKEN` in the `production` environment. Workers Editor is account-wide, and Workers Routes Write covers every hostname on the `deck.cool` zone, so the token deploys this Worker too.
- **The zone.** Always Use HTTPS is a zone setting, so it already covers `slide.deck.cool`. deck.cool's HSTS has `includeSubDomains`, and slidedeck's `_headers` sends the same HSTS.

### The first deploy

The `slidedeck` Worker does not exist yet (checked 2026-10-09), and Workers Editor can't create a Worker. Do the first deploy one of two ways:

- From your machine, after `pnpm exec wrangler login`. This is how deck.cool's Worker was created.
- From CI, after you give the token Workers → **Admin** for that one run. Take Admin away when the run is done.

Before the first deploy, check the zone's DNS records for `slide.deck.cool`. There were none on 2026-10-09, and the Pages project had no custom domain. The custom domain creates its own record, and it cannot be created on a hostname that already has a CNAME record.

```sh
gh workflow run deploy-slidedeck.yml -R pedrosousa13/deck-cool --ref main               # dry run
gh workflow run deploy-slidedeck.yml -R pedrosousa13/deck-cool --ref main -f apply=true # publish
gh run watch -R pedrosousa13/deck-cool
```

From your machine instead:

```sh
cd sites/slidedeck
pnpm build
pnpm exec wrangler deploy --dry-run   # lists the upload; sends nothing
CLOUDFLARE_API_TOKEN=... pnpm exec wrangler deploy
```

### Verifying slidedeck

```sh
pnpm --filter @sites/slidedeck check-live                      # https://slide.deck.cool
pnpm --filter @sites/slidedeck check-live https://example.com  # any other origin
```

`check-live` fetches `/`, `/examples/` and `/icons/slidedeck/still.svg`, and fails unless each answers `200` with every header in `sites/slidedeck/src/headers.ts`, at its exact value, and no `immutable`. The CSP, and `Strict-Transport-Security: max-age=31536000; includeSubDomains`, are among those headers. It then checks the hashed stylesheet that `/` links, as deck.cool's check does. It fails unless `/manifest.json` and `/no-such-page/` answer `404`, and unless `http://slide.deck.cool/` answers `301` to `https://slide.deck.cool/`. `sites/slidedeck/src/live-check.test.ts` runs the same checks against the build served locally.

`src/live-check.ts` lists this site's paths. The checks are site-kit's, as deck.cool's are.

Rolling back, and taking the site off the domain, are the same as for deck.cool, with the Worker `slidedeck` in `sites/slidedeck`.

### Retiring the Pages project

Delete the Pages project `slidedeck` only after a run with `apply` has published the site and `check-live` passes against `https://slide.deck.cool`. A deletion can't be undone, so the maintainer confirms it first.

The CI token has no Pages permission, so delete the project through the Cloudflare API with a credential that has Pages → Edit on the account (in an agent session, the `cloudflare-api` MCP):

```sh
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  https://api.cloudflare.com/client/v4/accounts/c0bf36f52ec4652dabdacd6538b54983/pages/projects/slidedeck
```

Or the dashboard: Workers & Pages → `slidedeck` (Pages) → Settings → Delete project. Then check that `slidedeck.pages.dev` no longer answers:

```sh
curl -sI https://slidedeck.pages.dev/   # no 200
```

## pagedeck at page.deck.cool

`sites/pagedeck` is served at `https://page.deck.cool` by a third Worker, `pagedeck`, on the same `deck.cool` zone. It takes over from the landing page at `pagedeck-landing.pedrodsousa.workers.dev`. Until #53 brings the docs to `/docs`, the site's docs links go to pagedeck's docs at `https://pagedeck-docs.pedrodsousa.workers.dev` (`DOCS_ORIGIN` in `sites/pagedeck/components/links.ts`).

Every section above applies, with these differences:

- **The config.** `sites/pagedeck/wrangler.jsonc` declares the Worker `pagedeck`, with the route `{ "pattern": "page.deck.cool", "custom_domain": true }`. The other settings are the same as deck.cool's. wrangler is `sites/pagedeck`'s exact-version dev dependency, at the same version as deck.cool's.
- **The build.** `_headers` gets its CSP from `sites/pagedeck/src/csp.ts` and the other headers from `sites/pagedeck/src/headers.ts`, the same fields as deck.cool's. Three directories are content-hashed, so they are `immutable`: `/assets/` (the stylesheet and the islands' scripts), `/fonts/` (the subset font and its sheet) and `/social/` (the features page's social card). `_redirects` and `.assetsignore` are the same as deck.cool's.
- **The workflow.** `.github/workflows/deploy-pagedeck.yml` has the same three jobs as `deploy-deck-cool.yml`. A push runs its dry run only when it changes `sites/pagedeck/`, `packages/`, the root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` or the workflow itself. A manual run always runs.
- **The token and the secret.** The publish job uses the same `CLOUDFLARE_API_TOKEN` in the `production` environment. Workers Editor is account-wide, and Workers Routes Write covers every hostname on the `deck.cool` zone, so the token deploys this Worker too.
- **The zone.** Always Use HTTPS is a zone setting, so it already covers `page.deck.cool`. deck.cool's HSTS has `includeSubDomains`, and pagedeck's `_headers` sends the same HSTS, so the two never disagree.

### The first deploy

The `pagedeck` Worker exists: it was created empty through the Cloudflare API on 2026-10-09, so Workers Editor can deploy to it and the first deploy needs no Admin. Run it from CI.

Before the first deploy, check the zone's DNS records for `page.deck.cool`. The custom domain creates its own record, and it cannot be created on a hostname that already has a CNAME record.

```sh
gh workflow run deploy-pagedeck.yml -R pedrosousa13/deck-cool --ref main               # dry run
gh workflow run deploy-pagedeck.yml -R pedrosousa13/deck-cool --ref main -f apply=true # publish
gh run watch -R pedrosousa13/deck-cool
```

From your machine instead:

```sh
cd sites/pagedeck
pnpm build
pnpm exec wrangler deploy --dry-run   # lists the upload; sends nothing
CLOUDFLARE_API_TOKEN=... pnpm exec wrangler deploy
```

### Verifying pagedeck

```sh
pnpm --filter @sites/pagedeck check-live                      # https://page.deck.cool
pnpm --filter @sites/pagedeck check-live https://example.com  # any other origin
```

`check-live` fetches `/`, `/interactive/`, `/features/`, `/content/`, `/docs/search/` and `/embed/demo-embed.js`, and fails unless each answers `200` with every header in `sites/pagedeck/src/headers.ts`, at its exact value, and no `immutable`. The CSP, and `Strict-Transport-Security: max-age=31536000; includeSubDomains`, are among those headers. It then checks two hashed stylesheets, the one `/` links under `/assets/` and the font sheet `/features/` links under `/fonts/`: each must answer `200` with the same headers and `Cache-Control: public, max-age=31536000, immutable`. It fails unless `/manifest.json` and `/no-such-page/` answer `404`, and unless `http://page.deck.cool/` answers `301` to `https://page.deck.cool/`. `sites/pagedeck/src/live-check.test.ts` runs the same checks against the build served locally.

`src/live-check.ts` lists this site's paths and its two stylesheets. The checks are site-kit's, as deck.cool's are.

Rolling back, and taking the site off the domain, are the same as for deck.cool, with the Worker `pagedeck` in `sites/pagedeck`.

### Host behaviour that is accepted

Two things Cloudflare does on the zone are known, and the maintainer accepted both on 2026-10-09 (#3). A later sweep should not flag them again.

- **NEL stays on.** Cloudflare adds `nel` and `report-to` headers, so a reader's browser can report network failures to `a.nel.cloudflare.com`. That report is the one request to another origin the site can cause, and no check in this repo sees it.
- **Cloudflare's managed robots.txt stays.** `/robots.txt` answers `200` with Cloudflare's managed file, which is not in the build. The site ships no `robots.txt` of its own.

### The old Workers stay up

`pagedeck-landing` and `pagedeck-docs` keep running. `pagedeck-docs` serves the docs that this site links to. Both retire in #53 or pedrosousa13/pagedeck#124, once `/docs` is served here. Delete neither before then: a deletion can't be undone, so the maintainer confirms each one first.

## playdeck at play.deck.cool

`sites/playdeck` is served at `https://play.deck.cool` by a fourth Worker, `play-deck-cool`, on the same `deck.cool` zone. Every page names its own path on `https://play.deck.cool` as canonical, as `CONTEXT.md` says.

**playdeck.video redirects here after #52.** `playdeck.video` is still served by the Worker `playdeck`, which pedrosousa13/playdeck's `deploy-site.yml` deploys. It also serves playdeck's docs, so it stays up until #52 moves them to `/docs`. Then #65 adds a 301 redirect from `playdeck.video` to `play.deck.cool`, which must match `http://` too, and retires that Worker. Until then, this repo does not touch that Worker, that zone or that workflow.

Every section above applies, with these differences:

- **The config.** `sites/playdeck/wrangler.jsonc` declares the Worker `play-deck-cool`, with the route `{ "pattern": "play.deck.cool", "custom_domain": true }`. The other settings are the same as deck.cool's. wrangler is `sites/playdeck`'s exact-version dev dependency, at the same version as deck.cool's.
- **The build.** `_headers` gets its CSP from `sites/playdeck/src/csp.ts` and the other headers from `sites/playdeck/src/headers.ts`, the same fields as deck.cool's, except that `Permissions-Policy` allows `fullscreen=(self)` for the players. The pages' scripts and the stylesheet are content-hashed under `/assets/`, so they are `immutable`. `_redirects` and `.assetsignore` are the same as deck.cool's.
- **The workflow.** `.github/workflows/deploy-playdeck.yml` has the same three jobs as `deploy-deck-cool.yml`. A push runs its dry run only when it changes `sites/playdeck/`, `packages/`, the root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` or the workflow itself. A manual run always runs.
- **The token and the secret.** The publish job uses the same `CLOUDFLARE_API_TOKEN` in the `production` environment. Workers Editor is account-wide, and Workers Routes Write covers every hostname on the `deck.cool` zone, so the token deploys this Worker too. It has no permission on the `playdeck.video` zone, and this Worker needs none.
- **The zone.** Always Use HTTPS is a zone setting, so it already covers `play.deck.cool`. deck.cool's HSTS has `includeSubDomains`, and playdeck's `_headers` sends the same HSTS.

### The first deploy

The `play-deck-cool` Worker exists: it was created empty through the Cloudflare API on 2026-10-09, so Workers Editor can deploy to it and the first deploy needs no Admin. Run it from CI.

Before the first deploy, check the zone's DNS records for `play.deck.cool`. The custom domain creates its own record, and it cannot be created on a hostname that already has a CNAME record.

```sh
gh workflow run deploy-playdeck.yml -R pedrosousa13/deck-cool --ref main               # dry run
gh workflow run deploy-playdeck.yml -R pedrosousa13/deck-cool --ref main -f apply=true # publish
gh run watch -R pedrosousa13/deck-cool
```

From your machine instead:

```sh
cd sites/playdeck
pnpm build
pnpm exec wrangler deploy --dry-run   # lists the upload; sends nothing
CLOUDFLARE_API_TOKEN=... pnpm exec wrangler deploy
```

### Verifying playdeck

```sh
pnpm --filter @sites/playdeck check-live                      # https://play.deck.cool
pnpm --filter @sites/playdeck check-live https://example.com  # any other origin
```

`check-live` fetches `/`, `/examples/`, `/guides/comparison/`, `/docs/search/` and `/archetype-captions.vtt`, and fails unless each answers `200` with every header in `sites/playdeck/src/headers.ts`, at its exact value, and no `immutable`. The CSP, and `Strict-Transport-Security: max-age=31536000; includeSubDomains`, are among those headers. It fails unless each page's `<link rel="canonical">` is its own path on `https://play.deck.cool`. It then checks the hashed stylesheet that `/` links, as deck.cool's check does. It fails unless `/manifest.json` and `/no-such-page/` answer `404`, and unless `http://play.deck.cool/` answers `301` to `https://play.deck.cool/`. `sites/playdeck/src/live-check.test.ts` runs the same checks against the build served locally.

`src/live-check.ts` lists this site's paths and holds the canonical check, which site-kit runs on each page it fetches. The other checks are site-kit's, as deck.cool's are.

Rolling back, and taking the site off the domain, are the same as for deck.cool, with the Worker `play-deck-cool` in `sites/playdeck`.
