<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Frontend Bug Finder — agent instructions

## Project

Frontend Bug Finder is a frontend quality assurance tool. It will scan a web page
and report frontend problems (console errors, failed requests, layout issues,
accessibility violations). It is **not** a security scanner.

## Workspace

- The project root is this workspace root (the folder is named `BUGFINDER`; the
  npm package name is `frontend-bug-finder`). They do not need to match.
- Never create a nested Next.js project inside this repo. There is exactly one
  `package.json`, one `app/` directory, and one `node_modules/`.

## Stack rules

- Next.js App Router only. No Pages Router.
- React with strict TypeScript. Do not weaken `tsconfig.json` to make checks
  pass, and do not use `any` to silence the type checker.
- Tailwind CSS v4 (configured through `@import "tailwindcss"` in
  `app/globals.css` and `@tailwindcss/postcss`). Do not add Tailwind v3 style
  config files.
- No database, no ORM, no authentication, and no payments in the MVP.

## Scanner rules

- All scanner code must run on the server (route handlers or server-only
  modules under `lib/`).
- Never import Playwright or axe into a client component or any file with
  `"use client"`.
- Never render scanned HTML with `dangerouslySetInnerHTML`.
- Never log cookies, authorization headers, passwords, tokens, or full query
  strings.
- No security exploitation, no destructive browser interactions.
- Only scan sites the user owns or is explicitly authorized to scan.

## Phase 6 rules

- Broken-image analysis covers visible `<img>` elements only.
- Do not report unloaded lazy images without failure evidence.
- Security-blocked image requests are not frontend issues.
- Mobile analysis uses a separate secured context with the request guard.
- Do not run Phase 5 console/network diagnostics twice in the mobile context.
- Axe runs on the desktop page only in Phase 6.
- Never return raw axe node HTML or the full target DOM.
- Never claim WCAG compliance or full responsiveness.
- Mobile and axe outputs must remain bounded.
- Preserve the security guard in every browser context.

## Phase 7 rules

- Phase 7 is complete only after all tests pass.
- Safety has priority over interaction coverage.
- Only `safeInteractions` enables actual clicks; it defaults to false.
- Every actual click uses a fresh isolated browser context with RequestGuard.
- Never click links, submit/reset controls, file inputs, or text/password fields.
- Never allow target network requests during click observation.
- Never allow navigation, popups, downloads, or file-chooser actions from clicks.
- Never type into target fields or collect form values / page text.
- Never label skipped controls as dead.
- Trial click must run before actual click.
- Obstructed controls must not become dead-click issues.
- Interaction limits must remain bounded.
- Do not implement mobile interactions before a later phase.
- Run side-effect, security, fixture, and cleanup matrices after interaction changes.

## Phase 8 rules

- Evidence capture must be explicit (`issueEvidence` defaults false).
- Never generate arbitrary filesystem paths from target data.
- Evidence artifacts are PNG only; count and bytes are bounded.
- Screenshots may contain visible target content — never claim they are text-free.
- Never screenshot password/payment target fields for issue evidence.
- Workflow candidates need observable reversible boolean state.
- Maximum two real clicks per workflow; same logical control only.
- Second click requires revalidation, trial click, and strict network gate.
- RequestGuard remains active; no navigation, form submission, popup/download/file chooser.
- No force click, no radio reversal, no tri-state workflow.
- No Phase 9 (auth, DB, queues, crawling, pixel-diff, object storage).

## Workflow rules

- Keep phases separate. Do not start the next phase without an explicit
  instruction.
- After finishing a phase, run `npm run lint`, `npm run typecheck`,
  `npm test`, and `npm run build`, and report the real results.
- Run security and scanner tests after scanner changes.
- Never hide errors. No `|| true`, no `eslint-disable` for whole files, no
  `ignoreBuildErrors`. Fix the root cause.
- Keep the code beginner-friendly: clear names, small functions, no clever
  abstractions.

## Phases

1. Foundation (complete)
2. Main interface (complete)
3. Types, validation, and mock API (complete)
4. Basic Playwright scanner (complete)
5. Console and network checks (complete)
6. Frontend and accessibility checks (complete)
7. Safe interaction, dead-click, obstruction, and form-state diagnostics (complete)
8. Advanced controlled workflow & issue-specific evidence (complete)
9. Production hardening / testing and polish (not started)
