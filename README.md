# Frontend Bug Finder

A beginner-friendly frontend quality assurance scanner.

## Current status

**Phase 9 — local release ready (hardening, retention, observability).**

Phases 1–8 are complete. This release keeps the secure single-page Chromium
scanner and adds production-oriented request limits, artifact retention,
structured logs, and a health endpoint. It is intended for **local production
mode** (`npm run build` then `npm start`). It is **not** automatically safe to
expose on the public internet.

## Requirements

- Node.js **22.6 or newer** (Node 22 LTS recommended). Check with `node -v`.
- npm **10 or newer**. Check with `npm -v`.
- A 64-bit machine. On Windows, the x64 Next.js SWC native package is required.

The Node version is also recorded in `.nvmrc` (`22`).

## Setup

```bash
git clone <repository-url>
cd BugFinder
node -v
npm ci
npx playwright install chromium
cp .env.example .env.local
```

Development:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Production (local):

```bash
npm run build
npm start
```

`npm start` is the supported production runtime. `npm run dev` is not a
production substitute.

## Windows notes

- Use Node 22.6+ for Windows x64. Confirm `node -v` before installing.
- Next.js loads a platform-specific SWC binary (`@next/swc-win32-x64-msvc`)
  through its own dependency tree. Do not add that package as a direct app
  dependency.
- Project folders under OneDrive or other sync clients can lock `node_modules`
  and native binaries. A local unsynced directory such as `C:\Projects\BugFinder`
  is recommended; that exact path is not required on every machine.
- If a previous install left a damaged SWC binary (`not a valid Win32
  application`), delete `node_modules` and run `npm ci` again on a disk with
  free space.

## What the scanner does

- Opens **one** authorized page in headless Chromium
- Collects selected console, network, broken-image, mobile-layout, and
  accessibility diagnostics
- Optionally captures desktop/mobile screenshots and issue-specific PNG evidence
- Optionally runs bounded safe clicks and reversible two-click local workflows
- Stores artifacts under `public/scan-results/{scanId}/`

## Nine scan options

| Key | Behavior |
| --- | --- |
| `consoleErrors` | Desktop console error + uncaught page-error diagnostics |
| `networkErrors` | Desktop failed-request + HTTP 4xx/5xx diagnostics |
| `brokenImages` | Desktop visible `<img>` broken-image analysis |
| `mobileLayout` | Separate mobile context overflow + viewport-meta analysis |
| `accessibility` | Desktop axe-core WCAG A/AA violations |
| `screenshots` | Desktop `desktop.png` and mobile `mobile.png` |
| `safeInteractions` | Bounded non-destructive desktop interaction checks |
| `issueEvidence` | Bounded issue-specific PNG evidence for supported findings |
| `reversibleWorkflows` | At most two-click reversible local toggle checks |

`issueEvidence` and `reversibleWorkflows` default to **false** on the API when
omitted. Enabling `reversibleWorkflows` also enables `safeInteractions`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm test` | Unit + integration tests (local fixtures only) |
| `npm run preflight` | Environment checks (Node, disk, SWC, Chromium) |
| `npm run validate` | Sequential preflight, lint, typecheck, test, and build |

### Matrix commands

Run these from the project root after installing dependencies. Most browser
matrices need the app listening on port 3000 with local fixture mode enabled
**only in development**.

```bash
node --experimental-strip-types --import ./tests/register-alias.mjs scripts/phase4-security-matrix.mjs
node scripts/phase4-scanner-matrix.mjs
node --experimental-strip-types --import ./tests/register-alias.mjs scripts/phase9-security-matrix.mjs
node scripts/phase9-browser-matrix.mjs
node scripts/phase9-responsive-matrix.mjs
node scripts/phase9-ui-accessibility-matrix.mjs
```

Phase 5–8 matrix scripts remain in `scripts/` and are part of release
validation when a development server and fixture are available.

## Security model

Scan only sites you own or are explicitly authorized to test.

Application-level controls include:

- URL, hostname, port, DNS, and IP policy (SSRF / private-network blocks)
- Redirect validation and request/host budgets
- RequestGuard on every browser context
- Safe-interaction limits, trial clicks, and a zero-network click gate
- Destructive, navigation, submit, upload, and payment controls are skipped

These controls **do not replace** infrastructure egress isolation. Production
deployments should also block RFC1918/private networks, cloud metadata,
localhost, link-local addresses, and internal services at the network layer.

## Rate limiting

`POST /api/scan` has an in-memory application rate limiter. It is
**single-process only**. Multi-instance production deployments need a
distributed limiter at the reverse-proxy or infrastructure layer.

Defaults: **10** requests per minute in production, **200** in development and
test so local matrix scripts can run. Override with
`SCAN_RATE_LIMIT_MAX_REQUESTS`. If you copy `.env.example` into production,
keep the production value at 10 (or lower).

`SCAN_TRUST_PROXY` defaults to false. Do not trust `X-Forwarded-For` unless a
reverse proxy overwrites untrusted incoming values.

## Privacy

Diagnostic metadata avoids collecting form values, page text where prohibited,
cookies, authorization headers, and request/response bodies.

Issue-specific screenshots may contain **visible page content** when
`issueEvidence` is explicitly enabled. Whole-page screenshots may also show
visible content. Do not treat images as text-free.

## Artifact retention

- Storage path: `public/scan-results/{scanId}/` (PNG only)
- Default retention: 24 hours (`SCAN_ARTIFACT_RETENTION_HOURS`)
- Optional byte budget: `SCAN_MAX_ARTIFACT_STORAGE_BYTES`
- Cleanup runs at process start and between scans, with a minimum interval
- Only validated UUID scan directories inside the configured root are deleted
- Active scans are never deleted
- This is local, single-instance storage. Cloud object storage is not included.

## Health

`GET /api/health` returns a small JSON payload when the process is alive. It
does not launch Chromium or scan a website.

## Deployment checklist

- [ ] Node.js 22.6+
- [ ] `NODE_ENV=production` for `npm start`
- [ ] `ALLOW_LOCAL_FIXTURE=false` (production refuses to enable it)
- [ ] Rate-limit settings reviewed
- [ ] Retention and storage budget reviewed
- [ ] `public/scan-results` is writable
- [ ] Disk has spare capacity
- [ ] Egress firewall / network sandbox in front of the process
- [ ] TLS and reverse proxy configured if exposed beyond localhost
- [ ] Security headers reviewed at the proxy if you add CSP there
- [ ] Log destination configured
- [ ] `npm ci`, `npm run build`, `npm test`, and a homepage/API smoke test

No automated public deployment is performed by this project.

## Known limitations

- No arbitrary crawl or multi-page traversal
- No authenticated / login scanning
- No form filling or form submission
- No payment or checkout workflows
- No destructive control testing
- No arbitrary multi-step workflow beyond two reversible clicks
- No iframe or Shadow DOM interaction
- No mobile interaction workflows
- No pixel-diff baseline regression
- No distributed rate limiter
- No cloud artifact storage
- In-memory rate limiting is single-instance only
- Local filesystem evidence is single-instance and not durable across hosts
- Application SSRF controls do not replace egress isolation
- axe results are not a WCAG certification

## Example scan request

```json
{
  "url": "https://example.com/",
  "options": {
    "consoleErrors": true,
    "networkErrors": true,
    "brokenImages": true,
    "mobileLayout": true,
    "accessibility": true,
    "screenshots": true,
    "safeInteractions": true,
    "issueEvidence": true,
    "reversibleWorkflows": true
  }
}
```

## Safety notes

- Phase 4 private-network / SSRF protections remain mandatory.
- Local fixture mode is test-only and cannot be enabled in production.
- Evidence filenames are server-generated; target text/URL never become paths.
- Password and payment-field targets are skipped for issue evidence.
