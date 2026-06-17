# Phase 3 — Feed & Discovery (Roadmap)

> This is a roadmap, not a code-complete implementation plan. Before starting this phase, run the **superpowers:writing-plans** skill again to produce a bite-sized, code-complete plan grounded in the real `Article`/`Tag` schema and endpoints Phase 2 produced. See [docs/architecture.md](../docs/architecture.md) and [docs/features.md](../docs/features.md).

## Goal

A logged-in user has a home feed split into "Following" and "Explore" tabs; anyone can full-text search published articles.

## Scope (from docs/features.md §5)

- Home feed, "Following" tab — articles from followed authors, newest first.
- Home feed, "Explore" tab — all published articles, newest first (optionally filtered by tag).
- Full-text search (Postgres `tsvector`) across title/content/tags.
- Pagination or infinite scroll on feed and search results (cross-cutting requirement from docs/features.md §8).

## Expected new/changed files

**apps/api**
- `src/feed/` — `feed.module.ts`, `feed.controller.ts`, `feed.service.ts` (depends on `Follow` model, added in Phase 4 — see note below).
- `src/search/` — `search.module.ts`, `search.controller.ts`, `search.service.ts` (raw SQL `tsquery` against `Article.searchVector`).
- `articles.service.ts` (Phase 2) extended with cursor-based pagination.

**apps/web**
- `app/pages/index.vue` — home feed with Following/Explore tabs.
- `app/pages/search.vue` — search results page.
- `app/components/ArticleCard.vue` — shared feed/search/profile list item.
- `app/composables/useInfiniteScroll.ts`.

## Key decisions already locked

- Search is Postgres full-text only for MVP — no external search service.
- Pagination is cursor-based (not offset) to stay correct as new articles are published mid-scroll.

## Sequencing note

The "Following" tab needs the `Follow` model, which is scoped to Phase 4 in the original phase breakdown. When planning this phase in detail, either pull the minimal `Follow` schema forward into this phase, or build "Explore" first and land "Following" once Phase 4's `Follow` model exists — decide this explicitly when writing this phase's detailed plan, don't leave it ambiguous.

## Done when

- A logged-in user sees relevant articles in both feed tabs with working pagination, and can find an article by searching its title/content/tag.
