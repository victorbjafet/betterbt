# BetterBT — BT4U CORS proxy (Cloudflare Worker)

A tiny, free, self-hostable Cloudflare Worker that lets the **web** build read the
official Blacksburg Transit **BT4U** web service.

## Why this exists (do I even need it?)

The BT4U service returns a CORS header (`Access-Control-Allow-Origin`) pinned to
an unrelated origin, so a browser at your site is blocked from reading its
responses — this is a browser rule, not an authentication one, and it applies to
public APIs too.

- **Native (iOS/Android): you do NOT need this.** Off-browser there is no CORS;
  the app calls BT4U directly.
- **Web: you need a same-origin-ish hop.** This Worker is that hop. It fetches
  BT4U server-side (no CORS between servers) and returns the data to your browser
  with a CORS header your site is allowed to read.

It is **not** a generic open proxy — see [Security / abuse](#security--abuse).

## What you get

- **Free.** Cloudflare Workers free tier = 100,000 requests/day, no credit card.
- **Nothing to host.** Cloudflare runs it on their edge; you just deploy the file.
- **A free URL:** `https://<name>.<your-subdomain>.workers.dev`.

> Note on volume: only web users hit this (native goes direct), but the live map
> polls every few seconds, so a busy public deployment can approach the free cap.
> If you exceed it, Workers Paid is $5/mo for 10M requests. The free plan does not
> bill overage — it just returns errors past the cap.

---

## 1. Configure allowed origins

Open [`bt4u-proxy.worker.js`](bt4u-proxy.worker.js) and edit `ALLOWED_ORIGINS` to
your site plus any local dev origins:

```js
const ALLOWED_ORIGINS = [
  'https://your-site.example',   // your deployed web app
  'http://localhost:8081',       // expo web dev
  'http://localhost:19006',      // expo web dev (older port)
];
```

## 2. Deploy it — pick ONE path

**Recommended: Path B (Wrangler CLI).** It's one command, it's what "easy
updating" actually looks like for this Worker (edit the file locally, run
`wrangler deploy` again), and it sidesteps every ambiguity in Cloudflare's
current dashboard flow described in Path A below. Use Path A only if you'd
rather not install anything.

### Path A — Dashboard (no CLI)

Cloudflare's current "Workers & Pages" creation screen (as of 2026-07) shows
**Workers & Pages → Create application → "Ship something new"** with four
tiles: *Connect GitHub*, *Connect GitLab*, *Start with Hello World!*, *Select a
template*, and further down, *Upload your static files*.

1. Sign in at <https://dash.cloudflare.com> (free account).
2. **Workers & Pages → Create application**.
3. Click **Start with Hello World!** — this is the only tile that creates an
   actual Workers *script* project with an in-browser code editor. See the two
   callouts below for why the other tiles are the wrong choice here.
4. Give it a name (e.g. `betterbt-bt4u-proxy`) → it deploys a starter
   "Hello World" script.
5. Open the project → **Edit code** (opens the Workers code editor). Select all
   of the starter code, delete it, and paste in the full contents of
   `bt4u-proxy.worker.js` from this folder.
6. **Save and deploy** (sometimes labeled **Deploy**).
7. Copy the URL shown: `https://betterbt-bt4u-proxy.<you>.workers.dev`.

> **Do not use "Upload your static files" for this Worker.** That tile is
> Cloudflare **Pages'** static-asset uploader, not a Workers script deployment —
> which is exactly why it warns *"This uploader does not yet support projects
> that require a build process... Please use `wrangler deploy` instead."* if you
> hand it a `.js` file. It isn't just a warning to dismiss: proceeding through it
> deploys your script as a downloadable **static asset**, not as compute that
> executes per request — the proxy would never actually run, and every request
> to it would fail or 404. If you already created a project this way, delete it
> and start over with **Start with Hello World!** (or use Path B).

> **Skip "Connect GitHub" / "Connect GitLab" for this Worker.** Those hook into
> Cloudflare Pages' git-integrated *build pipeline* (framework detection, build
> command, output directory) — designed for static sites/frontend frameworks,
> and unnecessary overhead for a single ~150-line script with one thing you'll
> ever edit (`ALLOWED_ORIGINS`). If you want git-triggered redeploys later, the
> correct tool for a raw Worker is a small GitHub Actions workflow using
> [`cloudflare/wrangler-action`](https://github.com/cloudflare/wrangler-action)
> to run `wrangler deploy` on push — not the dashboard's git connector. For now,
> "edit the file, run one command" (Path B) already *is* the easy-update story.

### Path B — Wrangler CLI (from this folder)

```bash
cd cloudflare-worker
npx wrangler login      # opens a browser to authorize (free account)
npx wrangler deploy     # reads wrangler.toml, prints your worker URL
```

Rename `name` in [`wrangler.toml`](wrangler.toml) first if you want a different
subdomain. To update later (e.g. after editing `ALLOWED_ORIGINS`), just edit the
file and run `npx wrangler deploy` again — same URL, new code.

#### What is Wrangler, and what did those two commands actually do?

**Wrangler** is Cloudflare's own command-line tool for developing and publishing
Workers — the same relationship the `firebase` CLI has to Firebase, or `vercel`
has to Vercel. It's not part of this repo's app; `npx wrangler ...` downloads and
runs it on demand, scoped to the `cloudflare-worker/` folder.

- **`wrangler login`** opens your browser to Cloudflare's OAuth consent screen.
  Once you approve, Cloudflare issues Wrangler a scoped API token (permissions
  like "edit Workers scripts," not full account access) and Wrangler saves it
  locally — on macOS, at `~/Library/Preferences/.wrangler/config/default.toml`.
  **This step alone deploys nothing.** It only authenticates your machine so
  later `wrangler` commands don't need you to log in again. You can confirm
  what's stored and which account it's tied to with `npx wrangler whoami`.
- **`wrangler deploy`** reads [`wrangler.toml`](wrangler.toml) (the Worker's
  name, its entry file, a compatibility date) and the JS file it points to
  (`bt4u-proxy.worker.js`), uploads that script to Cloudflare, and publishes it
  as a live Worker under your account. There's no separate "build" step because
  the script has zero dependencies — it's uploaded close to as-is. Wrangler then
  prints the resulting URL(s).
- **Where does it actually run?** Nowhere you manage. Cloudflare distributes the
  same script to its edge network (hundreds of locations worldwide), and each
  incoming request is handled by whichever location is closest to the caller.
  That's the "serverless" part in practice: there's no single machine to patch,
  restart, or scale — Cloudflare's platform does that.
- **What got created:** a Worker resource named `betterbt-bt4u-proxy` (or
  whatever `name` you set) under your Cloudflare account, reachable by default at
  its auto-generated `*.workers.dev` URL. The dashboard's **Domains** tab on that
  Worker is where you can see/toggle that URL, and — see the next section — where
  you can attach a domain of your own instead.

## 3. Point the app at your Worker

The app reads an optional env var and, if set, puts your Worker **first** in its
web proxy chain (falling back to public proxies only if yours is unreachable).

Set it before building/serving the **web** app (Expo bakes `EXPO_PUBLIC_*` at
build time). Include the trailing slash:

```bash
# .env / your web deploy environment
EXPO_PUBLIC_BT4U_PROXY=https://betterbt-bt4u-proxy.<you>.workers.dev/
```

Then rebuild/redeploy web. When unset (the default), the app uses the public
proxy fallbacks. Native ignores this entirely and calls BT4U directly.

## 4. Test it

```bash
curl "https://betterbt-bt4u-proxy.<you>.workers.dev/https://www.bt4uclassic.org/webservices/bt4u_webservice.asmx/GetSummary"
# -> <?xml ...><DocumentElement><ScheduleSummary>...  (200)

# Blocked targets return 403:
curl "https://betterbt-bt4u-proxy.<you>.workers.dev/https://example.com"
# -> Forbidden: this proxy only serves the BT4U web service.
```

## 5. Optional: attach a custom domain instead of `*.workers.dev`

The auto-generated `*.workers.dev` URL works fine, but a domain of your own is a
worthwhile upgrade — not just cosmetic. `*.workers.dev` is a single shared domain
used by every Cloudflare Workers deployment worldwide, which some ad-blockers,
privacy extensions, and corporate/network filters block wholesale due to abuse
elsewhere on that domain. A hostname under your own domain doesn't carry that
baggage and reads as a first-party part of your site.

**How this repo's own production deployment does it** (`betterbt.vbjfr.xyz` →
proxy at `betterbt-proxy.vbjfr.xyz`, see `scripts/deploy-web.sh`):

1. Open the deployed Worker in the Cloudflare dashboard → **Domains** tab.
2. Click **Add Domain** (not *Add Route* — Add Domain is the simpler option and
   is what provisions everything below in one step) → enter the hostname you
   want, e.g. `betterbt-proxy.your-domain.com`.
3. This only works if that hostname's domain is *already* on Cloudflare's
   nameservers (i.e. you manage its DNS there) — Cloudflare then auto-creates
   the DNS record and TLS certificate for you. If your domain isn't on
   Cloudflare, use *Add Route* against an existing DNS zone instead, or stick
   with the `*.workers.dev` URL.
4. Update wherever you set `EXPO_PUBLIC_BT4U_PROXY` (step 3 above) to the new
   hostname instead of the `*.workers.dev` one. **No changes to the Worker
   script or `wrangler.toml` are needed** — `ALLOWED_ORIGINS` in
   `bt4u-proxy.worker.js` governs which *calling* site origins are trusted, which
   is unrelated to what hostname the Worker itself is reached at. The Worker
   behaves identically at either URL.

This custom-domain binding is a per-deployment dashboard setting, not something
this repo's shared `wrangler.toml` hardcodes — every self-hoster's domain is
different, so it isn't (and shouldn't be) checked into version control here.

---

## Security / abuse

This Worker handles **only public transit data** — no API keys, no auth, no user
data — so there is nothing sensitive to leak. The only real risk is abuse of your
free quota, and it is locked down against the usual open-proxy abuse:

- **Hardcoded upstream** — it can *only* reach the BT4U web service
  (`UPSTREAM_PREFIX`). It is not a `?url=anything` relay, so nobody can launder
  arbitrary traffic through it.
- **Operation allowlist** — only the known BT4U operations are forwarded; anything
  else is `403`.
- **Origin-restricted CORS** — only `ALLOWED_ORIGINS` get a matching CORS header,
  so other websites' browsers can't use it. (This is browser-enforced, so it
  stops other sites but not raw scripts — which is why the hardcoded upstream
  above is the primary control.)

Optional hardening for a high-traffic public deployment:

- **Rate limiting**: Cloudflare dashboard → your Worker → *Settings → Rate
  limiting* (or a WAF rate-limit rule) to cap requests per IP.
- **Custom domain** (see [step 5](#5-optional-attach-a-custom-domain-instead-of-workersdev)):
  a branded hostname under your own domain, less likely to be blocked by tools
  that flag the shared `*.workers.dev` domain. Note it is still a *different*
  browser origin than your main site (subdomains are not the same origin), so
  `ALLOWED_ORIGINS` remains required either way.

Worst case even unhardened: someone scripts requests to burn your free quota
fetching public bus data — a nuisance bounded by the daily cap, with no overage
billing. No data exposure.
