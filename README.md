# Frontend Bug Finder

A beginner-friendly frontend quality assurance scanner.

## Current status

**Phase 7 — Safe interaction, dead-click, obstruction, and form-state diagnostics.**

Phases 1–6 are complete. Phase 7 keeps the secure single-page Chromium scanner
and Phase 4–6 diagnostics, and adds bounded non-destructive interaction checks.

## What Phase 7 does

- Discovers a bounded set of main-frame interaction candidates
- Classifies each candidate conservatively for safety risk
- Skips navigation, submission, reset, destructive, download, upload, payment,
  account, authentication, and unknown-risk controls
- Runs a Playwright trial click and DOM hit-testing for obstruction
- Performs at most a small number of actual clicks (default 5)
- Uses a **fresh isolated browser context for every actual click**
- Blocks navigation, popups, downloads, file choosers, form submission, and
  **all network requests** during the click observation window
- Detects dead clicks, obstructed controls, and conservative form-state issues
- Keeps all Phase 4 SSRF / private-network protections active in every context

## How Phase 7 interaction findings are interpreted

- Only a small number of high-confidence safe controls are clicked.
- Every actual click occurs in a fresh isolated session.
- Controls requiring network or navigation are skipped, not labeled broken.
- A dead-click finding requires a successful click with no observable local response.
- A skipped control is not considered broken.
- Obstruction checks cover controls visible in the initial viewport only.
- Busy-state checks use a short bounded observation period.
- No multi-step workflow is tested.
- No form is submitted.
- No authentication is performed.
- No destructive action is allowed.
- A zero-finding result does **not** prove that every control works.

## What Phase 7 does not do

- Anchor / link clicking or multi-page crawling
- Typing into fields, password entry, or file upload
- Form submission or form reset
- Mobile interaction testing
- Iframe or Shadow DOM interaction
- Scrolling the page to discover more controls
- Visual regression or issue-specific screenshots
- Authentication or cookie/session import
- Vulnerability testing

## Seven scan options

| Key | Behavior |
| --- | --- |
| `consoleErrors` | Desktop console error + uncaught page-error diagnostics |
| `networkErrors` | Desktop failed-request + HTTP 4xx/5xx diagnostics |
| `brokenImages` | Desktop visible `<img>` broken-image analysis |
| `mobileLayout` | Separate mobile context overflow + viewport-meta analysis |
| `accessibility` | Desktop axe-core WCAG A/AA violations |
| `screenshots` | Desktop `desktop.png` and mobile `mobile.png` |
| `safeInteractions` | Bounded non-destructive desktop interaction checks |

`safeInteractions` defaults to **false**. It must be selected explicitly.

## Stack

- Next.js 16 (App Router, Node.js runtime for `/api/scan`)
- React 19
- TypeScript 5 (strict mode)
- Tailwind CSS v4
- Zod
- Playwright Chromium
- `@axe-core/playwright` / `axe-core` (server-only)

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
| `SCAN_DIAGNOSTIC_SETTLE_MS` | `1000` | Post-load diagnostic settle |
| `SCAN_MAX_DIAGNOSTIC_EVENTS` | `500` | Raw diagnostic event ceiling |
| `SCAN_MAX_DIAGNOSTIC_ISSUES` | `100` | Grouped issue ceiling |
| `SCAN_MAX_REDIRECTS` | `5` | Redirect ceiling |
| `SCAN_MAX_REQUESTS` | `800` | Shared desktop + interaction + mobile request ceiling |
| `SCAN_MAX_UNIQUE_HOSTS` | `40` | Distinct host ceiling |
| `SCAN_MAX_CONCURRENT_SCANS` | `1` | In-process limiter |
| `SCAN_ALLOWED_PORTS` | `80,443` | Public ports only by default |
| `SCAN_INTERACTION_DISCOVERY_TIMEOUT_MS` | `5000` | Candidate discovery timeout |
| `SCAN_INTERACTION_CONTEXT_TIMEOUT_MS` | `12000` | Per-click context budget |
| `SCAN_INTERACTION_SETTLE_MS` | `1000` | Post-click observation window |
| `SCAN_INTERACTION_PRECLICK_QUIET_MS` | `250` | Pre-click quiet window |
| `SCAN_MAX_INTERACTION_CANDIDATES` | `100` | Discovery ceiling |
| `SCAN_MAX_SAFE_CLICKS` | `5` | Actual click ceiling |
| `SCAN_MAX_INTERACTION_ISSUES` | `50` | Interaction issue ceiling |
| `ALLOW_LOCAL_FIXTURE` | `false` | **Never enable in production** |
| `LOCAL_FIXTURE_HOST` | `127.0.0.1` | Exact test host only |
| `LOCAL_FIXTURE_PORT` | `3100` | Exact test port only |

Application-level SSRF checks reduce risk but do **not** replace an
operating-system or container network sandbox.

## Screenshot privacy

Desktop and mobile screenshots are stored locally in this project’s
`public/scan-results/` directory. Do not scan pages containing sensitive
information unless you are authorized to store the resulting images. Do not
upload screenshots to external services. Screenshots are scan-level evidence
and are not automatically linked to each diagnostic finding. Automatic
screenshot expiration is not implemented.

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

Optional matrices (local fixture only — no public websites):

```powershell
node --experimental-strip-types --import ./tests/register-alias.mjs ./scripts/phase4-security-matrix.mjs
node --experimental-strip-types --import ./tests/register-alias.mjs ./scripts/phase6-scanner-matrix.mjs
node --experimental-strip-types --import ./tests/register-alias.mjs ./scripts/phase7-scanner-matrix.mjs
node ./scripts/phase4-scanner-matrix.mjs
node ./scripts/phase4-browser-matrix.mjs
node ./scripts/phase5-browser-matrix.mjs
node ./scripts/phase6-browser-matrix.mjs
node ./scripts/phase7-api-matrix.mjs
node ./scripts/phase7-browser-matrix.mjs
```

For API and browser matrices, start the app with fixture mode enabled (never in production):

```powershell
$env:ALLOW_LOCAL_FIXTURE="true"
$env:LOCAL_FIXTURE_HOST="127.0.0.1"
$env:LOCAL_FIXTURE_PORT="3100"
npm run dev
```

Then disable fixture mode again for normal use.

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
    "screenshots": true,
    "safeInteractions": true
  }
}
```

## Safety

- Scan only websites you own or are authorized to test.
- Default ports are **80** and **443** only.
- Private and loopback targets are blocked unless the exact local fixture
  exemption is enabled for tests.
- Never enable `ALLOW_LOCAL_FIXTURE` in production.
- Playwright and axe run only on the server.
- Phase 7 prefers skipping an uncertain control over clicking it.

## Roadmap

- [x] Phase 1: Foundation
- [x] Phase 2: Main interface
- [x] Phase 3: Types, validation, and mock API
- [x] Phase 4: Basic Playwright scanner
- [x] Phase 5: Console, page-error, and network diagnostics
- [x] Phase 6: Broken images, mobile layout, mobile screenshots, and accessibility
- [x] Phase 7: Safe interaction, dead-click, button obstruction, and form-state diagnostics
- [ ] Phase 8: Advanced controlled workflows, issue-specific evidence, or visual regression foundation
- [ ] Phase 9: Testing and polish
