# Hoard — Feature Brief (MVP)

This is the complete list of user-facing functionality planned for the MVP, grouped by area. For the tech stack behind these features, see [architecture.md](architecture.md). For how these features are sequenced into build phases, see `plans/`.

Explicitly **out of scope** for this MVP: paid membership/paywall, organization "Publications" (multi-writer outlets with editor roles), real-time push notifications, third-party search.

## 1. Authentication & Account

- Sign up / log in with email + password.
- Sign up / log in with Google OAuth.
- Log out (invalidates refresh token).
- Session persists via short-lived access token + httpOnly refresh token cookie.
- Auth endpoints are rate-limited to resist brute force.

## 2. Profile

- Public profile page at `/@username`: avatar, display name, bio, list of the user's published articles.
- Edit-profile page: change name, bio, avatar (uploaded via Cloudinary).
- Username is unique and used in profile URLs and article URLs.

## 3. Writing & Publishing

- Rich-text editor (Tiptap) supporting: bold, italic, headings, lists, blockquote, code block, inline images, links.
- Autosave draft while writing.
- Publish / unpublish an article; unpublished articles are only visible to their author.
- Slug auto-generated from the title, unique per article.
- Cover image upload for an article.
- Estimated reading time, computed from content length.
- Attach one or more tags to an article (pick existing tag or create a new one).

## 4. Reading

- Article reading view: title, cover image, author byline (links to profile), rendered content, reading time, tags, publish date.
- Tag page (`/tag/:slug`) listing all published articles under that tag.

## 5. Feed & Discovery

- Home feed with two tabs:
  - **Following** — articles from authors the current user follows, newest first.
  - **Explore** — all published articles, newest first (or by tag if filtered).
- Full-text search across article title/content/tags (Postgres full-text search).

## 6. Social Interactions

- **Follow / unfollow** another user.
- **Clap** an article — a logged-in user can clap multiple times on the same article up to a per-user-per-article cap (mirrors Medium's repeatable-clap mechanic).
- **Comment** on an article, with one level of replies ("responses" in Medium's terms — no deeply nested threads in MVP).
- **Bookmark** an article; a personal "Reading list" page shows all of a user's bookmarks.

## 7. Notifications

- In-app notification list (not push/real-time) for: new follower, new clap on your article, new comment on your article.
- Mark notifications as read.

## 8. Cross-cutting / quality requirements

- SEO: per-page meta tags, Open Graph tags, sitemap, server-rendered article/profile pages.
- Responsive layout (mobile + desktop).
- Defined loading, error, and empty states for every page that fetches data.
- Pagination or infinite scroll on feed and search results.
