# Phase 6 — Production Hardening & Launch (Roadmap)

> This is a roadmap, not a code-complete implementation plan. Before starting this phase, run the **superpowers:writing-plans** skill again to produce a bite-sized, code-complete plan grounded in the real, complete app from Phases 0–5. See [docs/architecture.md](../docs/architecture.md) and [docs/features.md](../docs/features.md).

## Goal

The app is tested, performant, observable, and deployed to production on the real infrastructure (Neon, Railway, Vercel, Cloudinary) set up in Phase 0.

## Scope

- Test coverage for the core flows: signup/login, write+publish, follow, clap, comment, search.
- Playwright e2e covering the full golden path: sign up → write → publish → another user reads/claps/comments.
- Performance pass: image lazy-loading, feed/search pagination tuning, N+1 query audit on the Prisma queries built across Phases 1–5.
- Monitoring/logging: Railway logs for the api, Vercel analytics for the web app.
- Production deploy and a pre-launch checklist.

## Expected new/changed files

- `apps/api/test/*.e2e-spec.ts` — integration tests per module against a real test database.
- `apps/web/e2e/golden-path.spec.ts` — Playwright test for the full flow above.
- `.github/workflows/ci.yml` (Phase 0) — extended to run the e2e suite.
- A pre-launch checklist (where it lives — root `README.md` vs a new `docs/launch-checklist.md` — should be decided when detail-planning this phase, not left implicit).

## Key decisions to make explicit when detail-planning

- Which specific N+1 query risks exist, found by reviewing the actual Prisma calls written in Phases 1–5 (e.g. fetching an article's author, tags, and clap count in a feed list) — list them concretely rather than "look for N+1s".

## Done when

- The full golden-path e2e test passes against a deployed staging environment, and the app is live on production URLs backed by Neon/Railway/Vercel/Cloudinary.
