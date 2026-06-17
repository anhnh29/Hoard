# Phase 1 — Auth & User Profile (Roadmap)

> This is a roadmap, not a code-complete implementation plan. Before starting this phase, run the **superpowers:writing-plans** skill again to produce a bite-sized, code-complete plan grounded in the actual code Phase 0 produced (real file paths, real `PrismaService`/module names, real `HealthStatus`-style shared types) rather than code guessed ahead of time. See [docs/architecture.md](../docs/architecture.md) and [docs/features.md](../docs/features.md) for the decisions this phase must follow.

## Goal

Users can sign up, log in (email/password and Google), log out, and manage a public profile page.

## Scope (from docs/features.md §1–2)

- Email/password signup & login.
- Google OAuth signup & login.
- Logout (refresh token invalidated).
- JWT access token (15 min) + httpOnly refresh token cookie (7 days).
- Rate limiting on auth endpoints.
- Public profile page `/@username`.
- Edit-profile page (name, bio, avatar via Cloudinary).

## Expected new/changed files

**apps/api**
- `prisma/schema.prisma` — add `User` model (id, email, passwordHash?, name, username, avatarUrl?, bio?, createdAt).
- `prisma/migrations/<ts>_add_user/` — generated migration.
- `src/auth/` — `auth.module.ts`, `auth.controller.ts`, `auth.service.ts`, `local.strategy.ts`, `google.strategy.ts`, `jwt.strategy.ts`, `jwt-auth.guard.ts`, DTOs (`signup.dto.ts`, `login.dto.ts`).
- `src/users/` — `users.module.ts`, `users.controller.ts`, `users.service.ts`.
- `src/cloudinary/` — upload service wrapper.
- `.env` additions: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CLOUDINARY_URL`.

**apps/web**
- `app/pages/signup.vue`, `app/pages/login.vue`.
- `app/pages/[username].vue` — public profile.
- `app/pages/settings/profile.vue` — edit profile.
- `app/stores/auth.ts` — Pinia store (current user, login/logout actions).
- `app/composables/useApi.ts` — authenticated `$fetch` wrapper attaching the access token, refreshing on 401.

**packages/shared**
- `src/user.ts` — `User`, `PublicProfile` types + Zod schemas for signup/login payloads, reused by both apps' validation.

## Key decisions already locked (do not re-litigate)

- Passport `LocalStrategy` + `GoogleStrategy`, JWT via `@nestjs/jwt`, guard-based route protection.
- bcrypt for password hashing.
- `@nestjs/throttler` on `/auth/*` routes.
- Cloudinary for avatar upload (signed upload from the backend, not unsigned client-side).

## Done when

- A new user can sign up with email/password or Google, see their profile at `/@username`, edit their avatar/bio, and log out — verified manually and via Playwright e2e.
