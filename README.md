# Frontend Bug Finder

A beginner-friendly frontend quality assurance scanner.

## Current status

**Phase 8 — Advanced controlled workflow & issue-specific evidence foundation.**

Phases 1–7 are complete. Phase 8 keeps the secure single-page Chromium scanner
and Phase 4–7 diagnostics, and adds bounded issue-specific evidence plus
strictly limited reversible two-click workflows.

## What Phase 8 does

- Captures **issue-specific** PNG evidence when `issueEvidence` is selected
- Stores evidence under `public/scan-results/{scanId}/evidence/` with safe IDs
- Associates artifacts with issues via `evidenceIds` (no absolute paths, no base64)
- Tests a small number of **local reversible** controls when
  `reversibleWorkflows` is selected (at most two real pointer clicks per control)
- Reuses Phase 7 safety: RequestGuard, zero-network gate, no navigation, no
  form submission, no popups/downloads/file choosers, no force clicks
- Reports `STATE_TRANSITION_ISSUE` when a proven reversible control fails to
  restore baseline after the second click
- Keeps all Phase 4 SSRF / private-network protections active in every context

## How Phase 8 evidence should be interpreted

- Screenshots support findings but do **not** prove root cause.
- Before/after screenshots are **not** pixel-diff analysis.
- Evidence screenshots may contain **visible page content** near the affected
  element; they are opt-in and privacy-sensitive.
- Workflow success only covers the tested local reversible boolean state.
- A successful reversal does **not** prove the entire application workflow works.
- Unsupported controls are skipped; network-dependent actions remain excluded.
- Zero findings do **not** prove the page is bug-free.

## What Phase 8 does not do

- General crawling, link traversal, or multi-page workflows
- Authentication, login, password entry, or form filling/submission
- Payment, checkout, uploads, downloads-as-tests, or destructive actions
- Mobile interaction workflows, iframe, or Shadow DOM interaction
- More than two real clicks per workflow, or clicking a second distinct control
- Visual baseline regression or screenshot pixel-diff scoring
- AI-generated fixes or vulnerability scanning

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

`issueEvidence` and `reversibleWorkflows` default to **false**. They must be
selected explicitly. Enabling `reversibleWorkflows` also enables
`safeInteractions` (server-normalized and shown in the UI).

`screenshots` (whole-page) and `issueEvidence` (clipped issue evidence) are
independent. Issue evidence may run when whole-page screenshots are off.

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

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm test` | Unit + integration tests (local fixtures only) |

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

Legacy Phase 7 payloads that omit `issueEvidence` / `reversibleWorkflows` are
accepted and treated as `false`.

## Safety notes

- Phase 4 private-network / SSRF protections remain mandatory.
- Phase 7 prefers skipping an uncertain control over clicking it.
- Phase 8 permits a second click only after a proven local reversible transition
  with zero network/navigation/side effects.
- Evidence filenames are server-generated; target text/URL never become paths.
- Password and payment-field targets are skipped for issue evidence.

## Roadmap

- [x] Phase 1: Foundation
- [x] Phase 2: Main interface
- [x] Phase 3: Types, validation, and mock API
- [x] Phase 4: Basic Playwright scanner + URL/SSRF protections
- [x] Phase 5: Console and network checks
- [x] Phase 6: Frontend and accessibility checks
- [x] Phase 7: Safe interaction, dead-click, button obstruction, and form-state diagnostics
- [x] Phase 8: Advanced controlled workflows and issue-specific evidence foundation
- [ ] Phase 9: Production hardening, deployment safety, retention, observability, final regression, and release readiness
