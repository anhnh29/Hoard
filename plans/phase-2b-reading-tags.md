# Phase 2b — Reading View & Tag Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A logged-out visitor can read a published article at `/@username/slug` (title, cover image, author byline linking to their profile, rendered content, reading time, tags, publish date) and browse all published articles under a tag at `/tag/:slug`.

**Prerequisite:** Phase 2a (`plans/phase-2a-write-publish.md`) must be implemented and merged first — this phase's public read endpoints are added to the `ArticlesController`/`TagsController` Phase 2a creates, and read data Phase 2a's `publish` flow writes.

**Architecture:** Two new public (unguarded) GET endpoints — `GET /articles/by-slug/:username/:slug` and `GET /tags/:slug/articles` — added to Phase 2a's existing controllers. Both are pure reads with no new tables. Two new Nuxt pages, both using `useFetch` for SSR (same pattern as the existing public profile page `@[username].vue`), not the manual `useApi`/Pinia-token composable Phase 1/2a use for authenticated calls — these pages need no access token.

## Global Constraints

- `apps/api` may ONLY `import type { ... } from '@hoard/shared'` — never a runtime value (same ESM/CommonJS constraint as Phase 1/2a).
- **Guard convention:** Phase 2a's `ArticlesController` already uses method-level `@UseGuards(JwtAuthGuard)` (not class-level) specifically so this phase's new routes can have no guard at all, exactly like `UsersController`'s public `GET :username`. If you find a class-level guard on `ArticlesController` when starting this phase, that means Phase 2a's plan's later fix wasn't applied — fix it first (remove the class-level guard, add the method-level guard to each of the 6 existing authenticated routes) before adding this phase's routes.
- **Route ordering — only relevant for `cover-upload-signature`, not the new routes here:** `GET /articles/by-slug/:username/:slug` has 3 path segments after `/articles/`, so it cannot collide with the 1-segment `GET /articles/:id` regardless of where it's declared (Express only matches `:id` against single-segment paths) — unlike Phase 2a's `cover-upload-signature`, which genuinely needed to be declared first. No special ordering is required for this task; it's noted here only so you don't spend time re-deriving the same question Phase 2a already answered differently.
- **Slug-vs-username consistency:** an article's `slug` is globally unique (assigned once, at first publish — see Phase 2a). The `:username` segment in the URL is still checked against the article's actual author on every lookup — a request for `/@wronguser/correct-slug` returns 404, not a redirect to the canonical URL. This keeps the contract simple; canonical-redirect handling is not in scope.
- **Draft articles are never reachable through these new endpoints** — `findPublishedBySlug` and the tag-articles listing both filter on `status: 'PUBLISHED'` only. An author previewing their own unpublished draft continues to use `/write/:id` (Phase 2a), not this phase's URLs.
- **No pagination on the tag page** — the feature brief's "Cross-cutting" pagination requirement (§8) is satisfied starting Phase 3 ("Feed & Discovery"), which is where the project's other listing surfaces (home feed, search) get paginated together. Adding it here alone, ahead of that shared pattern, would mean redoing it. The tag page returns all matching published articles, newest first.
- **`v-html` is used once, in the article reading page, to render Tiptap content as HTML via `@tiptap/html`'s `generateHTML`.** This is safe specifically because `generateHTML` only emits markup for node/mark types declared in the extensions array passed to it (`StarterKit`/`Image`/`Link` — the same fixed set Phase 2a's editor uses) — it cannot emit a tag or attribute outside that fixed vocabulary, regardless of what's in the stored JSON. This is different from rendering arbitrary user-supplied HTML/markdown, which would be unsafe.
- Test policy carried over: services/controllers get automated tests; the two new pages get manual verification (same precedent as `@[username].vue`/`health.vue`).

---

### Task 1: Shared `PublicArticle`/`ArticleListItem`/`TagSummary` types

**Files:**
- Modify: `packages/shared/src/article.ts`

**Interfaces:**
- Produces: `ArticleAuthor`, `PublicArticle`, `ArticleListItem`, `TagSummary`, `TagWithArticles` interfaces, re-exported via the existing `export * from './article.js'` in `index.ts` (no change needed there). These are response-shape types only (no Zod schema — nothing client-supplied needs validation here, same precedent as the existing `Article`/`AuthUser`/`PublicProfile` interfaces, which also have no schema). Tasks 2-7 all depend on these exact shapes.

- [ ] **Step 1: Add the types**

In `packages/shared/src/article.ts`, add (after the existing `Article` interface, before `updateArticleSchema`):
```ts
export interface ArticleAuthor {
  username: string;
  name: string;
  avatarUrl: string | null;
}

export interface TagSummary {
  name: string;
  slug: string;
}

export interface PublicArticle {
  id: string;
  title: string;
  slug: string;
  content: Record<string, unknown>;
  coverImageUrl: string | null;
  readingTime: number;
  publishedAt: string;
  tags: TagSummary[];
  author: ArticleAuthor;
}

export interface ArticleListItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  readingTime: number;
  publishedAt: string;
  tags: TagSummary[];
  author: ArticleAuthor;
}

export interface TagWithArticles {
  tag: TagSummary;
  articles: ArticleListItem[];
}
```

- [ ] **Step 2: Build and run tests to confirm no regression**

```bash
pnpm --filter @hoard/shared build
pnpm --filter @hoard/shared test
```
Expected: PASS — these are pure type additions, no new test cases needed (consistent with `Article`/`AuthUser`/`PublicProfile`, which also aren't unit tested, only `updateArticleSchema`'s runtime validation is).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/article.ts
git commit -m "feat: add PublicArticle/ArticleListItem/TagSummary types to @hoard/shared"
```

---

### Task 2: `ArticlesService.findPublishedBySlug` + public mapper functions

**Files:**
- Modify: `apps/api/src/articles/articles.mapper.ts`
- Modify: `apps/api/src/articles/articles.service.ts`
- Modify: `apps/api/src/articles/articles.service.spec.ts`

**Interfaces:**
- Consumes: nothing new — same `PrismaService` Phase 2a's `ArticlesService` already has.
- Produces: `ARTICLE_WITH_AUTHOR_INCLUDE` (Prisma include shape) and `toPublicArticle`/`toArticleListItem` (pure mapper functions) exported from `articles.mapper.ts`; `ArticlesService.findPublishedBySlug(username, slug): Promise<PublicArticle>`. **Deliberately additive, not a refactor:** Phase 2a's existing `ARTICLE_INCLUDE`/`ArticleWithTags`/`toArticle` (used by the owner-facing CRUD methods) are untouched — this task adds a parallel, author-inclusive shape used only by the new public-read path, rather than widening the existing one and re-verifying every 2a test. Task 4 (`TagsService`) imports `ARTICLE_WITH_AUTHOR_INCLUDE` and `toArticleListItem` from this same file.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/articles/articles.service.spec.ts`, add `author: { username: 'testuser', name: 'Test User', avatarUrl: null }` to the existing `fakeArticle` fixture object (it's now included in the new query, even though the owner-facing tests don't assert on it), and add a new `describe` block:
```ts
describe('findPublishedBySlug', () => {
  it('returns the article when published and the username matches the author', async () => {
    prismaMock.article.findUnique.mockResolvedValue({
      ...fakeArticle,
      status: 'PUBLISHED',
      slug: 'hello-world',
      publishedAt: new Date('2024-01-01'),
    });

    const result = await service.findPublishedBySlug('testuser', 'hello-world');

    expect(result.slug).toBe('hello-world');
    expect(result.author).toEqual({ username: 'testuser', name: 'Test User', avatarUrl: null });
  });

  it('throws NotFoundException when the article does not exist', async () => {
    prismaMock.article.findUnique.mockResolvedValue(null);
    await expect(service.findPublishedBySlug('testuser', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when the article is still a draft', async () => {
    prismaMock.article.findUnique.mockResolvedValue({ ...fakeArticle, status: 'DRAFT', slug: 'hello-world' });
    await expect(service.findPublishedBySlug('testuser', 'hello-world')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when the username does not match the actual author', async () => {
    prismaMock.article.findUnique.mockResolvedValue({
      ...fakeArticle,
      status: 'PUBLISHED',
      slug: 'hello-world',
      publishedAt: new Date('2024-01-01'),
    });
    await expect(service.findPublishedBySlug('someone-else', 'hello-world')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hoard/api test articles.service`
Expected: FAIL — `findPublishedBySlug is not a function`.

- [ ] **Step 3: Add the mapper functions**

In `apps/api/src/articles/articles.mapper.ts`, add (the existing `toArticle`/`ArticleWithTags`/imports stay exactly as Phase 2a left them):
```ts
import type { User } from '@prisma/client';
import type { ArticleListItem, PublicArticle } from '@hoard/shared';

export const ARTICLE_WITH_AUTHOR_INCLUDE = { tags: { include: { tag: true } }, author: true } as const;
export type ArticleWithTagsAndAuthor = ArticleWithTags & { author: User };

export function toPublicArticle(article: ArticleWithTagsAndAuthor): PublicArticle {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug as string,
    content: article.content as Record<string, unknown>,
    coverImageUrl: article.coverImageUrl,
    readingTime: article.readingTime,
    publishedAt: (article.publishedAt as Date).toISOString(),
    tags: article.tags.map((t) => ({ name: t.tag.name, slug: t.tag.slug })),
    author: {
      username: article.author.username,
      name: article.author.name,
      avatarUrl: article.author.avatarUrl,
    },
  };
}

export function toArticleListItem(article: ArticleWithTagsAndAuthor): ArticleListItem {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug as string,
    excerpt: article.excerpt,
    coverImageUrl: article.coverImageUrl,
    readingTime: article.readingTime,
    publishedAt: (article.publishedAt as Date).toISOString(),
    tags: article.tags.map((t) => ({ name: t.tag.name, slug: t.tag.slug })),
    author: {
      username: article.author.username,
      name: article.author.name,
      avatarUrl: article.author.avatarUrl,
    },
  };
}
```

(Add the two new imports alongside the file's existing ones rather than duplicating the `Article`/`Tag` import line that's already there.)

- [ ] **Step 4: Add `findPublishedBySlug` to `ArticlesService`**

In `apps/api/src/articles/articles.service.ts`, add the import and method:
```ts
import { ARTICLE_WITH_AUTHOR_INCLUDE, toArticle, toPublicArticle, type ArticleWithTagsAndAuthor } from './articles.mapper';
```
(replacing the existing `import { toArticle } from './articles.mapper';` line with this widened one), and add the method anywhere in the class (after `unpublish` is a reasonable spot):
```ts
async findPublishedBySlug(username: string, slug: string): Promise<PublicArticle> {
  const article = await this.prisma.article.findUnique({
    where: { slug },
    include: ARTICLE_WITH_AUTHOR_INCLUDE,
  });
  if (!article || article.status !== 'PUBLISHED' || article.author.username !== username) {
    throw new NotFoundException('Article not found');
  }
  return toPublicArticle(article as ArticleWithTagsAndAuthor);
}
```
Add `PublicArticle` to the existing `import type { Article, UpdateArticleInput } from '@hoard/shared';` line.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @hoard/api test articles.service`
Expected: PASS, all cases including the 4 new ones.

- [ ] **Step 6: Run the full unit suite to confirm no regression**

Run: `pnpm --filter @hoard/api test`
Expected: PASS, all suites — confirms the `fakeArticle` fixture's new `author` field didn't break any of Phase 2a's existing assertions.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/articles/articles.mapper.ts apps/api/src/articles/articles.service.ts \
  apps/api/src/articles/articles.service.spec.ts
git commit -m "feat: add ArticlesService.findPublishedBySlug and public article mappers"
```

---

### Task 3: `GET /articles/by-slug/:username/:slug`

**Files:**
- Modify: `apps/api/src/articles/articles.controller.ts`
- Modify: `apps/api/test/articles.e2e-spec.ts`

**Interfaces:**
- Consumes: `ArticlesService.findPublishedBySlug` (Task 2).
- Produces: a public (no guard) `GET /articles/by-slug/:username/:slug` returning `PublicArticle`. Task 6 (frontend reading page) calls this.

- [ ] **Step 1: Write the failing e2e test**

In `apps/api/test/articles.e2e-spec.ts`, add a new test inside the existing `describe` block:
```ts
it('GET /articles/by-slug/:username/:slug serves a published article with no auth, and 404s for a draft', async () => {
  const createRes = await request(app.getHttpServer())
    .post('/articles')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(201);
  const articleId = createRes.body.id;

  await request(app.getHttpServer())
    .patch(`/articles/${articleId}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ title: 'Public Read Test' })
    .expect(200);

  await request(app.getHttpServer())
    .get(`/articles/by-slug/${testUsername}/public-read-test`)
    .expect(404);

  await request(app.getHttpServer())
    .post(`/articles/${articleId}/publish`)
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(201);

  const res = await request(app.getHttpServer())
    .get(`/articles/by-slug/${testUsername}/public-read-test`)
    .expect(200);
  expect(res.body.title).toBe('Public Read Test');
  expect(res.body.author).toEqual(expect.objectContaining({ username: testUsername }));

  await request(app.getHttpServer())
    .get(`/articles/by-slug/someone-else/public-read-test`)
    .expect(404);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hoard/api test:e2e`
Expected: FAIL — `404 Not Found` on the route itself (doesn't exist yet) even for the should-succeed case.

- [ ] **Step 3: Add the route**

In `apps/api/src/articles/articles.controller.ts`, add `PublicArticle` to the `import type { Article, AuthUser } from '@hoard/shared';` line, and add a new unguarded method (placed anywhere — no ordering concern here per Global Constraints):
```ts
@Get('by-slug/:username/:slug')
findPublishedBySlug(@Param('username') username: string, @Param('slug') slug: string): Promise<PublicArticle> {
  return this.articlesService.findPublishedBySlug(username, slug);
}
```

- [ ] **Step 4: Run the e2e suite to verify it passes**

Run: `pnpm --filter @hoard/api test:e2e`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/articles/articles.controller.ts apps/api/test/articles.e2e-spec.ts
git commit -m "feat: add public GET /articles/by-slug/:username/:slug endpoint"
```

---

### Task 4: `TagsService.findBySlugWithPublishedArticles`

**Files:**
- Modify: `apps/api/src/tags/tags.service.ts`
- Modify: `apps/api/src/tags/tags.service.spec.ts`

**Interfaces:**
- Consumes: `ARTICLE_WITH_AUTHOR_INCLUDE`, `toArticleListItem` (Task 2, imported as plain functions/constants from `articles.mapper.ts` — not via NestJS DI, so this does not create a circular module dependency between `TagsModule` and `ArticlesModule`, which already has the opposite direction: `ArticlesModule` imports `TagsModule`).
- Produces: `TagsService.findBySlugWithPublishedArticles(slug): Promise<TagWithArticles>`. Task 5 (`TagsController`) calls this.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/tags/tags.service.spec.ts`, extend the `prismaMock` object with `articleTag: { findMany: jest.fn() }`, and add a new `describe` block:
```ts
describe('findBySlugWithPublishedArticles', () => {
  it('throws NotFoundException when the tag does not exist', async () => {
    prismaMock.tag.findUnique.mockResolvedValue(null);
    await expect(service.findBySlugWithPublishedArticles('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the tag and its published articles, newest first', async () => {
    prismaMock.tag.findUnique.mockResolvedValue({ id: 't1', name: 'vue', slug: 'vue' });
    prismaMock.articleTag.findMany.mockResolvedValue([
      {
        article: {
          id: 'a1',
          title: 'Hello',
          slug: 'hello',
          excerpt: 'Hi',
          coverImageUrl: null,
          readingTime: 1,
          publishedAt: new Date('2024-01-01'),
          tags: [{ tag: { name: 'vue', slug: 'vue' } }],
          author: { username: 'testuser', name: 'Test User', avatarUrl: null },
        },
      },
    ]);

    const result = await service.findBySlugWithPublishedArticles('vue');

    expect(result.tag).toEqual({ name: 'vue', slug: 'vue' });
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].slug).toBe('hello');
    expect(prismaMock.articleTag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tagId: 't1', article: { status: 'PUBLISHED' } },
        orderBy: { article: { publishedAt: 'desc' } },
      }),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hoard/api test tags.service`
Expected: FAIL — `findBySlugWithPublishedArticles is not a function`.

- [ ] **Step 3: Implement**

In `apps/api/src/tags/tags.service.ts`, add the imports and method:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { TagWithArticles } from '@hoard/shared';
import { ARTICLE_WITH_AUTHOR_INCLUDE, toArticleListItem, type ArticleWithTagsAndAuthor } from '../articles/articles.mapper';
```
(merging with the existing `Injectable`/`PrismaService`/`slugify` imports already there from Task 4 of Phase 2a), then add the method to the class:
```ts
async findBySlugWithPublishedArticles(slug: string): Promise<TagWithArticles> {
  const tag = await this.prisma.tag.findUnique({ where: { slug } });
  if (!tag) {
    throw new NotFoundException('Tag not found');
  }
  const articleTags = await this.prisma.articleTag.findMany({
    where: { tagId: tag.id, article: { status: 'PUBLISHED' } },
    include: { article: { include: ARTICLE_WITH_AUTHOR_INCLUDE } },
    orderBy: { article: { publishedAt: 'desc' } },
  });
  return {
    tag: { name: tag.name, slug: tag.slug },
    articles: articleTags.map((at) => toArticleListItem(at.article as ArticleWithTagsAndAuthor)),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @hoard/api test tags.service`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tags/tags.service.ts apps/api/src/tags/tags.service.spec.ts
git commit -m "feat: add TagsService.findBySlugWithPublishedArticles"
```

---

### Task 5: `GET /tags/:slug/articles`

**Files:**
- Modify: `apps/api/src/tags/tags.controller.ts`
- Modify: `apps/api/src/tags/tags.module.ts`
- Modify: `apps/api/test/tags.e2e-spec.ts`

**Interfaces:**
- Consumes: `TagsService.findBySlugWithPublishedArticles` (Task 4). Also needs `ArticlesModule`-free access to `ArticlesService` — it doesn't: this controller only calls `TagsService`, which itself only calls Prisma + pure mapper functions, so `TagsModule`'s `imports` array does **not** need to change for this task (the cross-file dependency from Task 4 is a plain TypeScript import of pure functions, not a NestJS provider).
- Produces: a public `GET /tags/:slug/articles` returning `TagWithArticles`. Task 7 (frontend tag page) calls this.

- [ ] **Step 1: Write the failing e2e test**

In `apps/api/test/tags.e2e-spec.ts`, this suite currently has no authenticated user or article creation — add what's needed and a new test. First, extend `beforeAll` to also create a test user (mirroring `articles.e2e-spec.ts`'s pattern) and a published article tagged with `testTagName`:
```ts
const testEmail = `e2e-tags-${Date.now()}@e2e-test.local`;
const testUsername = `e2etags${Date.now()}`;
let accessToken: string;
let articleSlug: string;

// inside beforeAll, after the existing tag seed:
const signupRes = await request(app.getHttpServer())
  .post('/auth/signup')
  .send({ email: testEmail, password: 'password123', name: 'Tags User', username: testUsername });
accessToken = signupRes.body.accessToken;

const createRes = await request(app.getHttpServer())
  .post('/articles')
  .set('Authorization', `Bearer ${accessToken}`);
await request(app.getHttpServer())
  .patch(`/articles/${createRes.body.id}`)
  .set('Authorization', `Bearer ${accessToken}`)
  .send({ title: 'Tagged Article', tagNames: [testTagName] });
const publishRes = await request(app.getHttpServer())
  .post(`/articles/${createRes.body.id}/publish`)
  .set('Authorization', `Bearer ${accessToken}`);
articleSlug = publishRes.body.slug;
```
And extend `afterAll` to also clean up: `await prisma.user.deleteMany({ where: { email: { endsWith: '@e2e-test.local' } } });` (articles cascade-delete via the `onDelete: Cascade` on `ArticleTag`, but the `Article` row itself doesn't cascade from `User` deletion — add `await prisma.article.deleteMany({ where: { author: { email: testEmail } } });` before the user deletion). Then add the test:
```ts
it('GET /tags/:slug/articles returns the tag and its published articles', async () => {
  const res = await request(app.getHttpServer()).get(`/tags/${testTagName}/articles`).expect(200);
  expect(res.body.tag).toEqual({ name: testTagName, slug: testTagName });
  expect(res.body.articles.some((a: { slug: string }) => a.slug === articleSlug)).toBe(true);
});

it('GET /tags/:slug/articles 404s for an unknown tag', async () => {
  await request(app.getHttpServer()).get('/tags/no-such-tag/articles').expect(404);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hoard/api test:e2e`
Expected: FAIL — `404 Not Found` on `/tags/:slug/articles` (route doesn't exist yet).

- [ ] **Step 3: Add the route**

In `apps/api/src/tags/tags.controller.ts`, add `TagWithArticles` to the `import type { Tag } from '@prisma/client';` line (now `import type { Tag } from '@prisma/client'; import type { TagWithArticles } from '@hoard/shared';`), and add:
```ts
@Get(':slug/articles')
findArticlesBySlug(@Param('slug') slug: string): Promise<TagWithArticles> {
  return this.tagsService.findBySlugWithPublishedArticles(slug);
}
```
(Add `Param` to the existing `import { Controller, Get } from '@nestjs/common';` line.)

- [ ] **Step 4: Run the e2e suite to verify it passes**

Run: `pnpm --filter @hoard/api test:e2e`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tags/tags.controller.ts apps/api/test/tags.e2e-spec.ts
git commit -m "feat: add public GET /tags/:slug/articles endpoint"
```

---

### Task 6: Article reading page

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/app/pages/@[username]/[slug].vue`

**Interfaces:**
- Consumes: `GET /articles/by-slug/:username/:slug` (Task 3).
- Produces: the public article reading view. Manually verified (no automated test — same precedent as `@[username].vue`).

- [ ] **Step 1: Add the `@tiptap/html` dependency**

```bash
pnpm --filter @hoard/web add @tiptap/html@^2.11.0
```

- [ ] **Step 2: Create the page**

Create `apps/web/app/pages/@[username]/[slug].vue` (a directory named `@[username]` containing `[slug].vue` — this coexists with the existing top-level `@[username].vue` file without conflict, since they match different route depths: `/@:username` vs `/@:username/:slug`):
```vue
<script setup lang="ts">
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import type { PublicArticle } from '@hoard/shared';

const route = useRoute();
const config = useRuntimeConfig();
const username = route.params.username as string;
const slug = route.params.slug as string;

const { data, error } = await useFetch<PublicArticle>(
  `${config.public.apiBase}/articles/by-slug/${username}/${slug}`,
);

const contentHtml = computed(() =>
  data.value ? generateHTML(data.value.content, [StarterKit, Image, Link]) : '',
);
</script>

<template>
  <div>
    <p v-if="error">Article not found.</p>
    <article v-else-if="data">
      <img v-if="data.coverImageUrl" :src="data.coverImageUrl" :alt="data.title" />
      <h1>{{ data.title }}</h1>
      <p>
        <NuxtLink :to="`/@${data.author.username}`">{{ data.author.name }}</NuxtLink>
        · {{ data.readingTime }} min read · {{ new Date(data.publishedAt).toLocaleDateString() }}
      </p>
      <p>
        <NuxtLink v-for="tag in data.tags" :key="tag.slug" :to="`/tag/${tag.slug}`">{{ tag.name }}</NuxtLink>
      </p>
      <!-- safe: generateHTML only emits markup for the node/mark types declared
           in the extensions array above — it cannot emit arbitrary tags, since
           the input is our own Tiptap JSON, not raw user-supplied HTML. -->
      <div v-html="contentHtml" />
    </article>
  </div>
</template>
```

- [ ] **Step 3: Verify the build**

```bash
pnpm --filter @hoard/web build
```
Expected: succeeds.

- [ ] **Step 4: Manual verification**

Start `pnpm dev`, publish an article via `/write/:id` (Phase 2a), then visit `/@<your-username>/<slug>`. Confirm: (a) title, cover image (if set), byline linking to your profile, reading time, publish date, tags, and rendered rich-text content all display correctly, (b) clicking a tag navigates toward `/tag/<slug>` (the page itself comes in Task 7), (c) visiting the same URL with a wrong username (e.g. `/@nobody/<slug>`) shows "Article not found," (d) visiting a draft's would-be URL (guess a title-derived slug for an unpublished article) also shows "Article not found."

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml "apps/web/app/pages/@[username]/[slug].vue"
git commit -m "feat: add public article reading page"
```

---

### Task 7: Tag page

**Files:**
- Create: `apps/web/app/pages/tag/[slug].vue`

**Interfaces:**
- Consumes: `GET /tags/:slug/articles` (Task 5).
- Produces: the tag-listing page. Manually verified.

- [ ] **Step 1: Create the page**

Create `apps/web/app/pages/tag/[slug].vue`:
```vue
<script setup lang="ts">
import type { TagWithArticles } from '@hoard/shared';

const route = useRoute();
const config = useRuntimeConfig();
const slug = route.params.slug as string;

const { data, error } = await useFetch<TagWithArticles>(`${config.public.apiBase}/tags/${slug}/articles`);
</script>

<template>
  <div>
    <p v-if="error">Tag not found.</p>
    <div v-else-if="data">
      <h1>#{{ data.tag.name }}</h1>
      <p v-if="data.articles.length === 0">No published articles yet.</p>
      <article v-for="article in data.articles" :key="article.id">
        <h2>
          <NuxtLink :to="`/@${article.author.username}/${article.slug}`">{{ article.title }}</NuxtLink>
        </h2>
        <p>
          <NuxtLink :to="`/@${article.author.username}`">{{ article.author.name }}</NuxtLink>
          · {{ article.readingTime }} min read
        </p>
        <p v-if="article.excerpt">{{ article.excerpt }}</p>
      </article>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Manual verification**

Visit `/tag/<a-tag-you-used>`. Confirm: (a) the tag name heading and all published articles under that tag appear, newest first, each linking correctly to its `/@username/slug` reading page and to the author's profile, (b) visiting `/tag/no-such-tag` shows "Tag not found," (c) a tag with zero published articles (e.g. one only attached to an unpublished draft) shows "No published articles yet," not an error.

- [ ] **Step 3: Run the full test suite one more time**

```bash
pnpm build
pnpm test
pnpm --filter @hoard/api test:e2e
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/pages/tag/[slug].vue
git commit -m "feat: add tag listing page"
```

---

## Done When

- A logged-out visitor can read a published article at `/@username/slug` — title, cover image, byline (linking to the author's profile), rendered content, reading time, tags (each linking to its tag page), and publish date all display correctly.
- A logged-out visitor can browse `/tag/:slug` and see every published article under that tag, newest first, with no pagination (deferred to Phase 3).
- Draft articles remain completely unreachable through both new endpoints (404, not a redirect, not a partial render) regardless of whether the requester is authenticated.
- All automated tests pass: `pnpm build`, `pnpm test` (unit, all three packages), `pnpm --filter @hoard/api test:e2e`.
- Phase 2 (2a + 2b combined) is now fully done per the original roadmap's "Done when": a user can write, autosave, tag, add a cover image, and publish an article; a logged-out visitor can read it at its URL and browse it via its tag page.
