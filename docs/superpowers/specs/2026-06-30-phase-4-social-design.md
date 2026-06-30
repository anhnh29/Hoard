# Phase 4 — Social Interactions Design

## Context

Phase 3 delivered the Explore feed and full-text search. The home feed has one tab (Explore); the Following tab was explicitly deferred. Phase 4 completes the social layer: follow/unfollow (enabling the Following tab), claps, comments, and bookmarks.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | All 4 features in one phase | Prisma migration is shared; avoids a second schema churn |
| Clap cap | 10 per user per article | Expressive but bounded; enforced server-side via upsert |
| Following tab empty state | Fall back to Explore | No awkward empty state; Explore is always useful |
| Comments placement | Always visible below article | No extra click to see responses |
| Bookmark button placement | Article page + feed cards | Bookmark without opening the article |

## Scope

- Follow / unfollow another user
- Following tab in the home feed (auth-required; falls back to Explore if no follows)
- Clap an article — up to 10 claps per user per article
- Comment on an article with one level of replies; delete own comments
- Bookmark an article; personal Reading list page at `/reading-list`

Out of scope: notifications (Phase 5), real-time updates, edit comments, report/flag content.

---

## Schema

One migration adds four models. User and Article gain corresponding relation fields.

```prisma
model Follow {
  id          String   @id @default(uuid())
  follower    User     @relation("Following", fields: [followerId], references: [id], onDelete: Cascade)
  followerId  String
  following   User     @relation("Followers", fields: [followingId], references: [id], onDelete: Cascade)
  followingId String
  createdAt   DateTime @default(now())

  @@unique([followerId, followingId])
}

model Clap {
  id        String  @id @default(uuid())
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    String
  article   Article @relation(fields: [articleId], references: [id], onDelete: Cascade)
  articleId String
  count     Int     @default(0)

  @@unique([userId, articleId])
}

model Comment {
  id        String    @id @default(uuid())
  content   String
  author    User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  authorId  String
  article   Article   @relation(fields: [articleId], references: [id], onDelete: Cascade)
  articleId String
  parent    Comment?  @relation("Replies", fields: [parentId], references: [id], onDelete: Cascade)
  parentId  String?
  replies   Comment[] @relation("Replies")
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model Bookmark {
  id        String   @id @default(uuid())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    String
  article   Article  @relation(fields: [articleId], references: [id], onDelete: Cascade)
  articleId String
  createdAt DateTime @default(now())

  @@unique([userId, articleId])
}
```

**User additions:**
```prisma
following     Follow[]  @relation("Following")
followers     Follow[]  @relation("Followers")
claps         Clap[]
comments      Comment[]
bookmarks     Bookmark[]
```

**Article additions:**
```prisma
claps         Clap[]
comments      Comment[]
bookmarks     Bookmark[]
```

---

## Shared Types

Add to `packages/shared/src/social.ts` (new file), re-exported from `packages/shared/src/index.ts`:

```typescript
export interface FollowStatus {
  isFollowing: boolean;
}

export interface ClapStatus {
  totalClaps: number;
  userClaps: number;
}

export interface CommentItem {
  id: string;
  content: string;
  author: {
    username: string;
    name: string;
    avatarUrl: string | null;
  };
  createdAt: string;
  replies: CommentItem[];
}

export interface BookmarkStatus {
  isBookmarked: boolean;
}
```

---

## API

### FollowsModule — `apps/api/src/follows/`

All endpoints require `JwtAuthGuard`.

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/follows/:username` | — | `FollowStatus` |
| `DELETE` | `/follows/:username` | — | `204 No Content` |
| `GET` | `/follows/:username/status` | — | `FollowStatus` |

- `POST` is idempotent (upsert). If user tries to follow themselves → `400 BadRequest`.
- `DELETE` silently succeeds if not following.

### ClapsModule — `apps/api/src/claps/`

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| `GET` | `/articles/:slug/claps` | None | — | `ClapStatus` |
| `POST` | `/articles/:slug/claps` | Required | `{ count: 1 }` | `ClapStatus` |

- `GET` returns `{ totalClaps, userClaps: 0 }` for unauthenticated requests.
- `POST` upserts `Clap` record, incrementing `count` by 1. If `count` would exceed `CLAP_CAP = 10` → `400 BadRequest`. Returns updated totals.
- `totalClaps` = `_sum.count` across all Clap records for the article.

### CommentsModule — `apps/api/src/comments/`

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| `GET` | `/articles/:slug/comments` | None | — | `CommentItem[]` |
| `POST` | `/articles/:slug/comments` | Required | `{ content: string }` | `CommentItem` |
| `POST` | `/articles/:slug/comments/:commentId/replies` | Required | `{ content: string }` | `CommentItem` |
| `DELETE` | `/comments/:commentId` | Required | — | `204 No Content` |

- `GET` returns top-level comments (where `parentId IS NULL`) ordered by `createdAt ASC`, each with `replies` array (also ordered by `createdAt ASC`).
- `POST` reply sets `parentId` to `:commentId`. Replies cannot themselves have replies (one level only — enforced by checking the parent's `parentId IS NULL`; if not, return `400`).
- `DELETE` verifies `comment.authorId === req.user.id`; otherwise `403 Forbidden`. Deleting a top-level comment cascades to delete its replies.
- Empty `content` (after `.trim()`) → `400 BadRequest`.

### BookmarksModule — `apps/api/src/bookmarks/`

All write endpoints require `JwtAuthGuard`.

| Method | Path | Auth | Response |
|---|---|---|---|
| `POST` | `/bookmarks/:slug` | Required | `BookmarkStatus` |
| `DELETE` | `/bookmarks/:slug` | Required | `204 No Content` |
| `GET` | `/bookmarks/:slug/status` | Required | `BookmarkStatus` |
| `GET` | `/bookmarks` | Required | `PaginatedArticles` |

- `POST` is idempotent (upsert).
- `GET /bookmarks` returns articles bookmarked by the current user, ordered by bookmark `createdAt DESC`, cursor-based pagination (same `PaginatedArticles` type, same `limit=10 / max=20` defaults as `/feed`). Cursor = ISO 8601 string of `Bookmark.createdAt`.

### FeedModule changes — `apps/api/src/feed/`

Add to `FeedController`:

| Method | Path | Auth | Response |
|---|---|---|---|
| `GET` | `/feed/following` | Required | `PaginatedArticles` |

Add to `FeedService`:

```typescript
async findFollowingPage(userId: string, cursor?: string, limit?: number): Promise<PaginatedArticles>
```

- Fetches IDs of users that `userId` follows.
- If following list is empty → delegates to `findPage(cursor, limit)` (Explore fallback).
- Otherwise: same cursor-based query as `findPage` but adds `where: { authorId: { in: followingIds } }`.

---

## Frontend

### New Composables (`apps/web/app/composables/`)

**`useFollowingFeed(apiBase, accessToken, onRefresh)`**
- Same return shape as `useFeed`: `{ articles, nextCursor, loading, error, loadMore }`
- Calls `GET /feed/following` via `useApi` (passes Bearer token)

**`useFollow(apiBase, username, accessToken, onRefresh)`**
- Returns `{ isFollowing: Ref<boolean>, loading: Ref<boolean>, toggle: () => Promise<void> }`
- On mount: fetches `GET /follows/:username/status`
- `toggle()`: calls `POST` or `DELETE` based on current state; optimistically flips `isFollowing`

**`useClaps(apiBase, slug, accessToken, onRefresh)`**
- Returns `{ totalClaps: Ref<number>, userClaps: Ref<number>, loading: Ref<boolean>, clap: () => Promise<void> }`
- On mount: fetches `GET /articles/:slug/claps`
- `clap()`: no-op if `userClaps.value >= 10`; otherwise calls `POST /articles/:slug/claps` with `{ count: 1 }` and updates both refs

**`useBookmark(apiBase, slug, accessToken, onRefresh)`**
- Returns `{ isBookmarked: Ref<boolean>, loading: Ref<boolean>, toggle: () => Promise<void> }`
- On mount: fetches `GET /bookmarks/:slug/status`
- `toggle()`: calls `POST` or `DELETE`; optimistically flips `isBookmarked`

### New Components (`apps/web/app/components/ui/`)

**`FollowButton.vue`**
- Props: `username: string`
- Uses `useFollow`; button text "Follow" / "Following"; disabled while `loading`
- Only rendered when `auth.user && auth.user.username !== username`

**`ClapButton.vue`**
- Props: `slug: string`
- Uses `useClaps`; shows clap icon + `totalClaps`; shows `userClaps/10` while logged in
- If not logged in: clicking navigates to `/login`
- Grays out and disables when `userClaps >= 10`

**`CommentThread.vue`**
- Props: `slug: string`
- Fetches `GET /articles/:slug/comments` on mount
- Renders top-level comments, each with author avatar/name/date, content, and a "Reply" button
- "Reply" button reveals an inline `<textarea>` + "Post reply" button
- Shows `CommentForm` at the top for new top-level comments (only if `auth.user`)
- "Delete" link visible only on the current user's own comments

**`BookmarkButton.vue`**
- Props: `slug: string`
- Uses `useBookmark`; bookmark icon (filled/outline); "Save" / "Saved" label
- Only rendered when `auth.user` is present

### Modified Pages

**`apps/web/app/pages/index.vue`**
- Add tab switcher above the feed: "Following" and "Explore" tabs
- "Following" tab only shown when `auth.user` is present
- Following tab: uses `useFollowingFeed`; same `ArticleCard` list + "Load more" pattern
- Explore tab: existing `useFeed` (unchanged)
- Default active tab: "Explore" for logged-out users; "Following" for logged-in users

**`apps/web/app/pages/@[username]/index.vue`**
- Add `<FollowButton :username="username" />` to the profile header, next to the user's name
- Only rendered when `auth.user && auth.user.username !== username`

**`apps/web/app/pages/@[username]/[slug].vue`**
- Below the byline line: add `<ClapButton :slug="slug" />` (left) and `<BookmarkButton :slug="slug" />` (right), in a flex row
- Below `<div class="prose-serif">`: add `<CommentThread :slug="slug" />`

### New Auth Middleware

**`apps/web/app/middleware/auth.ts`** (new file — created once, reused by any protected page):
```typescript
export default defineNuxtRouteMiddleware(() => {
  const auth = useAuthStore();
  if (!auth.user) {
    return navigateTo('/login');
  }
});
```

### New Page

**`apps/web/app/pages/reading-list.vue`**
- Route: `/reading-list`
- `definePageMeta({ middleware: 'auth' })` — redirects to `/login` if not authenticated
- Heading: "Reading list" (serif, same style as Explore)
- Fetches `GET /bookmarks` with cursor pagination; uses `ArticleCard` + "Load more" button
- Empty state: "Your reading list is empty."
- Each `ArticleCard` also shows `BookmarkButton` (so users can unbookmark directly from this page)

---

## Error & Empty States

| Scenario | Behavior |
|---|---|
| Follow self | `400` from API; button shows error toast (or stays unchanged) |
| Clap at cap | `clap()` no-ops client-side; button grayed out |
| Comment empty content | "Comment cannot be empty." inline validation, no API call |
| Delete someone else's comment | `403` from API; not reachable from UI (Delete button only shown for own comments) |
| Reading list empty | "Your reading list is empty." centered text |
| Following feed, no follows | Falls back to Explore silently (no empty state) |

---

## Testing

### API (Jest, mock PrismaService)

**FollowsService:**
- Follow a user → creates Follow record, returns `{ isFollowing: true }`
- Follow self → throws `BadRequestException`
- Unfollow → removes record (no error if record didn't exist)
- Status → returns correct boolean

**ClapsService:**
- First clap → creates Clap with count 1, returns correct totals
- Subsequent clap → increments count, returns updated totals
- 10th clap → increments to 10, succeeds
- 11th clap → throws `BadRequestException` (cap enforced)
- `totalClaps` sums across multiple users

**CommentsService:**
- Create top-level comment → sets `parentId: null`
- Create reply → sets `parentId` to parent's id
- Reply to a reply → throws `BadRequestException` (one level only)
- Delete own comment → removes record; cascades to replies
- Delete another user's comment → throws `ForbiddenException`

**BookmarksService:**
- Bookmark is idempotent (upsert)
- Unbookmark removes record
- Reading list returns `PaginatedArticles` ordered by `Bookmark.createdAt DESC`
- Cursor uses `Bookmark.createdAt` ISO string

**FeedService (additions):**
- `findFollowingPage` with follows → `where: { authorId: { in: [...] } }` in query
- `findFollowingPage` with no follows → delegates to `findPage` (Explore)

### Web (Vitest, stub `$fetch` / mock `useApi`)

**`useFollowingFeed`:** starts empty; `loadMore` appends; cursor passed on second call

**`useFollow`:** loads initial status; `toggle()` calls correct endpoint and flips `isFollowing`

**`useClaps`:** loads initial totals; `clap()` increments `userClaps` and `totalClaps`; `clap()` is no-op when `userClaps === 10`

**`useBookmark`:** loads initial status; `toggle()` calls correct endpoint and flips `isBookmarked`
