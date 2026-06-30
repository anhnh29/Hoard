# Phase 3 — Feed & Discovery Design

## Context

Phase 2 delivered the editor, publishing, reading, and tag pages. The home page is currently a placeholder. Phase 3 replaces it with a real Explore feed and adds full-text article search.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Following tab | Deferred to Phase 4 | Requires `Follow` model; build alongside follow/unfollow UI rather than as a stub |
| Feed pagination | Cursor-based, "Load more" button | Infinite scroll has edge cases (scroll jitter, back-navigation); Load more is simpler and testable |
| Search pagination | None (top 20 results) | Relevance-ranked results don't paginate cleanly with cursors; 20 results sufficient for MVP |
| Search placement | Global nav input | Most discoverable; submits to `/search?q=...` |
| Feed visibility | Public | Published articles are already public at `/@username/slug`; no reason to hide the feed |

## Scope

- **Explore feed** — home page (`/`) shows all published articles, newest first, with cursor-based Load more
- **Full-text search** — nav bar input + `/search` results page, Postgres full-text on title + excerpt
- Out of scope: Following tab, infinite scroll, search pagination, external search service

## API

### `GET /feed`

New module: `apps/api/src/feed/` (`feed.module.ts`, `feed.controller.ts`, `feed.service.ts`).

**Query params:** `cursor` (ISO 8601 `publishedAt` of last seen article, optional), `limit` (default 10, max 20).

**Auth:** None — public endpoint.

**Response:**
```typescript
// packages/shared/src/article.ts (new)
export interface PaginatedArticles {
  articles: ArticleListItem[];
  nextCursor: string | null;
}
```

**Pagination logic:** fetch `limit + 1` articles with `publishedAt < cursor` (or all if no cursor), `ORDER BY publishedAt DESC`. If `limit + 1` rows come back, there is a next page — return the first `limit` rows and set `nextCursor` to the `publishedAt` of the last returned article. If `limit` or fewer rows come back, `nextCursor` is `null`.

**Prisma query (in FeedService):**
```typescript
const articles = await this.prisma.article.findMany({
  where: {
    status: 'PUBLISHED',
    ...(cursor ? { publishedAt: { lt: new Date(cursor) } } : {}),
  },
  orderBy: { publishedAt: 'desc' },
  take: limit + 1,
  include: ARTICLE_LIST_INCLUDE,
});
const hasNext = articles.length > limit;
const page = hasNext ? articles.slice(0, limit) : articles;
return {
  articles: page.map(toArticleListItem),
  nextCursor: hasNext ? page[page.length - 1].publishedAt!.toISOString() : null,
};
```

---

### `GET /search`

New module: `apps/api/src/search/` (`search.module.ts`, `search.controller.ts`, `search.service.ts`).

**Query params:** `q` (search query string, required, min 1 char).

**Auth:** None — public endpoint.

**Response:** `ArticleListItem[]` (top 20 results, ranked by relevance).

**Query:** Inline Postgres full-text against `title` + `excerpt` using `plainto_tsquery` (safe — does not require query syntax knowledge from the user):
```sql
SELECT <article columns + author + tags>
FROM "Article" a
JOIN "User" u ON u.id = a."authorId"
WHERE a.status = 'PUBLISHED'
  AND to_tsvector('english', coalesce(a.title, '') || ' ' || coalesce(a.excerpt, ''))
      @@ plainto_tsquery('english', $1)
ORDER BY ts_rank(
  to_tsvector('english', coalesce(a.title, '') || ' ' || coalesce(a.excerpt, '')),
  plainto_tsquery('english', $1)
) DESC
LIMIT 20
```

Run via Prisma `$queryRaw`. Tags are fetched in a second query for the returned article IDs (avoids complex raw SQL join).

Empty `q` returns 400. Missing `q` returns 400.

---

## Schema & Data

No new models. One Prisma migration adds a GIN expression index for search performance:

```sql
CREATE INDEX "Article_search_idx" ON "Article"
USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(excerpt, '')));
```

No stored `tsvector` column — inline expression is correct and the GIN index makes it fast for MVP volumes.

## Shared Types

Add to `packages/shared/src/article.ts`:

```typescript
export interface PaginatedArticles {
  articles: ArticleListItem[];
  nextCursor: string | null;
}
```

Export from `packages/shared/src/index.ts` (already re-exports everything from `article.ts`).

## Frontend

### Nav search bar (`apps/web/app/layouts/default.vue`)

A search `<form>` with a text `<input>` added to both the logged-in and logged-out nav states, between the existing right-side links and the auth controls. On submit (`@submit.prevent`), calls `navigateTo('/search?q=' + encodeURIComponent(query))` where `query` is the input's v-model. Always visible — no toggle/icon pattern.

```vue
<form @submit.prevent="navigateTo(`/search?q=${encodeURIComponent(searchQuery)}`)">
  <input v-model="searchQuery" type="search" placeholder="Search..." class="..." />
</form>
```

Tailwind classes: `rounded-full border border-border px-3 py-1 text-sm text-ink placeholder:text-ink-light focus:outline-none focus:border-accent w-40`.

### Home page (`apps/web/app/pages/index.vue`)

Replaces the placeholder. Uses a new composable `useFeed()`.

**`apps/web/app/composables/useFeed.ts`:**
```typescript
export function useFeed() {
  const { apiBase } = useRuntimeConfig().public;
  const articles = ref<ArticleListItem[]>([]);
  const nextCursor = ref<string | null>(null);
  const loading = ref(false);

  async function loadMore() {
    loading.value = true;
    const url = nextCursor.value
      ? `${apiBase}/feed?cursor=${encodeURIComponent(nextCursor.value)}`
      : `${apiBase}/feed`;
    const data = await $fetch<PaginatedArticles>(url);
    articles.value.push(...data.articles);
    nextCursor.value = data.nextCursor;
    loading.value = false;
  }

  return { articles, nextCursor, loading, loadMore };
}
```

**Template:** calls `loadMore()` on mount (`onMounted`), renders `<ArticleCard>` list, shows "Load more" button when `nextCursor !== null`, shows "No articles yet" when `articles.length === 0 && !loading`.

### Search page (`apps/web/app/pages/search.vue`)

Reads `route.query.q`. On mount and whenever `q` changes (`watch`), fetches `GET /search?q=<q>` via `useApi`. Renders `ArticleCard` list, "No results for '...'" empty state, or a loading skeleton (simple `text-ink-light` "Searching..." text). Has its own search input pre-filled with current `q` that submits to the same `/search?q=` route (allows query refinement without going back to the nav).

## Error & Empty States

| Scenario | Behavior |
|---|---|
| Feed — no published articles | "No articles yet." centered text |
| Feed — load more fails | Error text below the list, button still visible to retry |
| Search — empty `q` | Redirect to `/` (no search performed) |
| Search — no results | "No results for '...'" |
| Search — fetch error | "Search failed. Try again." |

## Testing

- `FeedService` unit tests: empty DB returns `{ articles: [], nextCursor: null }`; 11 articles returns first 10 + valid cursor; cursor returns next page.
- `SearchService` unit tests: mock `$queryRaw` — matching title returns result; non-matching returns empty array; empty `q` throws.
- `useFeed` composable: Vitest unit test — mock `$fetch`, verify articles accumulate across two `loadMore()` calls, verify `nextCursor` clears when null returned.
- No new visual regression tests — `ArticleCard` rendering is already covered by Phase 2 unit tests.

## Out of Scope

- Following tab (Phase 4 with Follow model)
- Infinite scroll
- Search pagination
- External search service
- SEO meta tags / Open Graph (Phase 6)
