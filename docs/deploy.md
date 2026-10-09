# Deploying deck.cool

The umbrella site (`sites/deck-cool`) is served at `https://deck.cool` by **Workers Static Assets**, the way pagedeck deploys its landing page. One `wrangler deploy` uploads the built `site/` and publishes a Worker named `deck-cool` that serves it. The Worker has no code of its own.

wrangler is `sites/deck-cool`'s exact-version dev dependency. Run it as `pnpm exec wrangler` in `sites/deck-cool`, never as `npx wrangler`, which takes whatever version is latest.

## What gets deployed

`sites/deck-cool/wrangler.jsonc` declares the Worker:

- `assets.directory` is `./site`, the build output.
- One route, `{ "pattern": "deck.cool", "custom_domain": true }`. Cloudflare creates the DNS record and the certificate for it.
- `workers_dev` is `false`, so the site has one address.
- `html_handling` is `auto-trailing-slash`, and `not_found_handling` is `none`: the site declares no 404 page, so a missing path answers a bare `404`.
- `account_id` is the account's ID. It is not a secret.

`pagedeck build` writes three files that wrangler reads as configuration and does not upload:

- `_headers`: a `/*` rule and an `/assets/*` rule. Every page and file gets the CSP from `src/csp.ts`, then `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and `Strict-Transport-Security: max-age=31536000; includeSubDomains`, all from `src/headers.ts`. Files under `/assets/` also get `Cache-Control: public, max-age=31536000, immutable`.
- `_redirects`: three rows that proxy `/manifest.json`, `/.pagedeck` and `/.pagedeck/*` to `/404.html`.
- `.assetsignore`, from `packages/brand/public/` through passthrough. It keeps `/manifest.json`, `/.pagedeck` and `/404.html` out of the upload. Because `/404.html` is not uploaded, the proxy rows answer `404`.

**Only `/assets/` is cached as `immutable`.** The build compiles the stylesheets in `build.css` into one sheet, `/assets/fw-core-<hash>.css`, named by its content's hash, so a changed sheet gets a new URL. Every other file keeps its name from build to build, the icons under `/icons/` among them, so it gets Cloudflare's default `Cache-Control`. If a build writes a hashed name outside `/assets/`, add a header rule for its directory in `pagedeck.config.ts`. `site.build.test.ts` fails until you do.

## Setting up

Once, in the Cloudflare account that holds the `deck.cool` zone.

### The API token

Create an **account-owned** token: Manage Account → Account API Tokens → Create Token. Give it these two permissions and nothing else. The role names are Cloudflare's new Workers roles (2026-09-15), not yet checked against a deploy. If the dashboard offers only the classic permissions, use the ones in parentheses.

| Permission | Scope | Why |
| --- | --- | --- |
| Workers → **Admin** (classic: Account › Workers Scripts › Edit) | Workers product (all Workers in the account) | The first deploy creates the `deck-cool` Worker. Only product-level Admin can create a Worker. |
| Zone → **Workers Routes** → **Write** (classic: Zone › Workers Routes › Edit) | the `deck.cool` zone only | Each deploy sets the Worker's custom domain on that zone. |

After the first deploy has created the Worker, edit the token and lower Workers → Admin to Workers → **Editor**, still at the Workers product scope. Editor can deploy new versions and roll back, but cannot create or delete a Worker. Keep the product scope: Cloudflare does not support per-Worker roles for custom domains yet. Keep Workers Routes → Write: every deploy sends the custom domain to Cloudflare again. With classic permissions there is nothing to lower.

If a deploy is refused with an authorization error, add only the permission that the error names.

### The secret

Add the token as `CLOUDFLARE_API_TOKEN`, a secret of the repository's `production` environment, not a repository secret:

```sh
gh secret set CLOUDFLARE_API_TOKEN --env production -R pedrosousa13/deck-cool
```

`gh` reads the value from standard input when you paste it, so the value is not on a command line. The `production` environment's deployment branch policy allows `main` only, so no other branch's run can read the secret. In the workflow, only the publish job uses the environment, and only its publish step reads the secret.

## Deploying

`.github/workflows/deploy-deck-cool.yml` builds the site from the checked-out commit and then:

- on every push, and on a manual run without `apply`, runs `wrangler deploy --dry-run` in the `dry-run` job. The dry run uses no environment and no credential, and sends nothing to Cloudflare.
- on a manual run on `main` with `apply`, runs `wrangler deploy` in the `publish` job, in the `production` environment, then `pnpm check-live` against `https://deck.cool`, retrying for up to five minutes while a new custom domain gets its certificate.

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

`check-live` fetches `/` and `/icons/deck-cool/still.svg` and fails unless each answers `200` with every header in `src/headers.ts`, at its exact value, and no `immutable`. It then fetches the hashed stylesheet `/` links, and fails unless it answers `200` with the same headers and `Cache-Control: public, max-age=31536000, immutable`. It also fails unless `/manifest.json` answers `404`. It is not part of `pnpm test`, which stays offline. `src/live-check.test.ts` runs the same checks against the build served locally.

For a quick look with curl:

```sh
curl -sI https://deck.cool/
curl -sI https://deck.cool/manifest.json   # 404
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
