# Phase 1b — Google OAuth & Cloudinary Avatar Upload (Deferred Roadmap)

> This is a roadmap, not a code-complete implementation plan. It was split out of `plans/phase-1-auth-profile.md` because both features need external credentials the project didn't have yet (Google Cloud OAuth client, Cloudinary account). Before starting this phase, get those credentials, then run **superpowers:writing-plans** to produce a bite-sized, code-complete plan grounded in the actual `AuthModule`/`UsersModule` code that Phase 1a produced.

## Goal

Users can sign up/log in with Google, and upload a real avatar image instead of leaving `avatarUrl` empty.

## Scope (from docs/features.md §1–2)

- Google OAuth signup & login (account is created/matched by email; if a `User` row already exists for that email with a password, link the Google identity to it rather than erroring).
- Avatar upload on the edit-profile page, via Cloudinary signed upload from the backend (not unsigned client-side upload — see docs/architecture.md's Auth & Security section).

## Prerequisites (manual, one-time, external)

- A Google Cloud project with an OAuth 2.0 Client ID configured (authorized redirect URI pointing at `apps/api`'s callback route once that route exists), giving `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
- A Cloudinary account, giving `CLOUDINARY_URL` (or separate cloud name/API key/API secret).

## Expected new/changed files (sketch — finalize when writing the real plan)

**apps/api**
- `src/auth/google.strategy.ts` — Passport `GoogleStrategy`, plus a `GET /auth/google` + `GET /auth/google/callback` pair on `AuthController`.
- `AuthService` gains a method to find-or-create a user from a verified Google profile (email, name) — reuses `UsersService.findByEmail`/`create` from Phase 1a, but `create` needs a variant that allows a null `passwordHash` (Phase 1a's schema already supports this; Phase 1a's `AuthService.signup` always sets a hash since it's the password path).
- `src/cloudinary/cloudinary.service.ts` — wraps generating a signed upload signature; `UsersController` gains an endpoint to request a signed upload (or to receive the resulting URL and persist it via the existing `updateProfile`).

**apps/web**
- A "Continue with Google" link/button on `signup.vue`/`login.vue` pointing at `${apiBase}/auth/google`.
- An avatar file input on `settings/profile.vue`, uploading directly to Cloudinary with the signed params from the backend, then sending the resulting URL to `PATCH /users/me` (Phase 1a's existing endpoint already accepts arbitrary profile updates — confirm whether `avatarUrl` needs to be added to `UpdateProfileDto` when writing the real plan, since Phase 1a's DTO only has `name`/`bio`).

## Done when

- A user can sign up/log in via "Continue with Google" with no password ever set, and can upload a real avatar image that shows up on their public profile page.
