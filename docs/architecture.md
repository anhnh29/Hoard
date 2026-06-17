# Hoard — Architecture & Tech Stack

Hoard is a Medium-style publishing platform: write, publish, follow, clap, comment, search. This document records the architecture decisions for the MVP and the reasoning behind them.

## Goals & non-goals

- **Goal:** MVP for a real product with a long-term growth path, free for all users.
- **Non-goals (deferred, not in MVP):** paid membership/paywall, organization "Publications" (multi-writer outlets), real-time notifications, third-party search engine (Algolia/Meilisearch).

## High-level architecture

Two deployable apps in one monorepo, talking over REST:

```
apps/web  (Nuxt 4, SSR)  --HTTP-->  apps/api  (NestJS)  --Prisma-->  PostgreSQL (Neon)
                                          |
                                          +--> Cloudinary (image upload/transform)
```

Frontend and backend are deliberately separate processes (not a single Nuxt/Nitro monolith) so the API has its own lifecycle, scaling, and deploy target independent of the web app.

## apps/web (Nuxt 4)

- **Framework:** Nuxt 4, SSR mode — needed for SEO on article/profile pages.
- **UI:** Nuxt UI v3 + Tailwind CSS — official Nuxt component set, accessible by default, themeable.
- **State:** Pinia.
- **Editor:** Tiptap (ProseMirror-based, headless) for the article WYSIWYG editor — closest to Medium's writing experience without building a rich-text engine from scratch.
- **Forms/validation:** VeeValidate + Zod, using schemas from `packages/shared` where the shape is also validated server-side.
- **API access:** typed `$fetch` wrappers against `apps/api`, base URL via `NUXT_PUBLIC_API_BASE`.

## apps/api (NestJS)

- **Framework:** NestJS — module/controller/service structure, built-in DI, guards, pipes. Chosen over bare Express because the project is meant to grow past a single contributor.
- **ORM:** Prisma — best TypeScript DX, migrations, Prisma Studio for inspecting data. Chosen over TypeORM (weaker type safety) and Drizzle (less NestJS-idiomatic, more manual wiring).
- **Database:** PostgreSQL hosted on Neon (serverless Postgres, scale-to-zero, generous free tier).
- **Validation:** class-validator + class-transformer on DTOs (NestJS-native).
- **API docs:** Swagger/OpenAPI generated from Nest decorators, served at `/api/docs`.

### Auth & security

- Passport.js inside NestJS: `LocalStrategy` for email/password, `GoogleStrategy` for Google OAuth.
- JWT access token (15 min expiry) + refresh token (7 days, httpOnly cookie). `JwtAuthGuard` protects authenticated routes.
- Passwords hashed with bcrypt.
- `@nestjs/throttler` rate-limits auth endpoints (login, signup, refresh).
- `helmet` for security headers; CORS restricted to the web app's origin.

### Search

- PostgreSQL full-text search (`tsvector` generated column on `Article`, GIN index) for MVP. No external search service — re-evaluate only if relevance/scale becomes a real problem.

## packages/shared

TypeScript types, Zod schemas, and DTO shapes shared between `apps/web` and `apps/api`, so the two apps can't silently drift apart on a field name or type even though they're separate processes/deploys.

## Monorepo tooling

- **pnpm workspaces** (already scaffolded via `pnpm-workspace.yaml`) for package management across `apps/*` and `packages/*`.
- **Turborepo** for task orchestration — `turbo dev` runs web+api together, `turbo build`/`turbo lint`/`turbo test` cache per-package.

## Infrastructure

| Concern | Choice | Why |
|---|---|---|
| Database | Neon (Postgres) | Serverless, scale-to-zero, works from any host |
| API hosting | Railway | Long-running Node process — NestJS doesn't fit serverless functions well (cold start, bootstrap cost) |
| Web hosting | Vercel | First-class Nuxt SSR support, preview deployments, CDN |
| Image storage | Cloudinary | Automatic resize/format optimization for cover images & avatars |

## Data model (MVP entities)

```
User       — id, email, passwordHash?, name, username (unique), avatarUrl, bio
Article    — id, title, slug (unique), content (Tiptap JSON), coverImageUrl, excerpt,
             status (draft|published), authorId -> User, publishedAt, readingTime, searchVector
Tag        — id, name (unique), slug
ArticleTag — articleId, tagId (join table)
Follow     — followerId -> User, followeeId -> User (composite unique)
Clap       — userId -> User, articleId -> Article, count
Comment    — id, content, authorId -> User, articleId -> Article, parentId? (1-level reply)
Bookmark   — userId -> User, articleId -> Article (composite unique)
Notification — id, recipientId -> User, type (new_follower|clap|comment), payload, isRead, createdAt
```

## Testing strategy

- **apps/api:** Jest (Nest default) — unit tests per service, integration tests against a dedicated test database through Prisma.
- **apps/web:** Vitest + Vue Testing Library for components; Playwright for end-to-end coverage of the core flow (sign up → write → publish → another user reads/claps/comments).

## Feature phasing

See [features.md](features.md) for the full feature brief, and `plans/` for the phase-by-phase implementation plans:

- Phase 0 — Setup & infrastructure
- Phase 1 — Auth & user profile
- Phase 2 — Write & publish articles
- Phase 3 — Feed & discovery
- Phase 4 — Social interactions (follow, clap, comment, bookmark)
- Phase 5 — Notifications & polish
- Phase 6 — Production hardening & launch
