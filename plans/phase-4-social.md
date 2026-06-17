# Phase 4 — Social Interactions (Roadmap)

> This is a roadmap, not a code-complete implementation plan. Before starting this phase, run the **superpowers:writing-plans** skill again to produce a bite-sized, code-complete plan grounded in the real `Article`/`User` schema and endpoints from Phases 1–3. See [docs/architecture.md](../docs/architecture.md) and [docs/features.md](../docs/features.md).

## Goal

Users can follow each other, clap and comment on articles, and bookmark articles into a personal reading list.

## Scope (from docs/features.md §6)

- Follow / unfollow a user.
- Clap an article, repeatable up to a per-user-per-article cap.
- Comment on an article, with one level of replies.
- Bookmark an article; personal "Reading list" page.

## Expected new/changed files

**apps/api**
- `prisma/schema.prisma` — add `Follow`, `Clap`, `Comment`, `Bookmark` models.
- `src/follows/` — `follows.module.ts`, `follows.controller.ts`, `follows.service.ts`.
- `src/claps/` — `claps.module.ts`, `claps.controller.ts`, `claps.service.ts` (enforces the per-user-per-article cap).
- `src/comments/` — `comments.module.ts`, `comments.controller.ts`, `comments.service.ts` (enforces single-level nesting).
- `src/bookmarks/` — `bookmarks.module.ts`, `bookmarks.controller.ts`, `bookmarks.service.ts`.
- `feed.service.ts` (Phase 3) — wire the "Following" tab to the now-real `Follow` model per the sequencing note left in `plans/phase-3-feed-discovery.md`.

**apps/web**
- `app/components/FollowButton.vue`, `app/components/ClapButton.vue`.
- `app/components/CommentThread.vue`, `app/components/CommentForm.vue`.
- `app/components/BookmarkButton.vue`.
- `app/pages/reading-list.vue`.

## Key decisions to make explicit when detail-planning

- Exact clap cap per user per article (e.g. 50, matching Medium) — pick a number and put it in the plan, not "a reasonable cap".

## Done when

- A user can follow another user and see their articles in the Following feed, clap and comment on an article, and bookmark it into their reading list.
