# BathRemodelHub — project guide

Lead-gen site for bathroom remodeling. A visitor enters a ZIP on a landing page, we search
Thumbtack for local pros, show them on a results page, and the Thumbtack quote widget opens for
the first pro. Traffic comes from paid ads (Meta, Google, TikTok, Snap) tracked through RedTrack.

Owner: GrowthFusion. Live: https://bathremodelhub.com — Staging: https://stage.bathremodelhub.com

## Stack

- **Backend:** Node 20+, Express 4 (single file server + one router). No build step, no framework.
- **Frontend:** plain static HTML/CSS/JS under `frontend/` (no bundler, no React). Served by Express.
- **Data:** ClickHouse (optional, analytics + lead capture). No other database.
- **Hosting:** Docker → Google Cloud Run (`us-central1`), built and deployed by GitHub Actions.
- **Dependencies:** only `express`, `compression`, `dotenv`. Dev: `playwright`, `sharp`.

## Run it

```
npm install          # re-run after every pull; a missing package (e.g. `compression`) crashes startup
npm run dev          # node --watch backend/server.js  → http://localhost:3000 (redirects / → /bath)
npm start            # production style
```

`.env` lives in the repo root (git-ignored — **never print, commit or paste its values**). Copy
`.env.example` for the variable list. Without `CLIENT_ID`/`CLIENT_SECRET` the results page shows a
token error; ClickHouse and PostHog are optional.

Locally the Thumbtack widget may show "request is coming from a country which we currently do not
support". That is Thumbtack geo-blocking a non-US IP, not a bug in this code.

## Repo map

```
backend/
  server.js              Express app: compression, JSON, security, /js/posthog-init.js, static, /api
  routes/api.js          /api/keywords, /api/businesses, /api/lead, /api/info, /api/location
  lib/auth.js            Thumbtack OAuth client-credentials token (cached, auto-refresh)
  lib/clickhouse.js      Pooled HTTPS client for ClickHouse
  middleware/security.js Blocks dotfiles, server.js, package*.json from static serving
  migrations/            ClickHouse SQL — run manually BEFORE deploying the backend change that needs it
frontend/
  bath/index.html        Main landing page (served at /bath)
  bath/a/, bath/b/       Landing variants (/bath/a, /bath/b); bath/nb/gf = another variant
  bath/results.html      Results page: search → cards → auto-open Thumbtack widget
  bath/quotes-api.js     Shared landing-page JS: tracking-param carry-over + lead capture
  bath/css/              tokens.css (design tokens), results-tw.css (generated), page CSS
  bath/fonts/            Self-hosted Inter + Material Symbols (woff2)
  bath/js/               Self-hosted DOMPurify (versioned filename)
scripts/
  convert-webp.js        Image conversion (sharp)
  tailwind-results/      Config to rebuild results-tw.css
docs/superpowers/        Older specs/plans (A/B testing design, service-card carousel)
.github/workflows/       deploy.yml (stage branch), deploy-prod.yml (main branch)
```

## API (backend/routes/api.js)

| Route | What it does |
|---|---|
| `POST /api/businesses` | `{searchQuery, zipCode, utmData, email?, phone?}` → Thumbtack `POST /api/v4/businesses/search`. Logs the search to ClickHouse `hc_search_tracking`. |
| `POST /api/lead` | Saves ZIP/email/phone/UTMs to ClickHouse `hc_lead_capture` at form-submit time, independent of the results page. Rate limit 20/min/IP. |
| `GET /api/keywords` | Thumbtack keyword search, 5-minute in-memory cache. |
| `GET /api/location` | ZIP/city/state from GPS (Google Geocoding) or IP (ipapi.co). Used for the localized headline. |
| `GET /api/info` | Environment name + API host for the browser console. No secrets. |

Rules that must not be broken:
- **Email and phone are never forwarded to Thumbtack.** ClickHouse only. Don't log them to the console.
- `zipCode` must be a 5-digit US ZIP; `searchQuery` is required. Validation stays server-side.
- The Thumbtack payload always includes `settings: { excludeOverserved: true }`.
- `API_BASE_URL` must be the **API** host (e.g. `staging-api.thumbtack.com`), not the auth host.

## UTM / tracking → Thumbtack

Flow: landing URL params → `trackingParams()` in `quotes-api.js` appends them to the redirect →
`results.html` reads them → `utmData` → `/api/businesses` → whitelisted → Thumbtack.

Backend whitelist (`ALLOWED_UTM_KEYS`, same list as HouseCrew): `utm_source, utm_campaign, utm_content,
utm_subid, utm_user_hash, utm_google_click_id`. Values are trimmed to 200 chars. **Any other key is
silently dropped by the server** — that is how the ad ID went missing once (the page sent `rt_ad`, the
whitelist only allowed `utm_content`). `utm_medium` and `utm_tt_session` are disallowed by Thumbtack — never send them.

| Sent to Thumbtack | Read from the URL |
|---|---|
| `utm_source` | `utm_source`, default `cma-growthfusion`. **Must match `^cma-[a-zA-Z0-9-_]{1,44}$`** or the server resets it. |
| `utm_campaign` | `utm_campaign` / `rt_cid` / `sub4` |
| `utm_content` (the **ad ID**, `{rt_aid}`) | `utm_content` / `utm_rt_ad` / `rt_ad` |
| `utm_subid` | `utm_subid` / `sub1` / cookie `rtkclickid-store` (RedTrack click ID) |
| `utm_user_hash` | `utm_user_hash` / `utm_facebook_click_id` / `fbclid` / `sub11` |
| `utm_google_click_id` | `gclid` / `utm_google_click_id` |

Other tracking: GTM `GTM-M8VC8STX`; PostHog (key injected by the server at `/js/posthog-init.js`);
RedTrack postbacks to `uo8b2.ttrk.io` (`startfunnel` on results load, `lead` when the widget opens).
`dataLayer` events: `Search`, `contact`, `request_quote`, `QuoteSubmitted`.

## Results page behavior (frontend/bath/results.html)

- Pros render **in the order Thumbtack returns them. Do not re-sort by rating.**
- The first pro's widget (`widgets.requestFlowURL`) **auto-opens** in a popup iframe, before the
  cards are built. It is full-screen on phones (`max-width: 900px` or `pointer: coarse`). There is
  deliberately no custom close button; the widget closes via its own `close` message, Esc, or a
  backdrop click.
- The widget iframe URL is validated: https only, host `thumbtack.com` or `*.thumbtack.com`.
- `message` events are accepted from any `*.thumbtack.com` origin (the widget is served from
  `partner.thumbtack.com` / `staging-partner.thumbtack.com`). **Don't go back to an exact-origin list** —
  that silently dropped the widget's `close` message and the X did nothing.
- A `<head>` script starts `/api/businesses` immediately into `window.__brhSearch`; the main script
  reuses it. Any change to how `utmData` is built must be made in **both** places (head script and
  main script) or they will drift.
- Auto-opening fires the `contact`/`request_quote` events and the `lead` postback on every load.

## Landing pages (frontend/bath/index.html, b/index.html)

- Submit handlers attach **immediately**, not in `DOMContentLoaded`. Waiting for it meant a click
  before all deferred scripts loaded did a native GET submit (`?zip=…` reload) — the "Get Quote
  needs multiple clicks" bug. Keep forms `novalidate` and handlers synchronous at end of `<body>`.
- `quotes-api.js` is `defer`; code that calls `window.hcCaptureLead` / `hcTrackingParams` must
  tolerate them not existing yet.
- Redirect to results is delayed 400 ms so pixels can fire. `submitting` is reset on `pageshow`
  (bfcache back-button).
- The headline is localized via `/api/location` but must never change once the visitor focuses the ZIP field.

## Performance rules

- **No third-party render-blocking scripts.** Tailwind CDN was removed from results; fonts and
  DOMPurify are self-hosted. Don't re-add CDN `<script>`/Google Fonts links to the results page.
- Fonts: `/bath/fonts/inter-latin.woff2` (one variable file, weights 100–900) and
  `material-symbols.woff2` (icon subset). Adding a new Material Symbol icon requires regenerating that
  subset from Google Fonts with `icon_names=` including it, or the icon renders as text.
- Resource hints for `partner.thumbtack.com`, `www.thumbtack.com` and Thumbtack's image CDN are in the
  results `<head>`. Keep them.
- Cache headers (server.js): HTML `no-cache`; images/fonts 30 days; CSS/JS 1 hour (+ stale-while-revalidate).
  Filenames are not hashed, so versioned/new filenames are needed for assets that must update immediately.
- Images are WebP (`node scripts/convert-webp.js`).

### Rebuilding results-tw.css

`results-tw.css` is a static Tailwind v3 build of the classes used in `results.html`. It only contains
classes that existed when it was built. After adding/changing Tailwind classes there, run from the repo root:

```
npx -y tailwindcss@3 -c scripts/tailwind-results/tailwind.config.js -i scripts/tailwind-results/input.css -o frontend/bath/css/results-tw.css --minify
```

## Database (ClickHouse, optional)

Tables: `default.hc_search_tracking` (one row per Thumbtack search: ZIP, UTMs, email/phone,
`contractor_found` Yes/No/blank) and `default.hc_lead_capture` (one row per form submission).
Schema changes go in `backend/migrations/<date>-<name>.sql`, are run by hand, and are applied
**before** deploying the code that writes them. If ClickHouse is down, the app must still work.

## Deploy

| Branch | Workflow | Cloud Run service | Domain |
|---|---|---|---|
| `stage` | `deploy.yml` | `bathremodelhub-frontend-stage` | stage.bathremodelhub.com |
| `main` | `deploy-prod.yml` | `bathremodelhub-frontend-prod` | bathremodelhub.com |

Pushing to either branch deploys. Work on `stage` and promote to `main` via PR. Real secrets are set in
Cloud Run, not in the repo. The container listens on 8080.

## Working in this repo

- Match the existing style: 4-space indent in JS/HTML, `'use strict'`, `function` declarations,
  comments that explain *why*. Frontend JS is ES5-style (`var`, `function`) for old-browser safety.
- Frontend must work on mobile first; most traffic is phones. Test the widget popup at phone width.
- Verify changes by running the page (Playwright is installed), not just by reading code. When the
  Thumbtack API isn't reachable, mock `/api/businesses` with 2–3 fake pros.
- Don't read, print or commit `.env`. `.env.example` is currently git-ignored too (see `.gitignore`).
- The repo is in OneDrive; file writes can fail with `EPERM` on a lock. Retry the single edit.
- Don't touch the HouseCrew project from here; it's a sibling codebase with similar results-page code.
  Fixes often apply to both, but ask before editing it.
- Existing reference docs: `BathRemodelHub-Technical-Overview.docx`, `BathRemodelHub-Tracker.xlsx`,
  `docs/superpowers/` (older and partly out of date — the code wins).
