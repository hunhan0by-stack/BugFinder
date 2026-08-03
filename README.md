# Frontend Bug Finder

A beginner-friendly frontend quality assurance scanner.

## Current status

**Phase 4 — Secure basic Playwright scanner foundation.**

Phases 1–3 are complete. Phase 4 replaces the demonstration API with a real
single-page Chromium visit that:

- Validates and normalizes the submitted URL
- Blocks private, loopback, link-local, metadata, and reserved destinations
- Revalidates redirects and browser requests
- Collects basic navigation metadata
- Optionally captures one desktop screenshot
- Does **not** run diagnostic bug detection yet

## What Phase 4 does

- Opens exactly one authorized page with Playwright Chromium
- Records final URL, title, HTTP status, content type, redirects, and timing
- Enforces request, host, redirect, timeout, and concurrency limits
- Stores optional screenshots under `public/scan-results/{scanId}/desktop.png`

## What Phase 4 does not do

- Console or page-error diagnostics
- Network/HTTP issue classification
- Broken-image or broken-link detection
- Mobile layout measurement or mobile screenshots
- axe-core accessibility analysis
- Crawling, clicking, forms, login, or authentication
- Vulnerability testing

A successful Phase 4 result confirms browser navigation only. It is **not** a
full website quality assessment.

## Six scan options

| Key | Phase 4 behavior |
| --- | --- |
| `consoleErrors` | Deferred |
| `networkErrors` | Deferred |
| `brokenImages` | Deferred |
| `mobileLayout` | Deferred |
| `accessibility` | Deferred |
| `screenshots` | Desktop screenshot only when selected |

## Stack

- Next.js 16 (App Router, Node.js runtime for `/api/scan`)
- React 19
- TypeScript 5 (strict mode)
- Tailwind CSS v4
- Zod
- Playwright Chromium
- axe-core packages remain installed but unused

## Requirements

- Node.js **20.9 or newer**
- npm
- Playwright Chromium: `npx playwright install chromium`

## Environment

Copy `.env.example` when needed. Important values:

| Variable | Default | Notes |
| --- | --- | --- |
| `SCAN_PAGE_TIMEOUT_MS` | `30000` | Navigation timeout |
| `SCAN_TOTAL_TIMEOUT_MS` | `90000` | Whole-scan deadline |
| `SCAN_SCREENSHOT_TIMEOUT_MS` | `15000` | Screenshot timeout |
| `SCAN_MAX_REDIRECTS` | `5` | Redirect ceiling |
| `SCAN_MAX_REQUESTS` | `250` | Per-scan request ceiling |
| `SCAN_MAX_UNIQUE_HOSTS` | `40` | Distinct host ceiling |
| `SCAN_MAX_CONCURRENT_SCANS` | `1` | In-process limiter |
| `SCAN_ALLOWED_PORTS` | `80,443` | Public ports only by default |
| `ALLOW_LOCAL_FIXTURE` | `false` | **Never enable in production** |
| `LOCAL_FIXTURE_HOST` | `127.0.0.1` | Exact test host only |
| `LOCAL_FIXTURE_PORT` | `3100` | Exact test port only |

Application-level SSRF checks reduce risk but do **not** replace an
operating-system or container network sandbox.

## Screenshot privacy

Screenshots stay on the local disk under `public/scan-results/`. Do not scan
pages with sensitive content unless you are authorized to store the image. Do
not upload screenshots to external services.

## Installation

```powershell
npm install
npx playwright install chromium
```

## Development

```powershell
npm run dev
```

Open the URL printed in the terminal (usually `http://localhost:3000`).

## Validation

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Optional Phase 4 matrices against a running local fixture:

```powershell
node ./scripts/phase4-security-matrix.mjs
node ./scripts/phase4-scanner-matrix.mjs
node ./scripts/phase4-browser-matrix.mjs
```

Automated tests use a local `127.0.0.1` fixture only. They do not contact
third-party websites.

## Example request

```http
POST /api/scan
Content-Type: application/json

{
  "url": "https://authorized-example.com",
  "options": {
    "consoleErrors": true,
    "networkErrors": true,
    "brokenImages": true,
    "mobileLayout": true,
    "accessibility": true,
    "screenshots": true
  }
}
```

## Example success shape

```json
{
  "success": true,
  "mode": "BASIC_SCAN",
  "targetWasContacted": true,
  "page": {
    "finalUrl": "https://authorized-example.com/",
    "title": "Example",
    "statusCode": 200,
    "redirectCount": 0
  },
  "diagnostics": {
    "status": "NOT_RUN",
    "issues": []
  },
  "deferredChecks": ["consoleErrors", "networkErrors", "brokenImages", "mobileLayout", "accessibility"],
  "screenshot": {
    "requested": true,
    "available": true,
    "publicUrl": "/scan-results/<scanId>/desktop.png"
  }
}
```

JSON export filenames look like
`frontend-bug-finder-basic-scan-example-com.json`.

## Safety

- Scan only websites you own or are authorized to test.
- Default ports are **80** and **443** only.
- Private and loopback targets are blocked unless the exact local fixture
  exemption is enabled for tests.
- Never enable `ALLOW_LOCAL_FIXTURE` in production.

## Roadmap

- [x] Phase 1: Foundation
- [x] Phase 2: Main interface
- [x] Phase 3: Types, validation, and mock API
- [x] Phase 4: Basic Playwright scanner
- [ ] Phase 5: Console, page-error, and network diagnostics
- [ ] Phase 6: Broken images, mobile layout, and accessibility
- [ ] Phase 7: Broader URL/SSRF hardening and deployment controls
- [ ] Phase 8: Intentional local bug fixture
- [ ] Phase 9: Testing and polish
