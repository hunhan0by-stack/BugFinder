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
- Never import Playwright into a client component or any file with
  `"use client"`.
- Never render scanned HTML with `dangerouslySetInnerHTML`.
- Never log cookies, authorization headers, passwords, tokens, or full query
  strings.
- No security exploitation, no destructive browser interactions.
- Only scan sites the user owns or is explicitly authorized to scan.

## Phase 4 basic scanner

- Current completed phase is Phase 4 after successful validation.
- `POST /api/scan` performs a real single-page Chromium visit with SSRF and
  private-network protections.
- Request-level network guards and redirect revalidation must remain active.
- Private-network checks must not be bypassed to make a site load.
- Do not set `ignoreHTTPSErrors` or `--disable-web-security`.
- Browser resources must close in `finally` blocks.
- `ALLOW_LOCAL_FIXTURE` is test-only. Never enable it in production. The
  exemption is exact-host and exact-port only.
- No console, network, broken-image, mobile, or accessibility issue detection
  until later phases explicitly request it.
- Results use `mode: "BASIC_SCAN"` and `diagnostics.status: "NOT_RUN"`.

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
5. Console and network checks
6. Frontend and accessibility checks
7. URL and SSRF protections (foundation landed in Phase 4; expand later)
8. Intentional local bug fixture
9. Testing and polish
