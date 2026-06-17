# Phase 5 — Notifications & Polish (Roadmap)

> This is a roadmap, not a code-complete implementation plan. Before starting this phase, run the **superpowers:writing-plans** skill again to produce a bite-sized, code-complete plan grounded in the real code from Phases 1–4. See [docs/architecture.md](../docs/architecture.md) and [docs/features.md](../docs/features.md).

## Goal

Users get in-app notifications for follows/claps/comments on their content. The app is SEO-ready, responsive, and handles loading/error/empty states everywhere.

## Scope (from docs/features.md §7–8)

- In-app notification list: new follower, new clap, new comment.
- Mark notifications as read.
- SEO: meta tags, Open Graph, sitemap, SSR for article/profile pages.
- Responsive layout (mobile + desktop).
- Loading/error/empty states on every data-fetching page.

## Expected new/changed files

**apps/api**
- `prisma/schema.prisma` — add `Notification` model.
- `src/notifications/` — `notifications.module.ts`, `notifications.controller.ts`, `notifications.service.ts`.
- `claps.service.ts`, `comments.service.ts`, `follows.service.ts` (Phase 4) — emit a `Notification` row on the relevant action.

**apps/web**
- `app/components/NotificationBell.vue`, `app/pages/notifications.vue`.
- `app/composables/useSeoMeta.ts` (or per-page `useSeoMeta()` calls — Nuxt has this built in, confirm usage pattern when detail-planning).
- `server/routes/sitemap.xml.ts` (Nuxt server route generating the sitemap from published articles via the api).
- Audit pass across all existing pages from Phases 1–4 to add missing loading/error/empty states — list the specific pages when detail-planning, don't leave as a vague "audit everything" task.

## Done when

- A user is notified in-app when someone follows them, claps, or comments on their article; article and profile pages have correct SEO meta tags and a working sitemap; the app is usable on mobile.
