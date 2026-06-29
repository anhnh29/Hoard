# Medium-Style UI Design

## Context

Hoard's frontend (`apps/web`) currently has zero visual design — every page is bare semantic HTML (browser-default form controls, unstyled links, no spacing/typography/color system). `docs/architecture.md` originally planned "Nuxt UI v3 + Tailwind CSS" for this, but neither was ever installed.

This spec covers restyling the entire existing frontend to look and feel like medium.com, before Phase 3 ("Feed & Discovery") adds new functionality on top. It is a pure presentation-layer change: no backend changes, no new API endpoints, no schema changes.

## Decisions

These were settled through brainstorming with the user:

| Decision | Choice |
|---|---|
| Styling system | Tailwind CSS only, hand-built custom components — no Nuxt UI or other component library, for full control over matching Medium's specific look |
| Global nav | Add one (none exists today) — logo, conditional Write/auth links, avatar |
| Typography | Serif (article titles + body) / sans (everything else) split, matching Medium's signature typographic identity |
| Color palette | Faithful to Medium's actual palette (white background, near-black text, Medium green accent) rather than a custom accent color |
| Dark mode | Out of scope — light mode only for this pass |
| Search bar | Omitted entirely — no backend search endpoint exists yet; a fake/dead search box would be worse than no search box. Phase 3 adds a real one. |
| Home page (`/`) | A minimal placeholder page is created so the nav's logo link isn't broken. Its content is explicitly throwaway — Phase 3 replaces it with a real feed — but the page shell/layout this spec establishes is reused. |

## Visual Language

- **Colors:** background `#FFFFFF`; primary text `#242424`; secondary/metadata text `#6B6B6B`; accent `#1A8917` (primary buttons, link hover state, active/selected tag); hairline borders/dividers `#E5E5E5`.
- **Typography:**
  - Serif (article titles, article body content only): **Source Serif 4** (weights 400/600/700).
  - Sans (everything else — nav, buttons, forms, bylines, metadata, headings outside article content): **Inter** (weights 400/500/600/700).
- **Reading measure:** article body content capped at a max-width of ~680px — Medium's narrow column for comfortable line length. Other pages use wider, more conventional max-widths.
- **Spacing & radius:** Tailwind's default spacing scale; generous vertical rhythm between sections (matching Medium's whitespace-heavy feel); 4–6px border radius on cards/buttons/inputs; fully circular avatars.
- **Icons:** no icon library dependency. The only icon needed is a pencil glyph for the "Write" nav link — implemented as one inline SVG.

## Global Layout

New `apps/web/app/layouts/default.vue`, applied to all pages:

- **Header:** persistent, 1px bottom border (`#E5E5E5`), white background.
  - Left: serif "Hoard" wordmark, links to `/`.
  - Right, logged out (`auth.user` is null): "Sign in" link (→ `/login`) + "Get started" button (→ `/signup`).
  - Right, logged in: "Write" link with pencil icon (→ `/write`) + circular avatar (→ the current user's own profile, `/@<own-username>`). No dropdown menu — avatar is a direct link, since there's nothing yet to put in a dropdown beyond what the profile page already offers.
- **Footer:** none. There's no legal/about/help content to populate one with yet; an empty or link-free footer would just be visual noise.
- **Cross-page connectivity fix:** the public profile page (`@[username]/index.vue`), when viewing your own profile, gains an "Edit profile" link to `/settings/profile` — today nothing links between these two pages.

## Shared Components (`apps/web/app/components/ui/`)

- `Button.vue` — primary (solid accent), secondary (outline), and text/link variants.
- `Input.vue`, `Textarea.vue` — consistent border, padding, and focus-ring treatment for all forms (login, signup, profile settings, tag input).
- `Avatar.vue` — circular image with initials fallback when no avatar URL is set.
- `TagPill.vue` — rounded pill, shared by the write page's tag picker, the reading page's tag links, and the tag listing page's heading context.
- `ArticleCard.vue` — title (serif), excerpt, byline row (avatar + name + reading time + date), optional thumbnail. Used on the tag listing page and the new home placeholder.

These replace duplicated ad-hoc markup across pages, but introduce no new behavior — they're pure presentation wrappers around data the pages already fetch.

## Page-by-Page Treatment

| Page | Treatment |
|---|---|
| `login.vue` | Centered card (~400px wide), serif "Log in" heading, `Input` fields, primary `Button`, Google OAuth as a secondary `Button`. |
| `signup.vue` | Same card pattern as login, serif "Sign up" heading, four `Input` fields. |
| `oauth/callback.vue` | Centered status text only (loading/error) — no structural change, just typography. |
| `settings/profile.vue` | `Avatar` + upload control, `Input` (name) + `Textarea` (bio), primary `Button` to save, text-style logout button. |
| `write/index.vue` | Brief centered loading state ("Creating a new draft..."), styled typography only — no structural change. |
| `write/[id].vue` | Borderless serif title input (placeholder "Title"); thin divider; Tiptap editor content styled to match the reading page's serif body typography; tag picker built from `TagPill` + an `Input`; cover image upload as a styled clickable area. The layout's header exposes a named slot for page-specific actions; this page fills it with its existing publish/unpublish button (from Phase 2a) instead of showing the default "Write" link, since you're already on the write page. |
| `@[username]/index.vue` | Large `Avatar`, serif name heading, sans @handle + bio below; "Edit profile" link shown only when viewing your own profile. |
| `@[username]/[slug].vue` | Apply the serif/sans split and the 680px reading column to the existing structure (cover image, byline, tag links, `v-html` content) — no structural/data changes. |
| `tag/[slug].vue` | Serif "#TagName" heading; list of `ArticleCard`s; existing empty/not-found states restyled, not restructured. |
| `index.vue` (**new**) | Minimal centered welcome message + CTA (sign up/log in when logged out; a link to write or to your profile when logged in). Explicitly throwaway content, reused shell. |
| `health.vue` | Left as-is, unstyled. Internal diagnostic page, not user-facing. |

## Implementation Strategy

1. Install and configure Tailwind CSS in `apps/web` (`nuxt.config.ts`, Tailwind config with the color/font tokens above).
2. Add Source Serif 4 + Inter (via `@nuxt/fonts` or static Google Fonts `<link>` tags — implementer's choice, whichever integrates more simply with Nuxt 4's SSR).
3. Build the shared `ui/` components.
4. Build the global layout (`layouts/default.vue`) with auth-state-aware nav, wired to the existing Pinia auth store — no new store logic needed.
5. Build the new home placeholder page.
6. Restyle each existing page in turn, reusing the shared components, in the order listed in the table above.
7. Manual Playwright (real-browser) verification per page — same test policy already established in Phase 2a/2b for frontend work. No new automated visual-regression tooling; this is a markup/CSS change with no new business logic to unit-test.

## Out of Scope

- Dark mode.
- Search (no backend endpoint exists; Phase 3).
- Notifications (no feature exists).
- Any backend/API/schema change.
- A real home feed (Phase 3 replaces the placeholder).
- Avatar dropdown menu / multi-item account menu.
- A site footer.
