# Phase 3 — Feed & Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public Explore feed on the home page and a full-text article search with a nav-bar input, replacing the current home placeholder.

**Architecture:** Two new NestJS modules (`FeedModule`, `SearchModule`) add public REST endpoints. The frontend adds a `useFeed` composable consumed by the home page, a search form in the global nav, and a `/search` results page. Cursor-based pagination with a "Load more" button on the feed; top-20 relevance-ranked results for search (no pagination). Postgres GIN expression index makes search fast without a stored column.

**Tech Stack:** NestJS, Prisma (raw `$queryRaw` for search), Postgres full-text (`to_tsvector` / `plainto_tsquery`), Vue 3 / Nuxt 4, `$fetch`, Vitest.

## Global Constraints

- Public endpoints — no `@UseGuards(JwtAuthGuard)` on `GET /feed` or `GET /search`
- Cursor = ISO 8601 string of `publishedAt`; default page size = 10; max = 20
- Search uses `plainto_tsquery` (not `to_tsquery`) — no query syntax required from users
- Only published articles (`status = 'PUBLISHED'`) appear in feed or search results
- `$fetch` is the only HTTP client used in composables — no `useApi` (no auth needed for these endpoints)
- All new composables take `apiBase: string` as first param (same pattern as `useArticleAutosave`)
- No new shared components — `ArticleCard` from Phase 2 is reused as-is
- Explicit component imports in Vue pages/layouts (project convention: `import X from '~/components/ui/X.vue'`)
- Commit message format: `feat: <description>` (lowercase, imperative)

---

### Task 1: PaginatedArticles shared type + Feed API

**Files:**
- Modify: `packages/shared/src/article.ts`
- Create: `apps/api/src/feed/feed.service.ts`
- Create: `apps/api/src/feed/feed.service.spec.ts`
- Create: `apps/api/src/feed/feed.controller.ts`
- Create: `apps/api/src/feed/feed.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `ArticleListItem`, `ARTICLE_WITH_AUTHOR_INCLUDE`, `toArticleListItem`, `ArticleWithTagsAndAuthor` from `apps/api/src/articles/articles.mapper.ts`; `PrismaService` from `apps/api/src/prisma/prisma.service.ts`
- Produces: `PaginatedArticles` (shared type); `FeedService.findPage(cursor?, limit?)` returning `Promise<PaginatedArticles>`; `GET /feed?cursor=&limit=` endpoint

- [ ] **Step 1: Add `PaginatedArticles` to shared types**

In `packages/shared/src/article.ts`, add after the `ArticleListItem` interface (line 54):

```typescript
export interface PaginatedArticles {
  articles: ArticleListItem[];
  nextCursor: string | null;
}
```

- [ ] **Step 2: Rebuild shared package**

Run: `pnpm --filter @hoard/shared build`
Expected: `dist/` updated, no errors.

- [ ] **Step 3: Write the FeedService tests**

Create `apps/api/src/feed/feed.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { FeedService } from './feed.service';
import { PrismaService } from '../prisma/prisma.service';

const makeArticle = (publishedAt: Date, id = 'a1') => ({
  id,
  title: 'Hello',
  slug: 'hello',
  excerpt: 'Hi',
  coverImageUrl: null,
  readingTime: 1,
  publishedAt,
  tags: [{ tag: { name: 'vue', slug: 'vue' } }],
  author: { username: 'user', name: 'User', avatarUrl: null },
});

describe('FeedService', () => {
  let service: FeedService;
  const prismaMock = { article: { findMany: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [FeedService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get<FeedService>(FeedService);
  });

  it('returns empty list with null nextCursor when no articles exist', async () => {
    prismaMock.article.findMany.mockResolvedValue([]);
    const result = await service.findPage();
    expect(result).toEqual({ articles: [], nextCursor: null });
  });

  it('returns articles and null nextCursor when count is at or below limit', async () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    prismaMock.article.findMany.mockResolvedValue([makeArticle(date)]);
    const result = await service.findPage(undefined, 10);
    expect(result.articles).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it('returns limit articles and a nextCursor when more than limit exist', async () => {
    const articles = Array.from({ length: 11 }, (_, i) =>
      makeArticle(new Date(`2024-01-${String(11 - i).padStart(2, '0')}T00:00:00.000Z`), `a${i}`),
    );
    prismaMock.article.findMany.mockResolvedValue(articles);
    const result = await service.findPage(undefined, 10);
    expect(result.articles).toHaveLength(10);
    expect(result.nextCursor).not.toBeNull();
    expect(result.nextCursor).toBe(articles[9].publishedAt.toISOString());
  });

  it('passes cursor as publishedAt lt filter', async () => {
    prismaMock.article.findMany.mockResolvedValue([]);
    await service.findPage('2024-06-01T00:00:00.000Z');
    expect(prismaMock.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PUBLISHED',
          publishedAt: { lt: new Date('2024-06-01T00:00:00.000Z') },
        },
      }),
    );
  });

  it('queries without cursor filter when cursor is not provided', async () => {
    prismaMock.article.findMany.mockResolvedValue([]);
    await service.findPage();
    expect(prismaMock.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PUBLISHED' } }),
    );
  });
});
```

- [ ] **Step 4: Run tests to confirm they fail**

Run: `pnpm --filter @hoard/api test -- --testPathPattern=feed.service`
Expected: FAIL — "Cannot find module './feed.service'"

- [ ] **Step 5: Implement FeedService**

Create `apps/api/src/feed/feed.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import type { PaginatedArticles } from '@hoard/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  ARTICLE_WITH_AUTHOR_INCLUDE,
  toArticleListItem,
  type ArticleWithTagsAndAuthor,
} from '../articles/articles.mapper';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(cursor?: string, limit = DEFAULT_LIMIT): Promise<PaginatedArticles> {
    const take = Math.min(limit, MAX_LIMIT) + 1;
    const articles = await this.prisma.article.findMany({
      where: {
        status: 'PUBLISHED',
        ...(cursor ? { publishedAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { publishedAt: 'desc' },
      take,
      include: ARTICLE_WITH_AUTHOR_INCLUDE,
    });
    const hasNext = articles.length > limit;
    const page = hasNext ? articles.slice(0, limit) : articles;
    return {
      articles: page.map((a) => toArticleListItem(a as ArticleWithTagsAndAuthor)),
      nextCursor: hasNext ? (page[page.length - 1].publishedAt as Date).toISOString() : null,
    };
  }
}
```

- [ ] **Step 6: Run tests to confirm they pass**

Run: `pnpm --filter @hoard/api test -- --testPathPattern=feed.service`
Expected: PASS — 5 tests

- [ ] **Step 7: Implement FeedController and FeedModule**

Create `apps/api/src/feed/feed.controller.ts`:

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import type { PaginatedArticles } from '@hoard/shared';
import { FeedService } from './feed.service';

@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  findPage(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedArticles> {
    return this.feedService.findPage(cursor, limit ? Number(limit) : undefined);
  }
}
```

Create `apps/api/src/feed/feed.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
```

- [ ] **Step 8: Wire FeedModule into AppModule**

In `apps/api/src/app.module.ts`, add the import:

```typescript
import { FeedModule } from './feed/feed.module';
```

And add `FeedModule` to the `imports` array (after `ArticlesModule`):

```typescript
imports: [
  PrismaModule,
  ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
  UsersModule,
  AuthModule,
  TagsModule,
  ArticlesModule,
  FeedModule,
],
```

- [ ] **Step 9: Run full API test suite**

Run: `pnpm --filter @hoard/api test`
Expected: all tests pass (existing + 5 new FeedService tests).

- [ ] **Step 10: Smoke test the endpoint**

Start the API: `pnpm --filter @hoard/api start:dev`
Run: `curl http://localhost:3001/feed`
Expected: `{"articles":[],"nextCursor":null}` (or articles if DB has published ones)

- [ ] **Step 11: Commit**

```bash
git add packages/shared/src/article.ts \
  apps/api/src/feed/ \
  apps/api/src/app.module.ts
git commit -m "feat: add PaginatedArticles type and feed API endpoint"
```

---

### Task 2: Search API + GIN index migration

**Files:**
- Create: `apps/api/prisma/migrations/<timestamp>_add_article_search_index/migration.sql`
- Create: `apps/api/src/search/search.service.ts`
- Create: `apps/api/src/search/search.service.spec.ts`
- Create: `apps/api/src/search/search.controller.ts`
- Create: `apps/api/src/search/search.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `ARTICLE_WITH_AUTHOR_INCLUDE`, `toArticleListItem`, `ArticleWithTagsAndAuthor`
- Produces: `SearchService.search(q: string): Promise<ArticleListItem[]>`; `GET /search?q=` endpoint

- [ ] **Step 1: Create the migration for the GIN index**

Run from the repo root (Docker DB must be running — `docker compose up -d db`):

```bash
pnpm --filter @hoard/api exec prisma migrate dev --name add_article_search_index --create-only
```

Expected output: "The following migration(s) have been created and applied..." or "Created migration". A new directory appears at `apps/api/prisma/migrations/<timestamp>_add_article_search_index/`.

- [ ] **Step 2: Add the GIN index SQL to the migration**

Open `apps/api/prisma/migrations/<timestamp>_add_article_search_index/migration.sql` (the timestamp will be the current time). Replace the file content with:

```sql
CREATE INDEX "Article_search_idx" ON "Article"
USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(excerpt, '')));
```

- [ ] **Step 3: Apply the migration**

Run: `pnpm --filter @hoard/api exec prisma migrate dev`
Expected: "All migrations have been applied." The GIN index now exists in the DB.

- [ ] **Step 4: Write SearchService tests**

Create `apps/api/src/search/search.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SearchService', () => {
  let service: SearchService;
  const prismaMock = {
    $queryRaw: jest.fn(),
    article: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get<SearchService>(SearchService);
  });

  it('returns empty array when no articles match', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    const result = await service.search('nothing');
    expect(result).toEqual([]);
    expect(prismaMock.article.findMany).not.toHaveBeenCalled();
  });

  it('returns mapped ArticleListItems for matching articles', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    const date = new Date('2024-01-01');
    prismaMock.article.findMany.mockResolvedValue([
      {
        id: 'a1',
        title: 'Hello',
        slug: 'hello',
        excerpt: 'Hi',
        coverImageUrl: null,
        readingTime: 1,
        publishedAt: date,
        tags: [{ tag: { name: 'vue', slug: 'vue' } }],
        author: { username: 'user', name: 'User', avatarUrl: null },
      },
      {
        id: 'a2',
        title: 'World',
        slug: 'world',
        excerpt: 'Hi2',
        coverImageUrl: null,
        readingTime: 2,
        publishedAt: date,
        tags: [],
        author: { username: 'user', name: 'User', avatarUrl: null },
      },
    ]);
    const result = await service.search('hello');
    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe('hello');
    expect(result[1].slug).toBe('world');
  });

  it('preserves rank order from the raw query', async () => {
    // raw query returns a2 first (higher rank), a1 second
    prismaMock.$queryRaw.mockResolvedValue([{ id: 'a2' }, { id: 'a1' }]);
    const date = new Date('2024-01-01');
    prismaMock.article.findMany.mockResolvedValue([
      { id: 'a1', title: 'H', slug: 'h1', excerpt: null, coverImageUrl: null, readingTime: 1, publishedAt: date, tags: [], author: { username: 'u', name: 'U', avatarUrl: null } },
      { id: 'a2', title: 'W', slug: 'w2', excerpt: null, coverImageUrl: null, readingTime: 1, publishedAt: date, tags: [], author: { username: 'u', name: 'U', avatarUrl: null } },
    ]);
    const result = await service.search('w');
    expect(result[0].slug).toBe('w2');
    expect(result[1].slug).toBe('h1');
  });
});
```

- [ ] **Step 5: Run tests to confirm they fail**

Run: `pnpm --filter @hoard/api test -- --testPathPattern=search.service`
Expected: FAIL — "Cannot find module './search.service'"

- [ ] **Step 6: Implement SearchService**

Create `apps/api/src/search/search.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import type { ArticleListItem } from '@hoard/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  ARTICLE_WITH_AUTHOR_INCLUDE,
  toArticleListItem,
  type ArticleWithTagsAndAuthor,
} from '../articles/articles.mapper';

const SEARCH_LIMIT = 20;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string): Promise<ArticleListItem[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Article"
      WHERE status = 'PUBLISHED'
        AND to_tsvector('english', coalesce(title, '') || ' ' || coalesce(excerpt, ''))
            @@ plainto_tsquery('english', ${q})
      ORDER BY ts_rank(
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(excerpt, '')),
        plainto_tsquery('english', ${q})
      ) DESC
      LIMIT ${SEARCH_LIMIT}
    `;

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const articles = await this.prisma.article.findMany({
      where: { id: { in: ids } },
      include: ARTICLE_WITH_AUTHOR_INCLUDE,
    });

    const rankOrder = new Map(ids.map((id, i) => [id, i]));
    return articles
      .sort((a, b) => (rankOrder.get(a.id) ?? 0) - (rankOrder.get(b.id) ?? 0))
      .map((a) => toArticleListItem(a as ArticleWithTagsAndAuthor));
  }
}
```

- [ ] **Step 7: Run tests to confirm they pass**

Run: `pnpm --filter @hoard/api test -- --testPathPattern=search.service`
Expected: PASS — 3 tests

- [ ] **Step 8: Implement SearchController and SearchModule**

Create `apps/api/src/search/search.controller.ts`:

```typescript
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import type { ArticleListItem } from '@hoard/shared';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@Query('q') q?: string): Promise<ArticleListItem[]> {
    if (!q || !q.trim()) {
      throw new BadRequestException('q is required');
    }
    return this.searchService.search(q.trim());
  }
}
```

Create `apps/api/src/search/search.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
```

- [ ] **Step 9: Wire SearchModule into AppModule**

In `apps/api/src/app.module.ts`, add:

```typescript
import { SearchModule } from './search/search.module';
```

And add `SearchModule` to the `imports` array (after `FeedModule`):

```typescript
imports: [
  PrismaModule,
  ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
  UsersModule,
  AuthModule,
  TagsModule,
  ArticlesModule,
  FeedModule,
  SearchModule,
],
```

- [ ] **Step 10: Run full API test suite**

Run: `pnpm --filter @hoard/api test`
Expected: all tests pass (existing + 5 FeedService + 3 SearchService = 8 new tests).

- [ ] **Step 11: Smoke test the endpoint**

With the API running and a published article in the DB:
```bash
curl "http://localhost:3001/search?q=hello"
```
Expected: JSON array of matching `ArticleListItem` objects (empty array if no published articles match).

```bash
curl "http://localhost:3001/search"
```
Expected: 400 Bad Request.

- [ ] **Step 12: Commit**

```bash
git add apps/api/prisma/migrations/ \
  apps/api/src/search/ \
  apps/api/src/app.module.ts
git commit -m "feat: add search API with Postgres full-text and GIN index"
```

---

### Task 3: useFeed composable + home page

**Files:**
- Create: `apps/web/app/composables/useFeed.ts`
- Create: `apps/web/app/composables/useFeed.test.ts`
- Modify: `apps/web/app/pages/index.vue`

**Interfaces:**
- Consumes: `PaginatedArticles`, `ArticleListItem` from `@hoard/shared`; `$fetch` (Nuxt global, stubbed in tests); `ArticleCard` from `~/components/ui/ArticleCard.vue`
- Produces: `useFeed(apiBase: string)` returning `{ articles: Ref<ArticleListItem[]>, nextCursor: Ref<string | null>, loading: Ref<boolean>, error: Ref<string | null>, loadMore: () => Promise<void> }`

- [ ] **Step 1: Write useFeed tests**

Create `apps/web/app/composables/useFeed.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('$fetch', mockFetch);

import { useFeed } from './useFeed';

describe('useFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with empty state', () => {
    const { articles, nextCursor, loading, error } = useFeed('http://localhost:3001');
    expect(articles.value).toEqual([]);
    expect(nextCursor.value).toBeNull();
    expect(loading.value).toBe(false);
    expect(error.value).toBeNull();
  });

  it('loadMore fetches /feed and appends articles', async () => {
    mockFetch.mockResolvedValue({
      articles: [{ id: 'a1', title: 'Hello' }],
      nextCursor: '2024-01-01T00:00:00.000Z',
    });
    const { articles, nextCursor, loadMore } = useFeed('http://localhost:3001');
    await loadMore();
    expect(articles.value).toHaveLength(1);
    expect(nextCursor.value).toBe('2024-01-01T00:00:00.000Z');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/feed');
  });

  it('passes cursor as query param on subsequent loadMore calls and accumulates articles', async () => {
    mockFetch
      .mockResolvedValueOnce({ articles: [{ id: 'a1' }], nextCursor: '2024-01-01T00:00:00.000Z' })
      .mockResolvedValueOnce({ articles: [{ id: 'a2' }], nextCursor: null });
    const { articles, nextCursor, loadMore } = useFeed('http://localhost:3001');
    await loadMore();
    await loadMore();
    expect(articles.value).toHaveLength(2);
    expect(nextCursor.value).toBeNull();
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/feed?cursor=2024-01-01T00%3A00%3A00.000Z',
    );
  });

  it('sets error when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const { error, loadMore } = useFeed('http://localhost:3001');
    await loadMore();
    expect(error.value).toBe('Failed to load articles.');
  });

  it('clears error on a successful loadMore after a failure', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ articles: [], nextCursor: null });
    const { error, loadMore } = useFeed('http://localhost:3001');
    await loadMore();
    expect(error.value).toBe('Failed to load articles.');
    await loadMore();
    expect(error.value).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @hoard/web test -- --reporter=verbose useFeed`
Expected: FAIL — "Cannot find module './useFeed'"

- [ ] **Step 3: Implement useFeed composable**

Create `apps/web/app/composables/useFeed.ts`:

```typescript
import { ref } from 'vue';
import type { ArticleListItem, PaginatedArticles } from '@hoard/shared';

export function useFeed(apiBase: string) {
  const articles = ref<ArticleListItem[]>([]);
  const nextCursor = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadMore() {
    loading.value = true;
    error.value = null;
    try {
      const url = nextCursor.value
        ? `${apiBase}/feed?cursor=${encodeURIComponent(nextCursor.value)}`
        : `${apiBase}/feed`;
      const data = await $fetch<PaginatedArticles>(url);
      articles.value.push(...data.articles);
      nextCursor.value = data.nextCursor;
    } catch {
      error.value = 'Failed to load articles.';
    } finally {
      loading.value = false;
    }
  }

  return { articles, nextCursor, loading, error, loadMore };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm --filter @hoard/web test -- --reporter=verbose useFeed`
Expected: PASS — 5 tests

- [ ] **Step 5: Replace home page with real feed**

Replace the entire content of `apps/web/app/pages/index.vue`:

```vue
<script setup lang="ts">
import ArticleCard from '~/components/ui/ArticleCard.vue';
import { useFeed } from '~/composables/useFeed';

const { public: { apiBase } } = useRuntimeConfig();
const { articles, nextCursor, loading, error, loadMore } = useFeed(apiBase);

onMounted(loadMore);
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-12">
    <h1 class="mb-8 font-serif text-3xl font-bold text-ink">Explore</h1>

    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <p v-else-if="articles.length === 0 && !loading" class="text-sm text-ink-light">
      No articles yet.
    </p>

    <div class="divide-y divide-border">
      <ArticleCard v-for="article in articles" :key="article.id" :article="article" class="py-8" />
    </div>

    <div class="mt-8 text-center">
      <p v-if="loading" class="text-sm text-ink-light">Loading...</p>
      <button
        v-else-if="nextCursor"
        class="rounded-full border border-border px-6 py-2 text-sm font-medium text-ink hover:border-accent hover:text-accent"
        @click="loadMore"
      >
        Load more
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 6: Run the full web test suite**

Run: `pnpm --filter @hoard/web test`
Expected: all tests pass.

- [ ] **Step 7: Manually verify in a real browser**

Start the full stack: `pnpm dev` (in a separate terminal, ensure DB is running with `docker compose up -d db`).

Navigate to `http://localhost:3000`. Confirm:
- "Explore" serif heading visible
- Published articles appear as `ArticleCard` components (title, excerpt, byline)
- "Load more" button appears if more than 10 articles exist; clicking it appends the next page
- "No articles yet." shows when DB has no published articles
- Logged-out visitors see the same feed (no auth required)

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/composables/useFeed.ts \
  apps/web/app/composables/useFeed.test.ts \
  apps/web/app/pages/index.vue
git commit -m "feat: add Explore feed to home page with Load more pagination"
```

---

### Task 4: Nav search bar + search page

**Files:**
- Modify: `apps/web/app/layouts/default.vue`
- Create: `apps/web/app/pages/search.vue`

**Interfaces:**
- Consumes: `ArticleListItem` from `@hoard/shared`; `GET /search?q=` endpoint from Task 2; `ArticleCard` from `~/components/ui/ArticleCard.vue`; `navigateTo` and `useRoute` (Nuxt auto-imports); `useRuntimeConfig` (Nuxt auto-import)
- Produces: search form in nav that navigates to `/search?q=...`; `/search` page that fetches and displays results

- [ ] **Step 1: Add the search form to the global nav layout**

In `apps/web/app/layouts/default.vue`, replace the entire file with:

```vue
<script setup lang="ts">
import Avatar from '~/components/ui/Avatar.vue';

const auth = useAuthStore();
const searchQuery = ref('');
</script>

<template>
  <div class="flex min-h-screen flex-col font-sans text-ink">
    <header class="border-b border-border">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <NuxtLink to="/" class="font-serif text-2xl font-bold text-ink">Hoard</NuxtLink>
        <div class="flex items-center gap-5 text-sm font-medium">
          <form
            @submit.prevent="searchQuery.trim() && navigateTo(`/search?q=${encodeURIComponent(searchQuery.trim())}`)"
          >
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Search..."
              class="w-40 rounded-full border border-border px-3 py-1 text-sm text-ink placeholder:text-ink-light focus:border-accent focus:outline-none"
            />
          </form>
          <template v-if="auth.user">
            <NuxtLink to="/write" class="flex items-center gap-1.5 text-ink hover:text-accent">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              Write
            </NuxtLink>
            <NuxtLink :to="`/@${auth.user.username}`">
              <Avatar :name="auth.user.name" :size="32" />
            </NuxtLink>
          </template>
          <template v-else>
            <NuxtLink to="/login" class="text-ink hover:text-accent">Sign in</NuxtLink>
            <NuxtLink
              to="/signup"
              class="rounded-full bg-accent px-4 py-2 font-semibold text-white hover:bg-accent/90"
            >
              Get started
            </NuxtLink>
          </template>
        </div>
      </div>
    </header>
    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>
```

- [ ] **Step 2: Create the search page**

Create `apps/web/app/pages/search.vue`:

```vue
<script setup lang="ts">
import ArticleCard from '~/components/ui/ArticleCard.vue';
import type { ArticleListItem } from '@hoard/shared';

const route = useRoute();
const { public: { apiBase } } = useRuntimeConfig();

const searchQuery = ref((route.query.q as string) ?? '');
const articles = ref<ArticleListItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

async function doSearch(q: string) {
  const trimmed = q.trim();
  if (!trimmed) {
    navigateTo('/');
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    articles.value = await $fetch<ArticleListItem[]>(
      `${apiBase}/search?q=${encodeURIComponent(trimmed)}`,
    );
  } catch {
    error.value = 'Search failed. Try again.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (route.query.q) doSearch(route.query.q as string);
});

watch(
  () => route.query.q,
  (q) => {
    searchQuery.value = (q as string) ?? '';
    if (q) doSearch(q as string);
  },
);
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-12">
    <form
      class="mb-8"
      @submit.prevent="navigateTo(`/search?q=${encodeURIComponent(searchQuery.trim())}`)"
    >
      <input
        v-model="searchQuery"
        type="search"
        placeholder="Search articles..."
        class="w-full rounded-md border border-border px-4 py-2 text-sm text-ink placeholder:text-ink-light focus:border-accent focus:outline-none"
      />
    </form>

    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <p v-else-if="loading" class="text-sm text-ink-light">Searching...</p>

    <p
      v-else-if="articles.length === 0 && route.query.q"
      class="text-sm text-ink-light"
    >
      No results for "{{ route.query.q }}".
    </p>

    <div class="divide-y divide-border">
      <ArticleCard
        v-for="article in articles"
        :key="article.id"
        :article="article"
        class="py-8"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 3: Run the full web test suite**

Run: `pnpm --filter @hoard/web test`
Expected: all tests pass (no new unit tests for pages — manual Playwright verification below).

- [ ] **Step 4: Run the full build**

Run: `pnpm build`
Expected: all three packages build successfully.

- [ ] **Step 5: Manually verify in a real browser**

With `pnpm dev` running:

**Nav search:**
- On every page, a search input is visible in the nav
- Type a word and press Enter → navigates to `/search?q=<word>`
- Submitting an empty input → does nothing (the `&&` guard in the submit handler prevents navigation)

**Search page (`/search?q=<term>`):**
- Results load immediately (no manual click needed)
- Matching articles show as `ArticleCard` components
- Changing the query in the page's input and pressing Enter updates results
- Non-matching query shows "No results for '...'."
- Network failure shows "Search failed. Try again."

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/layouts/default.vue \
  apps/web/app/pages/search.vue
git commit -m "feat: add nav search bar and search results page"
```
