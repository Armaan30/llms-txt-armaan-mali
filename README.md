# llms.txt Generator

Generate a spec-compliant [llms.txt](https://llmstxt.org) for any website: enter a URL, watch the crawl live, get a curated markdown file that helps LLMs understand the site — then let the built-in monitor keep it fresh as the site changes.

**▶ Live app: https://llms-txt-armaan-mali.vercel.app**

## What it does

- **Crawls any public website** — robots.txt-aware, sitemap-first with a BFS fallback, bounded to the ~50 most important pages so the output is a curation, not an index.
- **Organizes with Claude** — page metadata goes to Claude (Opus 4.8) with structured outputs, which writes the summary, groups pages into sections, and cleans up link descriptions. If the LLM is unavailable, a deterministic URL-structure fallback ships instead — generation never fails because a model was down.
- **Streams progress live** — the UI shows each crawl phase (robots → sitemap → pages → Claude) as it happens.
- **Public directory with caching** — every generated file lands in a searchable directory. Requesting an existing domain returns the cached file instantly; regeneration is an explicit action. An "unlisted" option keeps a file out of the directory (it still gets a hosted URL).
- **Editable preview** — tweak the generated markdown before copying/downloading. Manual edits are respected: the monitor stops auto-overwriting a human-curated file. Saving to the shared copy (directory + hosted URL) is owner-gated — only the browser that generated a site can rewrite it; everyone else edits locally for their own copy/download.
- **Hosted file URL** — every generation is served at `/f/{id}/llms.txt` as plain text, ready to be linked or fetched by an AI system.
- **Automated updates** — a scheduled monitor (hourly) re-crawls sites (oldest-checked first), fingerprints the extracted content, and regenerates the llms.txt only when the site actually changed. Every site shows *last updated* and *last checked* timestamps.

## Setup

Requirements: Node 20+, a Postgres database (a free [Neon](https://neon.tech) project works out of the box), and optionally an [Anthropic API key](https://console.anthropic.com/).

```bash
npm install
cp .env.example .env.local        # fill in DATABASE_URL (+ ANTHROPIC_API_KEY)
npm run db:push                   # create the schema
npm run dev                       # http://localhost:3000
```

Optional but recommended:

```bash
npm run seed                      # populate the directory with 6 diverse example sites
```

> Local dev needs a Postgres to point `DATABASE_URL` at. The quickest is Docker:
> `docker run -d --name llmstxt-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=llmstxt -p 55432:5432 postgres:16-alpine`
> then `DATABASE_URL="postgresql://postgres:dev@localhost:55432/llmstxt"`.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (Neon or any Postgres) |
| `ANTHROPIC_API_KEY` | no | Enables AI summary/organization; heuristics-only without it |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-opus-4-8` |
| `CRON_SECRET` | prod | Protects the monitoring endpoint; Vercel sends it automatically |

## Deployment (Vercel)

1. Push this repo to GitHub and import it into Vercel.
2. Add the environment variables above (Neon has a first-party Vercel integration for `DATABASE_URL`).
3. Deploy. `vercel.json` registers the monitoring cron (`/api/cron/check`, daily at 06:00 UTC); set `CRON_SECRET` so only Vercel can invoke it.
4. Run `npm run db:push` once against the production `DATABASE_URL`, then optionally `npm run seed`.

> The generate route sets `maxDuration = 300`; on the Vercel Hobby plan make sure Fluid Compute is enabled (it is by default for new projects) so long crawls aren't cut off.

To enable the hourly monitor via GitHub Actions after deploying, add two repository secrets under *Settings → Secrets and variables → Actions*: `APP_URL` (your deployment URL) and `CRON_SECRET` (same value as the Vercel env var). See [Monitoring](#monitoring-automated-updates) below.

## Testing

```bash
npm test        # 56 unit tests, ~1.4s, no network/DB
```

The suite covers the pure, deterministic logic — the SSRF guard (private/metadata IPs blocked), URL normalization, robots.txt parsing + longest-match rules, the selection funnel (noise/locale/nav-boost/templated-cap), HTML extraction fallback chains, the heuristic organizer, spec-compliant rendering, and the change-detection fingerprint (deterministic, order-independent, fires only on real content change). Network/DB/LLM boundaries are verified manually.

## Screenshots

<!-- Add screenshots or a short demo video here, e.g.: -->
<!-- ![Directory](docs/directory.png) -->
<!-- ![Live generation](docs/generating.png) -->
<!-- ![Editable preview + hosted URL](docs/site.png) -->

_See the [live app](https://llms-txt-armaan-mali.vercel.app) for the running product._

## How it works

```
URL ──▶ validate + SSRF check ──▶ robots.txt ──▶ sitemap? ──┬─ yes: select top ~50 URLs
                                                            └─ no:  BFS from homepage (depth ≤ 3)
        ──▶ fetch pages (6-way concurrent, 10s/req, 75s budget)
        ──▶ extract title / description / canonical per page
        ──▶ heuristic section grouping (URL structure)
        ──▶ Claude refinement (structured output; falls back to heuristics)
        ──▶ render spec-compliant llms.txt ──▶ persist (domain-keyed upsert)
```

### Crawl strategy

The goal is **curation, not indexing** — a 2,000-link llms.txt is worse than a 40-link one. So:

- **Sitemap first.** Discovered via robots.txt `Sitemap:` directives or common paths, including sitemap-index files. When present, no link-following is needed at all.
- **Prioritized selection.** Shallow paths beat deep ones; pages in the site's own nav/footer get a boost (they're the owner's curation); auth/cart/feed/pagination noise is dropped; non-English locale duplicates are dropped; templated sections (e.g. 900 `/product/…` pages) are capped so catalogs don't drown out the pages that describe the store.
- **BFS fallback** for sites without sitemaps: depth ≤ 3 from the homepage, 50-page cap.
- **Graceful degradation.** Client-rendered SPAs (detected by a near-empty homepage body) still produce a file from sitemap + meta tags, with an honest warning. Partial failures are reported, never fatal.

### Monitoring (automated updates)

The cron fingerprints each site's *extracted* content — a SHA-256 over the sorted `(url, title, description)` set — rather than raw HTML, so markup churn and A/B noise don't trigger false regenerations. Changed sites are regenerated in the same pass (the hash-check crawl is reused). Human-edited files are checked but never overwritten.

Two schedules drive the same endpoint:

- **Vercel cron** (`vercel.json`): daily at 06:00 UTC — the Hobby plan's maximum frequency.
- **GitHub Actions** (`.github/workflows/monitor.yml`): hourly. To enable it, add two repository secrets under *Settings → Secrets and variables → Actions*: `APP_URL` (your deployment URL) and `CRON_SECRET` (same value as the Vercel env var). It can also be run on demand from the Actions tab.

The endpoint is idempotent and self-batching, so overlapping schedules are harmless — each run just checks the least-recently-checked sites.

### Error handling & abuse protection

- **SSRF:** user-supplied URLs are DNS-resolved and rejected if they point at private/internal ranges — and every redirect hop is re-validated, so a public URL can't bounce the crawler into the internal network.
- **Budgets everywhere:** 10s per request (one retry), 2 MB per response, 5 redirects, 75s per crawl, 50 pages, per-IP rate limit on generation.
- **Typed failures:** user-facing errors (`"stripe.com responded with HTTP 403"`) are separated from internal ones, which are logged and returned as a generic message.
- **LLM fallback:** any Claude failure (timeout, rate limit, outage) silently downgrades to the deterministic heuristic organizer, with a note in the result.

## API surface

| Route | Method | Purpose |
|---|---|---|
| `/api/generate` | POST | Generate (streams NDJSON progress events); `force: true` regenerates |
| `/api/sites` | GET | Directory list / search (`?q=`) / my sites (`?mine=1&browserId=`) |
| `/api/sites/:id` | GET / PATCH | Fetch one site / save a manual edit |
| `/f/:id/llms.txt` | GET | The hosted file, served as `text/plain` |
| `/api/cron/check` | GET | Monitoring run (Bearer `CRON_SECRET`) |

## Design decisions & trade-offs

- **cheerio over a headless browser.** Static fetch + parse covers the overwhelming majority of sites at a fraction of the cost/latency of Playwright, and works cleanly on serverless. Client-rendered SPAs degrade to sitemap + meta tags with a visible warning. Revisit if SPA coverage becomes the priority — the extraction interface is the seam where a rendering backend would slot in.
- **Heuristics + LLM, not LLM-only.** The deterministic organizer is the guaranteed floor; Claude is a quality layer on top. One structured-output call per generation (~6¢ at Opus 4.8 pricing) with schema-validated JSON — the only LLM failure modes are transport-level, and those fall back.
- **Domain as the natural key.** Generation is idempotent; the directory doubles as a cache; the cron monitors each site once no matter how many users saved it.
- **Anonymous browser identity instead of auth.** "My sites" works with zero sign-up friction. The trade-off is honest: *unlisted* means "not in the directory," not "private" — real privacy needs accounts, which is the first thing I'd add for production (the `ownerBrowserId` column is where a user id would go).
- **Polling cron over webhooks.** Sites don't notify third parties when they change; scheduled re-crawls with content fingerprinting is the honest architecture. Bounded per run and ordered oldest-first so it round-robins the whole directory within its time limit.

## Known limitations / next steps

- JavaScript-only sites get metadata-level output (see trade-off above).
- Auth: accounts + real private generations.
- `llms-full.txt` generation (inlining page content) is a natural extension of the same pipeline.
- A diff view of what changed between monitored regenerations.
- Distributed rate limiting (the per-IP limiter is per-instance).

## Project structure

```
lib/crawler/    url guards + SSRF, safe fetch, robots, sitemap, BFS, extraction, prioritization
lib/generate/   heuristic organizer, Claude refinement, renderer, pipeline orchestrator
lib/db/         Drizzle schema + all queries
app/api/        generate (streaming), sites, cron
app/f/[id]/     hosted llms.txt route
app/, components/  UI: generator + live progress, directory, editable site view
scripts/seed.ts    populate the directory with real generations
tests/          Vitest unit tests for the pure crawler + generator logic
```
