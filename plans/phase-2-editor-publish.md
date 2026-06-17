# Phase 2 — Writing & Publishing (Roadmap)

> This is a roadmap, not a code-complete implementation plan. Before starting this phase, run the **superpowers:writing-plans** skill again to produce a bite-sized, code-complete plan grounded in the actual `User` model, auth guards, and module structure Phase 1 produced. See [docs/architecture.md](../docs/architecture.md) and [docs/features.md](../docs/features.md).

## Goal

A logged-in user can write an article in a rich-text editor, autosave it as a draft, attach tags and a cover image, and publish/unpublish it. Anyone can read a published article.

## Scope (from docs/features.md §3–4)

- Tiptap editor: bold, italic, headings, lists, blockquote, code block, inline images, links.
- Autosave draft.
- Publish / unpublish (drafts visible only to the author).
- Auto-generated unique slug from title.
- Cover image upload.
- Reading time estimate.
- Tag attach (existing or new tag).
- Article reading view (byline, content, reading time, tags, publish date).
- Tag page `/tag/:slug`.

## Expected new/changed files

**apps/api**
- `prisma/schema.prisma` — add `Article`, `Tag`, `ArticleTag` models; `searchVector` generated column + GIN index (raw SQL migration).
- `src/articles/` — `articles.module.ts`, `articles.controller.ts`, `articles.service.ts`, DTOs (`create-article.dto.ts`, `update-article.dto.ts`), slug-generation util, reading-time util.
- `src/tags/` — `tags.module.ts`, `tags.controller.ts`, `tags.service.ts`.

**apps/web**
- `app/components/editor/ArticleEditor.vue` — Tiptap wrapper component.
- `app/pages/write.vue` / `app/pages/write/[id].vue` — editor page (new draft / edit existing).
- `app/pages/[username]/[slug].vue` — article reading view.
- `app/pages/tag/[slug].vue` — tag listing page.
- `app/composables/useArticleAutosave.ts`.

**packages/shared**
- `src/article.ts` — `Article`, `Tag` types + Zod schemas for create/update DTOs.

## Key decisions already locked

- Content stored as Tiptap JSON (not raw HTML) in `Article.content`.
- Cover images go through the same Cloudinary upload path built in Phase 1.
- Slugs are unique per article, generated from title at publish time (collision-suffixed if needed).

## Done when

- A user can write, autosave, tag, add a cover image, and publish an article; a logged-out visitor can read it at its URL and browse it via its tag page.
