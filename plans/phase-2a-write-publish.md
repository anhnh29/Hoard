# Phase 2a — Write & Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A logged-in user can create a draft, write in a Tiptap rich-text editor with autosave, attach tags, add a cover image, and publish/unpublish the article.

**Architecture:** `apps/api` gains an `Article`/`Tag`/`ArticleTag` schema and an `ArticlesModule`/`TagsModule` following the exact module/service/controller/DTO pattern Phase 1 established. `apps/web` gains a Tiptap editor component, a debounced autosave composable (built on the existing `useApi` composable), and a `/write` → `/write/[id]` editor flow. Cover image upload reuses Phase 1b's `CloudinaryService` unchanged (just a different `folder` argument).

**Tech Stack:** `@tiptap/vue-3` + `@tiptap/starter-kit` + `@tiptap/extension-image` + `@tiptap/extension-link` (ProseMirror-based editor), Prisma (new models), existing NestJS/Passport/Cloudinary infrastructure from Phase 1.

## Global Constraints

- `apps/api` may ONLY `import type { ... } from '@hoard/shared'` — never a runtime value. `@hoard/shared` is ESM and `apps/api` is CommonJS; a non-type-only import compiles to a `require()` call that throws `ERR_REQUIRE_ESM` at runtime.
- **Slug generation:** lowercase the title, replace runs of non `[a-z0-9]` characters with a single hyphen, trim leading/trailing hyphens, truncate to 80 chars; on collision (checked via a unique-lookup loop, same pattern as Phase 1b's `generateUniqueUsernameFromEmail`), append `-2`, `-3`, etc. Slugs are assigned **once, at first publish** — an article keeps its slug across unpublish/republish cycles (no link rot).
- **Reading time:** extract plain text by walking the Tiptap JSON tree's `text` properties, split on whitespace to count words, `Math.max(1, Math.ceil(wordCount / 200))` (200 wpm is the standard estimate). Recomputed on every `PATCH` (not just at publish), so a draft's reading time is always current.
- **Excerpt:** backend-computed (first 160 characters of the same extracted plain text, not user-editable), recomputed alongside reading time on every `PATCH`. Not displayed anywhere in this phase's UI — it exists for future feed/profile listings (Phase 3+).
- **Authorization model for drafts:** any endpoint that reads or writes a specific article by `id` must verify `article.authorId === req.user.id`, and on failure throw `NotFoundException` (404), never `ForbiddenException` (403) — a non-owner must not be able to distinguish "doesn't exist" from "exists but isn't yours."
- **Route ordering:** `GET /articles/cover-upload-signature` is a literal, single-segment path at the same depth as `GET /articles/:id`. Unlike Phase 1b's `users/me/avatar-upload-signature` (which had an extra path segment and couldn't collide with `:username`), this one **can** collide — Express/Nest resolve same-depth literal-vs-param routes in controller-method declaration order. The literal route MUST be declared in the controller class before the `:id` route, or `:id` will swallow it.
- **Tag attachment is full-replace, not incremental:** `PATCH /articles/:id` with `tagNames: string[]` replaces the article's entire tag set (delete old `ArticleTag` rows, create new ones from the find-or-create result) — there is no separate add-tag/remove-tag endpoint.
- **Deferred, explicitly out of scope for this phase:**
  - Full-text search / `searchVector` generated column + GIN index — listed in the original Phase 2 roadmap sketch but not needed until Phase 3 ("Feed & Discovery"); adding it now would be dead schema with zero consumers. Add it in Phase 3 as its own additive migration on the same table.
  - Deleting a draft/article — not in the feature brief's bullet list; an unwanted draft can simply be left unpublished.
  - A "my drafts" listing page — not in the feature brief; the flow is create → editor URL → publish, no drafts index needed for this phase's "Done when."
  - The actual published-article reading page (`/@username/slug`) and tag page (`/tag/slug`) — that's Phase 2b, which depends on this phase's API. This phase's "Done when" stops at a working publish/unpublish, not at public reading.
- Test policy carried over from Phase 1: services/controllers/utilities/composables get automated tests; the Tiptap editor component and the write page itself get manual verification (per Phase 1's established precedent for presentational/integration-heavy frontend pieces — see `health.vue`, `settings/profile.vue`).

---

### Task 1: `Article`/`Tag`/`ArticleTag` Prisma models + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration via `prisma migrate dev`

**Interfaces:**
- Produces: `Article` (id, title, slug?, content: Json, excerpt?, coverImageUrl?, status: DRAFT|PUBLISHED, authorId, publishedAt?, readingTime, createdAt, updatedAt), `Tag` (id, name unique, slug unique), `ArticleTag` (articleId, tagId composite PK). `User` gains a back-relation `articles Article[]`. Every later task in this plan depends on these exact field names/types.

- [ ] **Step 1: Add the models**

In `apps/api/prisma/schema.prisma`, add `articles Article[]` to the existing `User` model (insert right after `createdAt DateTime @default(now())`):
```prisma
model User {
  id                 String   @id @default(uuid())
  email              String   @unique
  passwordHash       String?
  name               String
  username           String   @unique
  bio                String?
  avatarUrl          String?
  hashedRefreshToken String?
  createdAt          DateTime @default(now())
  articles           Article[]
}
```

Then append these new models at the end of the file:
```prisma
enum ArticleStatus {
  DRAFT
  PUBLISHED
}

model Article {
  id            String        @id @default(uuid())
  title         String        @default("")
  slug          String?       @unique
  content       Json          @default("{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}")
  excerpt       String?
  coverImageUrl String?
  status        ArticleStatus @default(DRAFT)
  authorId      String
  author        User          @relation(fields: [authorId], references: [id])
  publishedAt   DateTime?
  readingTime   Int           @default(1)
  tags          ArticleTag[]
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
}

model Tag {
  id       String       @id @default(uuid())
  name     String       @unique
  slug     String       @unique
  articles ArticleTag[]
}

model ArticleTag {
  articleId String
  tagId     String
  article   Article @relation(fields: [articleId], references: [id], onDelete: Cascade)
  tag       Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([articleId, tagId])
}
```

- [ ] **Step 2: Create and apply the migration**

Run (Postgres must be running — `docker compose ps` from the repo root, container should already be up on host port 5434):
```bash
pnpm --filter @hoard/api exec prisma migrate dev --name add_article_tag
```
Expected: a new directory under `apps/api/prisma/migrations/` containing the generated SQL (two `CREATE TABLE`s, one `CREATE TYPE` for the enum, the new unique indexes, the `User`/`Article` foreign key) — purely additive, no `ALTER`/`DROP` on existing columns.

- [ ] **Step 3: Verify the migration is additive and the app still builds**

```bash
pnpm --filter @hoard/api exec tsc --noEmit
pnpm --filter @hoard/api build
pnpm --filter @hoard/api test
pnpm --filter @hoard/api test:e2e
```
Expected: all exit 0 / all pass — this migration shouldn't affect any existing Phase 1 code.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add Article, Tag, ArticleTag models"
```

---

### Task 2: `packages/shared` — `Article`/`Tag` types and Zod schema

**Files:**
- Create: `packages/shared/src/article.ts`
- Create: `packages/shared/src/article.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `Article` interface, `ArticleStatus` type, `updateArticleSchema` (Zod) + `UpdateArticleInput` (inferred type). Re-exported from `index.ts` via `.js` extension (ESM/nodenext requirement, same pattern as `health.js`/`user.js`). Tasks 5-13 import these.

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/article.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { updateArticleSchema } from './article';

describe('updateArticleSchema', () => {
  it('accepts a partial update with just a title', () => {
    const result = updateArticleSchema.safeParse({ title: 'New Title' });
    expect(result.success).toBe(true);
  });

  it('accepts content as an arbitrary object (Tiptap JSON)', () => {
    const result = updateArticleSchema.safeParse({
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts tagNames as an array of strings', () => {
    const result = updateArticleSchema.safeParse({ tagNames: ['vue', 'typescript'] });
    expect(result.success).toBe(true);
  });

  it('rejects more than 10 tagNames', () => {
    const result = updateArticleSchema.safeParse({
      tagNames: Array.from({ length: 11 }, (_, i) => `tag${i}`),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-url coverImageUrl', () => {
    const result = updateArticleSchema.safeParse({ coverImageUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hoard/shared test`
Expected: FAIL — `Cannot find module './article'`.

- [ ] **Step 3: Implement**

Create `packages/shared/src/article.ts`:
```ts
import { z } from 'zod';

export type ArticleStatus = 'DRAFT' | 'PUBLISHED';

export interface Article {
  id: string;
  title: string;
  slug: string | null;
  content: Record<string, unknown>;
  excerpt: string | null;
  coverImageUrl: string | null;
  status: ArticleStatus;
  authorId: string;
  publishedAt: string | null;
  readingTime: number;
  tagNames: string[];
  createdAt: string;
  updatedAt: string;
}

export const updateArticleSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.record(z.unknown()).optional(),
  coverImageUrl: z.string().url().optional(),
  tagNames: z.array(z.string().min(1).max(30)).max(10).optional(),
});
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;
```

- [ ] **Step 4: Re-export from `index.ts`**

In `packages/shared/src/index.ts`, add a line consistent with the existing `health.js`/`user.js` exports:
```ts
export * from './article.js';
```

- [ ] **Step 5: Build and run tests**

```bash
pnpm --filter @hoard/shared build
pnpm --filter @hoard/shared test
```
Expected: PASS, 5/5 new tests plus all pre-existing tests.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/article.ts packages/shared/src/article.test.ts packages/shared/src/index.ts
git commit -m "feat: add Article types and updateArticleSchema to @hoard/shared"
```

---

### Task 3: Slug-generation and reading-time utilities

**Files:**
- Create: `apps/api/src/articles/slug.util.ts`
- Create: `apps/api/src/articles/slug.util.spec.ts`
- Create: `apps/api/src/articles/reading-time.util.ts`
- Create: `apps/api/src/articles/reading-time.util.spec.ts`

**Interfaces:**
- Produces: `slugify(title: string): string` (pure, no DB access — collision handling lives in `ArticlesService`, which calls this then loops on uniqueness, mirroring `generateUniqueUsernameFromEmail`'s pattern); `extractPlainText(content: Record<string, unknown>): string`; `calculateReadingTime(content: Record<string, unknown>): number`; `calculateExcerpt(content: Record<string, unknown>): string`. Task 5 (`ArticlesService`) calls all four.

- [ ] **Step 1: Write the failing slug tests**

Create `apps/api/src/articles/slug.util.spec.ts`:
```ts
import { slugify } from './slug.util';

describe('slugify', () => {
  it('lowercases and hyphenates a simple title', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('collapses runs of non-alphanumeric characters into a single hyphen', () => {
    expect(slugify('Hello, World!! Foo___Bar')).toBe('hello-world-foo-bar');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('--Hello World--')).toBe('hello-world');
  });

  it('truncates to 80 characters', () => {
    const longTitle = 'a'.repeat(100);
    expect(slugify(longTitle).length).toBe(80);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hoard/api test slug.util`
Expected: FAIL — `Cannot find module './slug.util'`.

- [ ] **Step 3: Implement `slugify`**

Create `apps/api/src/articles/slug.util.ts`:
```ts
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @hoard/api test slug.util`
Expected: PASS, 4/4.

- [ ] **Step 5: Write the failing reading-time/excerpt tests**

Create `apps/api/src/articles/reading-time.util.spec.ts`:
```ts
import { extractPlainText, calculateReadingTime, calculateExcerpt } from './reading-time.util';

const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'This is ' },
        { type: 'text', text: 'a second paragraph.' },
      ],
    },
  ],
};

describe('extractPlainText', () => {
  it('walks the Tiptap JSON tree and concatenates all text nodes with spaces', () => {
    expect(extractPlainText(doc)).toBe('Hello world This is a second paragraph.');
  });

  it('returns an empty string for a doc with no text nodes', () => {
    expect(extractPlainText({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe('');
  });
});

describe('calculateReadingTime', () => {
  it('returns a minimum of 1 minute for short content', () => {
    expect(calculateReadingTime(doc)).toBe(1);
  });

  it('rounds up for longer content (200 words = 1 minute, 201 = 2)', () => {
    const longDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'word '.repeat(201).trim() }] }],
    };
    expect(calculateReadingTime(longDoc)).toBe(2);
  });
});

describe('calculateExcerpt', () => {
  it('returns the first 160 characters of the plain text', () => {
    expect(calculateExcerpt(doc)).toBe('Hello world This is a second paragraph.');
  });

  it('truncates long content to exactly 160 characters', () => {
    const longDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a'.repeat(200) }] }],
    };
    expect(calculateExcerpt(longDoc).length).toBe(160);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @hoard/api test reading-time.util`
Expected: FAIL — `Cannot find module './reading-time.util'`.

- [ ] **Step 7: Implement**

Create `apps/api/src/articles/reading-time.util.ts`:
```ts
interface TiptapNode {
  type?: string;
  text?: string;
  content?: TiptapNode[];
}

export function extractPlainText(content: Record<string, unknown>): string {
  const parts: string[] = [];

  function walk(node: TiptapNode) {
    if (typeof node.text === 'string') {
      parts.push(node.text);
    }
    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
  }

  walk(content as TiptapNode);
  return parts.join(' ');
}

export function calculateReadingTime(content: Record<string, unknown>): number {
  const text = extractPlainText(content).trim();
  const wordCount = text.length === 0 ? 0 : text.split(/\s+/).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

export function calculateExcerpt(content: Record<string, unknown>): string {
  return extractPlainText(content).slice(0, 160);
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter @hoard/api test reading-time.util`
Expected: PASS, 6/6.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/articles/slug.util.ts apps/api/src/articles/slug.util.spec.ts \
  apps/api/src/articles/reading-time.util.ts apps/api/src/articles/reading-time.util.spec.ts
git commit -m "feat: add slug and reading-time/excerpt utilities"
```

---

### Task 4: `TagsService` + `TagsModule` + `TagsController`

**Files:**
- Create: `apps/api/src/tags/tags.service.ts`
- Create: `apps/api/src/tags/tags.service.spec.ts`
- Create: `apps/api/src/tags/tags.module.ts`
- Create: `apps/api/src/tags/tags.controller.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `slugify` (Task 3, reused for tag slugs).
- Produces: `TagsService.findOrCreateManyByName(names: string[]): Promise<Tag[]>` (Prisma `Tag` type), `TagsModule` exporting `TagsService`. `GET /tags` (public) returns `{id, name, slug}[]`. Task 5 (`ArticlesService`) imports `TagsModule` and calls `findOrCreateManyByName`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/tags/tags.service.spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { TagsService } from './tags.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TagsService', () => {
  let service: TagsService;
  const prismaMock = {
    tag: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TagsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<TagsService>(TagsService);
  });

  it('returns existing tags without creating duplicates', async () => {
    prismaMock.tag.findUnique.mockResolvedValue({ id: 't1', name: 'vue', slug: 'vue' });

    const result = await service.findOrCreateManyByName(['vue']);

    expect(prismaMock.tag.create).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: 't1', name: 'vue', slug: 'vue' }]);
  });

  it('creates a tag that does not exist yet', async () => {
    prismaMock.tag.findUnique.mockResolvedValue(null);
    prismaMock.tag.create.mockResolvedValue({ id: 't2', name: 'new tag', slug: 'new-tag' });

    const result = await service.findOrCreateManyByName(['new tag']);

    expect(prismaMock.tag.create).toHaveBeenCalledWith({
      data: { name: 'new tag', slug: 'new-tag' },
    });
    expect(result).toEqual([{ id: 't2', name: 'new tag', slug: 'new-tag' }]);
  });

  it('deduplicates repeated names in the input', async () => {
    prismaMock.tag.findUnique.mockResolvedValue({ id: 't1', name: 'vue', slug: 'vue' });

    const result = await service.findOrCreateManyByName(['vue', 'vue']);

    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hoard/api test tags.service`
Expected: FAIL — `Cannot find module './tags.service'`.

- [ ] **Step 3: Implement `TagsService`**

Create `apps/api/src/tags/tags.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type { Tag } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../articles/slug.util';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Tag[]> {
    return this.prisma.tag.findMany({ orderBy: { name: 'asc' } });
  }

  async findOrCreateManyByName(names: string[]): Promise<Tag[]> {
    const uniqueNames = Array.from(new Set(names));
    const tags: Tag[] = [];
    for (const name of uniqueNames) {
      const existing = await this.prisma.tag.findUnique({ where: { name } });
      if (existing) {
        tags.push(existing);
        continue;
      }
      const created = await this.prisma.tag.create({ data: { name, slug: slugify(name) } });
      tags.push(created);
    }
    return tags;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @hoard/api test tags.service`
Expected: PASS, 3/3.

- [ ] **Step 5: Create the module and controller**

Create `apps/api/src/tags/tags.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TagsService } from './tags.service';
import { TagsController } from './tags.controller';

@Module({
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
```

Create `apps/api/src/tags/tags.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import type { Tag } from '@prisma/client';
import { TagsService } from './tags.service';

@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  findAll(): Promise<Tag[]> {
    return this.tagsService.findAll();
  }
}
```

- [ ] **Step 6: Wire `TagsModule` into `AppModule`**

In `apps/api/src/app.module.ts`, add `TagsModule` to the `imports` array (alongside `PrismaModule`, `ThrottlerModule.forRoot(...)`, `UsersModule`, `AuthModule`) and add the import statement.

- [ ] **Step 7: Write an e2e test**

Create `apps/api/test/tags.e2e-spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Tags (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const testTagName = `e2e-tag-${Date.now()}`;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
    process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
    process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
    process.env.GOOGLE_CALLBACK_URL ??= 'http://localhost:3001/auth/google/callback';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    await prisma.tag.create({ data: { name: testTagName, slug: testTagName } });
  });

  afterAll(async () => {
    await prisma.tag.deleteMany({ where: { name: { startsWith: 'e2e-tag-' } } });
    await app.close();
  });

  it('GET /tags returns all tags including the seeded one', async () => {
    const res = await request(app.getHttpServer()).get('/tags').expect(200);
    expect(res.body.some((t: { name: string }) => t.name === testTagName)).toBe(true);
  });
});
```

- [ ] **Step 8: Run the e2e suite**

Run: `pnpm --filter @hoard/api test:e2e`
Expected: PASS, all suites.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/tags apps/api/src/app.module.ts apps/api/test/tags.e2e-spec.ts
git commit -m "feat: add TagsService/TagsModule/TagsController"
```

---

### Task 5: `ArticlesService`

**Files:**
- Create: `apps/api/src/articles/articles.service.ts`
- Create: `apps/api/src/articles/articles.service.spec.ts`
- Create: `apps/api/src/articles/articles.mapper.ts`

**Interfaces:**
- Consumes: `slugify`, `calculateReadingTime`, `calculateExcerpt` (Task 3); `TagsService.findOrCreateManyByName` (Task 4).
- Produces: `ArticlesService.create(authorId)`, `.findByIdForAuthor(id, authorId)`, `.update(id, authorId, dto)`, `.publish(id, authorId)`, `.unpublish(id, authorId)` — all `Promise<Article>` (the shared `Article` type, via `toArticle` mapper). `articles.mapper.ts` exports `toArticle(article: PrismaArticleWithTags): Article`. Task 6 (`ArticlesController`) calls all five service methods.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/articles/articles.service.spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { PrismaService } from '../prisma/prisma.service';
import { TagsService } from '../tags/tags.service';

describe('ArticlesService', () => {
  let service: ArticlesService;
  const prismaMock = {
    article: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    articleTag: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn((fn) => fn(prismaMock)),
  };
  const tagsServiceMock = {
    findOrCreateManyByName: jest.fn(),
  };

  const fakeArticle = {
    id: 'a1',
    title: 'Hello',
    slug: null,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] },
    excerpt: 'Hello',
    coverImageUrl: null,
    status: 'DRAFT',
    authorId: 'u1',
    publishedAt: null,
    readingTime: 1,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((fn) => fn(prismaMock));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TagsService, useValue: tagsServiceMock },
      ],
    }).compile();

    service = module.get<ArticlesService>(ArticlesService);
  });

  describe('create', () => {
    it('creates an empty draft owned by the given author', async () => {
      prismaMock.article.create.mockResolvedValue(fakeArticle);

      const result = await service.create('u1');

      expect(prismaMock.article.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ authorId: 'u1' }) }),
      );
      expect(result.id).toBe('a1');
    });
  });

  describe('findByIdForAuthor', () => {
    it('throws NotFoundException when the article does not exist', async () => {
      prismaMock.article.findUnique.mockResolvedValue(null);
      await expect(service.findByIdForAuthor('missing', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the article belongs to someone else', async () => {
      prismaMock.article.findUnique.mockResolvedValue({ ...fakeArticle, authorId: 'someone-else' });
      await expect(service.findByIdForAuthor('a1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the article when owned by the requester', async () => {
      prismaMock.article.findUnique.mockResolvedValue(fakeArticle);
      const result = await service.findByIdForAuthor('a1', 'u1');
      expect(result.id).toBe('a1');
    });
  });

  describe('update', () => {
    it('recomputes readingTime and excerpt from new content', async () => {
      prismaMock.article.findUnique.mockResolvedValue(fakeArticle);
      const longText = 'word '.repeat(250).trim();
      const newContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: longText }] }] };
      prismaMock.article.update.mockResolvedValue({ ...fakeArticle, content: newContent, readingTime: 2 });

      await service.update('a1', 'u1', { content: newContent });

      expect(prismaMock.article.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ readingTime: 2, excerpt: longText.slice(0, 160) }),
        }),
      );
    });

    it('replaces the tag set when tagNames is provided', async () => {
      prismaMock.article.findUnique.mockResolvedValue(fakeArticle);
      tagsServiceMock.findOrCreateManyByName.mockResolvedValue([{ id: 't1', name: 'vue', slug: 'vue' }]);
      prismaMock.article.update.mockResolvedValue(fakeArticle);

      await service.update('a1', 'u1', { tagNames: ['vue'] });

      expect(prismaMock.articleTag.deleteMany).toHaveBeenCalledWith({ where: { articleId: 'a1' } });
      expect(prismaMock.articleTag.createMany).toHaveBeenCalledWith({
        data: [{ articleId: 'a1', tagId: 't1' }],
      });
    });

    it('throws NotFoundException when updating an article owned by someone else', async () => {
      prismaMock.article.findUnique.mockResolvedValue({ ...fakeArticle, authorId: 'someone-else' });
      await expect(service.update('a1', 'u1', { title: 'New' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('publish', () => {
    it('generates a slug and sets status/publishedAt on first publish', async () => {
      prismaMock.article.findUnique.mockResolvedValue({ ...fakeArticle, title: 'Hello World' });
      prismaMock.article.update.mockResolvedValue({
        ...fakeArticle,
        status: 'PUBLISHED',
        slug: 'hello-world',
        publishedAt: new Date(),
      });

      await service.publish('a1', 'u1');

      const updateCall = prismaMock.article.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('PUBLISHED');
      expect(updateCall.data.slug).toBe('hello-world');
      expect(updateCall.data.publishedAt).toBeInstanceOf(Date);
    });

    it('keeps the existing slug and does not reset publishedAt on republish', async () => {
      prismaMock.article.findUnique.mockResolvedValue({
        ...fakeArticle,
        title: 'Hello World',
        slug: 'hello-world',
        publishedAt: new Date('2020-01-01'),
        status: 'DRAFT',
      });
      prismaMock.article.update.mockResolvedValue(fakeArticle);

      await service.publish('a1', 'u1');

      const updateCall = prismaMock.article.update.mock.calls[0][0];
      expect(updateCall.data.slug).toBe('hello-world');
      expect(updateCall.data.publishedAt).toBeUndefined();
    });
  });

  describe('unpublish', () => {
    it('sets status back to DRAFT while keeping the slug', async () => {
      prismaMock.article.findUnique.mockResolvedValue({ ...fakeArticle, status: 'PUBLISHED', slug: 'hello' });
      prismaMock.article.update.mockResolvedValue({ ...fakeArticle, status: 'DRAFT' });

      await service.unpublish('a1', 'u1');

      expect(prismaMock.article.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'DRAFT' } }),
      );
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hoard/api test articles.service`
Expected: FAIL — `Cannot find module './articles.service'`.

- [ ] **Step 3: Implement the mapper**

Create `apps/api/src/articles/articles.mapper.ts`:
```ts
import type { Article as PrismaArticle, ArticleTag, Tag } from '@prisma/client';
import type { Article } from '@hoard/shared';

type ArticleWithTags = PrismaArticle & { tags: (ArticleTag & { tag: Tag })[] };

export function toArticle(article: ArticleWithTags): Article {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    content: article.content as Record<string, unknown>,
    excerpt: article.excerpt,
    coverImageUrl: article.coverImageUrl,
    status: article.status,
    authorId: article.authorId,
    publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null,
    readingTime: article.readingTime,
    tagNames: article.tags.map((t) => t.tag.name),
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 4: Implement `ArticlesService`**

Create `apps/api/src/articles/articles.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Article as PrismaArticle, ArticleTag, Tag } from '@prisma/client';
import type { Article, UpdateArticleInput } from '@hoard/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TagsService } from '../tags/tags.service';
import { slugify } from './slug.util';
import { calculateExcerpt, calculateReadingTime } from './reading-time.util';
import { toArticle } from './articles.mapper';

const ARTICLE_INCLUDE = { tags: { include: { tag: true } } } as const;
type ArticleWithTags = PrismaArticle & { tags: (ArticleTag & { tag: Tag })[] };

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tagsService: TagsService,
  ) {}

  async create(authorId: string): Promise<Article> {
    const article = await this.prisma.article.create({
      data: { authorId },
      include: ARTICLE_INCLUDE,
    });
    return toArticle(article as ArticleWithTags);
  }

  async findByIdForAuthor(id: string, authorId: string): Promise<Article> {
    const article = await this.findOwned(id, authorId);
    return toArticle(article);
  }

  async update(id: string, authorId: string, dto: UpdateArticleInput): Promise<Article> {
    await this.findOwned(id, authorId);

    if (dto.tagNames) {
      const tags = await this.tagsService.findOrCreateManyByName(dto.tagNames);
      await this.prisma.$transaction(async (tx) => {
        await tx.articleTag.deleteMany({ where: { articleId: id } });
        if (tags.length > 0) {
          await tx.articleTag.createMany({ data: tags.map((tag) => ({ articleId: id, tagId: tag.id })) });
        }
      });
    }

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.coverImageUrl !== undefined) data.coverImageUrl = dto.coverImageUrl;
    if (dto.content !== undefined) {
      data.content = dto.content;
      data.readingTime = calculateReadingTime(dto.content);
      data.excerpt = calculateExcerpt(dto.content);
    }

    const updated = await this.prisma.article.update({
      where: { id },
      data,
      include: ARTICLE_INCLUDE,
    });
    return toArticle(updated as ArticleWithTags);
  }

  async publish(id: string, authorId: string): Promise<Article> {
    const article = await this.findOwned(id, authorId);
    const data: Record<string, unknown> = { status: 'PUBLISHED' };
    if (!article.slug) {
      data.slug = await this.generateUniqueSlug(article.title);
    }
    if (!article.publishedAt) {
      data.publishedAt = new Date();
    }
    const updated = await this.prisma.article.update({
      where: { id },
      data,
      include: ARTICLE_INCLUDE,
    });
    return toArticle(updated as ArticleWithTags);
  }

  async unpublish(id: string, authorId: string): Promise<Article> {
    await this.findOwned(id, authorId);
    const updated = await this.prisma.article.update({
      where: { id },
      data: { status: 'DRAFT' },
      include: ARTICLE_INCLUDE,
    });
    return toArticle(updated as ArticleWithTags);
  }

  private async findOwned(id: string, authorId: string): Promise<ArticleWithTags> {
    const article = await this.prisma.article.findUnique({ where: { id }, include: ARTICLE_INCLUDE });
    if (!article || article.authorId !== authorId) {
      throw new NotFoundException('Article not found');
    }
    return article as ArticleWithTags;
  }

  private async generateUniqueSlug(title: string): Promise<string> {
    const base = slugify(title);
    let candidate = base;
    let suffix = 1;
    while (await this.prisma.article.findUnique({ where: { slug: candidate } })) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @hoard/api test articles.service`
Expected: PASS, all cases.

- [ ] **Step 6: Run the full unit suite to confirm no regression**

Run: `pnpm --filter @hoard/api test`
Expected: PASS, all suites.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/articles/articles.service.ts apps/api/src/articles/articles.service.spec.ts \
  apps/api/src/articles/articles.mapper.ts
git commit -m "feat: add ArticlesService"
```

---

### Task 6: `ArticlesController` + `ArticlesModule`

**Files:**
- Create: `apps/api/src/articles/articles.controller.ts`
- Create: `apps/api/src/articles/dto/update-article.dto.ts`
- Create: `apps/api/src/articles/articles.module.ts`
- Create: `apps/api/test/articles.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `ArticlesService` (Task 5).
- Produces: `POST /articles`, `GET /articles/:id`, `PATCH /articles/:id`, `POST /articles/:id/publish`, `POST /articles/:id/unpublish` — all `JwtAuthGuard`-protected. Task 7 adds a 6th route to this same controller (the cover-upload-signature endpoint) — **read this task's Step 4 route-ordering note before that task, since it affects where the new route must be declared.**

- [ ] **Step 1: Write the DTO**

Create `apps/api/src/articles/dto/update-article.dto.ts`:
```ts
import { IsArray, IsObject, IsOptional, IsString, IsUrl, MaxLength, ArrayMaxSize } from 'class-validator';

export class UpdateArticleDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tagNames?: string[];
}
```

- [ ] **Step 2: Write the failing e2e test**

Create `apps/api/test/articles.e2e-spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Articles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const testEmail = `e2e-articles-${Date.now()}@e2e-test.local`;
  const testUsername = `e2earticles${Date.now()}`;
  let accessToken: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
    process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
    process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
    process.env.GOOGLE_CALLBACK_URL ??= 'http://localhost:3001/auth/google/callback';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: testEmail, password: 'password123', name: 'Articles User', username: testUsername });
    accessToken = signupRes.body.accessToken;
  });

  afterAll(async () => {
    await prisma.article.deleteMany({ where: { author: { email: testEmail } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: '@e2e-test.local' } } });
    await app.close();
  });

  it('creates a draft, updates it, publishes it, then unpublishes it', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const articleId = createRes.body.id;
    expect(createRes.body.status).toBe('DRAFT');
    expect(createRes.body.slug).toBeNull();

    const updateRes = await request(app.getHttpServer())
      .patch(`/articles/${articleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'My First Article',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }] },
        tagNames: ['vue', 'testing'],
      })
      .expect(200);
    expect(updateRes.body.title).toBe('My First Article');
    expect(updateRes.body.tagNames.sort()).toEqual(['testing', 'vue']);
    expect(updateRes.body.readingTime).toBe(1);

    const publishRes = await request(app.getHttpServer())
      .post(`/articles/${articleId}/publish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(publishRes.body.status).toBe('PUBLISHED');
    expect(publishRes.body.slug).toBe('my-first-article');
    expect(publishRes.body.publishedAt).not.toBeNull();

    const unpublishRes = await request(app.getHttpServer())
      .post(`/articles/${articleId}/unpublish`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(unpublishRes.body.status).toBe('DRAFT');
    expect(unpublishRes.body.slug).toBe('my-first-article');
  });

  it('rejects access to another author\'s article with 404, and rejects unauthenticated requests', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    const articleId = createRes.body.id;

    await request(app.getHttpServer()).get(`/articles/${articleId}`).expect(401);

    const otherSignup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: `e2e-articles-other-${Date.now()}@e2e-test.local`,
        password: 'password123',
        name: 'Other',
        username: `e2eother${Date.now()}`,
      });
    await request(app.getHttpServer())
      .get(`/articles/${articleId}`)
      .set('Authorization', `Bearer ${otherSignup.body.accessToken}`)
      .expect(404);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @hoard/api test:e2e`
Expected: FAIL — `404 Not Found` (routes don't exist yet).

- [ ] **Step 4: Implement `ArticlesController`**

Create `apps/api/src/articles/articles.controller.ts`. **Note the route ordering:** there are only 5 routes in this task, none colliding (the colliding one comes in Task 7) — but write this file with the awareness that Task 7 must insert its new route ABOVE `@Get(':id')`, not below.
```ts
import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { Article, AuthUser } from '@hoard/shared';
import { ArticlesService } from './articles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateArticleDto } from './dto/update-article.dto';

@Controller('articles')
@UseGuards(JwtAuthGuard)
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Post()
  create(@Req() req: Request & { user: AuthUser }): Promise<Article> {
    return this.articlesService.create(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request & { user: AuthUser }): Promise<Article> {
    return this.articlesService.findByIdForAuthor(id, req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
    @Req() req: Request & { user: AuthUser },
  ): Promise<Article> {
    return this.articlesService.update(id, req.user.id, dto);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @Req() req: Request & { user: AuthUser }): Promise<Article> {
    return this.articlesService.publish(id, req.user.id);
  }

  @Post(':id/unpublish')
  unpublish(@Param('id') id: string, @Req() req: Request & { user: AuthUser }): Promise<Article> {
    return this.articlesService.unpublish(id, req.user.id);
  }
}
```

- [ ] **Step 5: Create the module**

Create `apps/api/src/articles/articles.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';
import { TagsModule } from '../tags/tags.module';

@Module({
  imports: [TagsModule],
  controllers: [ArticlesController],
  providers: [ArticlesService],
  exports: [ArticlesService],
})
export class ArticlesModule {}
```

- [ ] **Step 6: Wire `ArticlesModule` into `AppModule`**

In `apps/api/src/app.module.ts`, add `ArticlesModule` to `imports` and add the import statement.

- [ ] **Step 7: Run the e2e suite to verify it passes**

Run: `pnpm --filter @hoard/api test:e2e`
Expected: PASS, all suites.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/articles/articles.controller.ts apps/api/src/articles/dto/update-article.dto.ts \
  apps/api/src/articles/articles.module.ts apps/api/test/articles.e2e-spec.ts apps/api/src/app.module.ts
git commit -m "feat: add ArticlesController (create, get, update, publish, unpublish)"
```

---

### Task 7: Cover-image-upload-signature endpoint

**Files:**
- Modify: `apps/api/src/articles/articles.controller.ts`
- Modify: `apps/api/src/articles/articles.module.ts`
- Modify: `apps/api/test/articles.e2e-spec.ts`

**Interfaces:**
- Consumes: `CloudinaryService.generateSignedUploadParams` (Phase 1b, unchanged — just called with `'covers'` instead of `'avatars'`).
- Produces: `GET /articles/cover-upload-signature` (authenticated, any logged-in user) returning the same `SignedUploadParams` shape Phase 1b's avatar endpoint returns. Task 12 (frontend cover upload UI) calls this.

- [ ] **Step 1: Write the failing e2e test**

In `apps/api/test/articles.e2e-spec.ts`, add a new test inside the existing `describe` block:
```ts
it('GET /articles/cover-upload-signature returns signed upload params, and is not swallowed by the :id route', async () => {
  const res = await request(app.getHttpServer())
    .get('/articles/cover-upload-signature')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  expect(res.body).toEqual(
    expect.objectContaining({ folder: 'covers', apiKey: expect.any(String), signature: expect.any(String) }),
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hoard/api test:e2e`
Expected: FAIL — either 404, or 500 from `ArticlesService.findByIdForAuthor('cover-upload-signature', ...)` being invoked because `:id` currently matches first (this is the exact collision described in Global Constraints).

- [ ] **Step 3: Add the route — declared BEFORE `@Get(':id')`**

In `apps/api/src/articles/articles.controller.ts`, import `CloudinaryService` and `SignedUploadParams`, add it to the constructor, and insert the new method between `create` and `findOne` (i.e. literal route first, param route second):
```ts
import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { Article, AuthUser } from '@hoard/shared';
import { ArticlesService } from './articles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateArticleDto } from './dto/update-article.dto';
import { CloudinaryService, type SignedUploadParams } from '../cloudinary/cloudinary.service';

@Controller('articles')
@UseGuards(JwtAuthGuard)
export class ArticlesController {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Post()
  create(@Req() req: Request & { user: AuthUser }): Promise<Article> {
    return this.articlesService.create(req.user.id);
  }

  @Get('cover-upload-signature')
  getCoverUploadSignature(): SignedUploadParams {
    return this.cloudinaryService.generateSignedUploadParams('covers');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request & { user: AuthUser }): Promise<Article> {
    return this.articlesService.findByIdForAuthor(id, req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
    @Req() req: Request & { user: AuthUser },
  ): Promise<Article> {
    return this.articlesService.update(id, req.user.id, dto);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @Req() req: Request & { user: AuthUser }): Promise<Article> {
    return this.articlesService.publish(id, req.user.id);
  }

  @Post(':id/unpublish')
  unpublish(@Param('id') id: string, @Req() req: Request & { user: AuthUser }): Promise<Article> {
    return this.articlesService.unpublish(id, req.user.id);
  }
}
```

- [ ] **Step 4: Import `CloudinaryModule` into `ArticlesModule`**

In `apps/api/src/articles/articles.module.ts`, add `CloudinaryModule` to `imports`:
```ts
import { Module } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';
import { TagsModule } from '../tags/tags.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [TagsModule, CloudinaryModule],
  controllers: [ArticlesController],
  providers: [ArticlesService],
  exports: [ArticlesService],
})
export class ArticlesModule {}
```

- [ ] **Step 5: Run the e2e suite to verify it passes**

Run: `pnpm --filter @hoard/api test:e2e`
Expected: PASS, all suites — including confirmation the literal route isn't swallowed by `:id`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/articles/articles.controller.ts apps/api/src/articles/articles.module.ts \
  apps/api/test/articles.e2e-spec.ts
git commit -m "feat: add cover-upload-signature endpoint"
```

---

### Task 8: Tiptap editor component

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/app/components/editor/ArticleEditor.vue`

**Interfaces:**
- Produces: `<ArticleEditor :content="..." @update="(content) => ..." />` — a presentational wrapper with no autosave logic of its own (it just emits the latest Tiptap JSON doc on every edit; Task 9/10 own the debouncing). Manually verified (per Global Constraints test policy), not unit tested — same precedent as Phase 1's editor-adjacent UI pieces.

- [ ] **Step 1: Add the Tiptap dependencies**

```bash
pnpm --filter @hoard/web add @tiptap/vue-3@^2.11.0 @tiptap/pm@^2.11.0 @tiptap/starter-kit@^2.11.0 \
  @tiptap/extension-image@^2.11.0 @tiptap/extension-link@^2.11.0
```

- [ ] **Step 2: Create the component**

Create `apps/web/app/components/editor/ArticleEditor.vue`:
```vue
<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';

const props = defineProps<{ content: Record<string, unknown> }>();
const emit = defineEmits<{ update: [content: Record<string, unknown>] }>();

const editor = useEditor({
  content: props.content,
  extensions: [StarterKit, Image, Link],
  onUpdate: ({ editor: instance }) => {
    emit('update', instance.getJSON());
  },
});

onBeforeUnmount(() => {
  editor.value?.destroy();
});
</script>

<template>
  <EditorContent :editor="editor" />
</template>
```

- [ ] **Step 3: Verify the build**

```bash
pnpm --filter @hoard/web build
```
Expected: succeeds — this step only proves the component compiles; manual click-through happens once it's wired into the write page in Task 10.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/app/components/editor/ArticleEditor.vue
git commit -m "feat: add Tiptap-based ArticleEditor component"
```

---

### Task 9: `useArticleAutosave` composable

**Files:**
- Create: `apps/web/app/composables/useArticleAutosave.ts`
- Create: `apps/web/app/composables/useArticleAutosave.test.ts`

**Interfaces:**
- Consumes: `useApi` (Phase 1, unchanged).
- Produces: `useArticleAutosave(apiBase: string, articleId: string)` returning `{ status: Ref<'idle'|'saving'|'saved'|'error'>, scheduleSave(patch, accessToken, onRefresh) }`. **Patches merge, not replace** — calling `scheduleSave({title: 'x'})` then `scheduleSave({content: {...}})` within the debounce window sends `PATCH {title: 'x', content: {...}}`, not just the second call's payload alone (a naive "replace pending patch" implementation would silently drop the title — this is the bug this task's tests exist to catch). Task 10 calls `scheduleSave`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/composables/useArticleAutosave.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useArticleAutosave } from './useArticleAutosave';

vi.mock('./useApi', () => ({ useApi: vi.fn() }));
import { useApi } from './useApi';

describe('useArticleAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces and sends a single PATCH after the delay', async () => {
    (useApi as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { scheduleSave, status } = useArticleAutosave('http://localhost:3001', 'a1');

    scheduleSave({ title: 'Hello' }, 'token', vi.fn());
    expect(useApi).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);

    expect(useApi).toHaveBeenCalledTimes(1);
    expect(useApi).toHaveBeenCalledWith(
      'http://localhost:3001',
      '/articles/a1',
      'token',
      expect.any(Function),
      { method: 'PATCH', body: { title: 'Hello' } },
    );
    expect(status.value).toBe('saved');
  });

  it('merges patches from multiple calls within the debounce window instead of dropping earlier fields', async () => {
    (useApi as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { scheduleSave } = useArticleAutosave('http://localhost:3001', 'a1');

    scheduleSave({ title: 'Hello' }, 'token', vi.fn());
    vi.advanceTimersByTime(500);
    scheduleSave({ content: { type: 'doc' } }, 'token', vi.fn());

    await vi.advanceTimersByTimeAsync(2000);

    expect(useApi).toHaveBeenCalledTimes(1);
    expect(useApi).toHaveBeenCalledWith(
      'http://localhost:3001',
      '/articles/a1',
      'token',
      expect.any(Function),
      { method: 'PATCH', body: { title: 'Hello', content: { type: 'doc' } } },
    );
  });

  it('sets status to error when the PATCH fails', async () => {
    (useApi as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));
    const { scheduleSave, status } = useArticleAutosave('http://localhost:3001', 'a1');

    scheduleSave({ title: 'Hello' }, 'token', vi.fn());
    await vi.advanceTimersByTimeAsync(2000);

    expect(status.value).toBe('error');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hoard/web test useArticleAutosave`
Expected: FAIL — `Cannot find module './useArticleAutosave'`.

- [ ] **Step 3: Implement**

Create `apps/web/app/composables/useArticleAutosave.ts`:
```ts
import { ref, type Ref } from 'vue';
import { useApi } from './useApi';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useArticleAutosave(
  apiBase: string,
  articleId: string,
): { status: Ref<AutosaveStatus>; scheduleSave: (
  patch: Record<string, unknown>,
  accessToken: string | null,
  onRefresh: () => Promise<string>,
) => void } {
  const status = ref<AutosaveStatus>('idle');
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pendingPatch: Record<string, unknown> = {};

  function scheduleSave(
    patch: Record<string, unknown>,
    accessToken: string | null,
    onRefresh: () => Promise<string>,
  ) {
    pendingPatch = { ...pendingPatch, ...patch };
    if (timeoutId) clearTimeout(timeoutId);
    status.value = 'idle';
    timeoutId = setTimeout(async () => {
      const toSave = pendingPatch;
      pendingPatch = {};
      status.value = 'saving';
      try {
        await useApi(apiBase, `/articles/${articleId}`, accessToken, onRefresh, {
          method: 'PATCH',
          body: toSave,
        });
        status.value = 'saved';
      } catch {
        status.value = 'error';
      }
    }, 2000);
  }

  return { status, scheduleSave };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @hoard/web test useArticleAutosave`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/composables/useArticleAutosave.ts apps/web/app/composables/useArticleAutosave.test.ts
git commit -m "feat: add useArticleAutosave composable"
```

---

### Task 10: `/write` and `/write/[id]` pages — core editor loop

**Files:**
- Create: `apps/web/app/pages/write.vue`
- Create: `apps/web/app/pages/write/[id].vue`

**Interfaces:**
- Consumes: `ArticleEditor` (Task 8), `useArticleAutosave` (Task 9), `useApi` + `useAuthStore` (Phase 1, unchanged).
- Produces: a working create-draft → edit-with-autosave loop. Title input and editor content both autosave. Tasks 11-13 add tag picker, cover image, and publish/unpublish controls to `write/[id].vue` incrementally. Manually verified (no automated test — same precedent as `settings/profile.vue`).

- [ ] **Step 1: Create the redirect page**

Create `apps/web/app/pages/write.vue`:
```vue
<script setup lang="ts">
const auth = useAuthStore();
const config = useRuntimeConfig();
const router = useRouter();

if (!auth.user) {
  await navigateTo('/login');
}

const article = await useApi<{ id: string }>(
  config.public.apiBase,
  '/articles',
  auth.accessToken,
  () => auth.refreshAccessToken(config.public.apiBase),
  { method: 'POST' },
);
await router.replace(`/write/${article.id}`);
</script>

<template>
  <p>Creating a new draft...</p>
</template>
```

- [ ] **Step 2: Create the editor page**

Create `apps/web/app/pages/write/[id].vue`:
```vue
<script setup lang="ts">
import ArticleEditor from '~/components/editor/ArticleEditor.vue';
import type { Article } from '@hoard/shared';

const route = useRoute();
const auth = useAuthStore();
const config = useRuntimeConfig();

if (!auth.user) {
  await navigateTo('/login');
}

const articleId = route.params.id as string;
const article = ref<Article | null>(null);
const title = ref('');
const loadError = ref<string | null>(null);

try {
  article.value = await useApi<Article>(
    config.public.apiBase,
    `/articles/${articleId}`,
    auth.accessToken,
    () => auth.refreshAccessToken(config.public.apiBase),
  );
  title.value = article.value.title;
} catch {
  loadError.value = 'Could not load this draft.';
}

const { status: saveStatus, scheduleSave } = useArticleAutosave(config.public.apiBase, articleId);

function save(patch: Record<string, unknown>) {
  scheduleSave(patch, auth.accessToken, () => auth.refreshAccessToken(config.public.apiBase));
}

function onTitleInput() {
  save({ title: title.value });
}

function onEditorUpdate(content: Record<string, unknown>) {
  save({ content });
}
</script>

<template>
  <p v-if="loadError">{{ loadError }}</p>
  <div v-else-if="article">
    <input v-model="title" placeholder="Title" @input="onTitleInput" />
    <p>{{ saveStatus }}</p>
    <ArticleEditor :content="article.content" @update="onEditorUpdate" />
  </div>
</template>
```

- [ ] **Step 3: Manual verification**

Start `pnpm dev`, log in, navigate to `/write`. Confirm: (a) it redirects to `/write/<some-uuid>`, (b) typing a title and typing in the editor both eventually show "saved" after ~2s of inactivity, (c) reloading the page shows the same title/content (proving the autosave actually persisted), (d) navigating to `/write/<someone-elses-article-id>` (e.g. by editing the URL) shows "Could not load this draft."

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/pages/write.vue apps/web/app/pages/write/[id].vue
git commit -m "feat: add write/[id] page with Tiptap editor and autosave"
```

---

### Task 11: Tag picker on the write page

**Files:**
- Modify: `apps/web/app/pages/write/[id].vue`

**Interfaces:**
- Consumes: `GET /tags` (Task 4, public, no auth needed).
- Produces: a tag input + suggestion list wired into the same `save()`/`scheduleSave` debounce path Task 10 built, via `tagNames`.

- [ ] **Step 1: Add the tag picker to the script and template**

In `apps/web/app/pages/write/[id].vue`, add to the `<script setup>` block (after the existing `title`/`loadError` refs):
```ts
const allTags = ref<{ name: string }[]>([]);
const tagNames = ref<string[]>(article.value?.tagNames ?? []);
const newTagInput = ref('');

try {
  allTags.value = await $fetch<{ name: string }[]>(`${config.public.apiBase}/tags`);
} catch {
  allTags.value = [];
}

function addTag(name: string) {
  const trimmed = name.trim();
  if (!trimmed || tagNames.value.includes(trimmed)) return;
  tagNames.value = [...tagNames.value, trimmed];
  newTagInput.value = '';
  save({ tagNames: tagNames.value });
}

function removeTag(name: string) {
  tagNames.value = tagNames.value.filter((t) => t !== name);
  save({ tagNames: tagNames.value });
}
```

Add to the `<template>`, inside the `v-else-if="article"` block, after the title input:
```html
<div>
  <span v-for="tag in tagNames" :key="tag">
    {{ tag }} <button type="button" @click="removeTag(tag)">x</button>
  </span>
  <input v-model="newTagInput" placeholder="Add a tag" @keyup.enter="addTag(newTagInput)" />
  <button
    v-for="suggestion in allTags.filter((t) => !tagNames.includes(t.name))"
    :key="suggestion.name"
    type="button"
    @click="addTag(suggestion.name)"
  >
    {{ suggestion.name }}
  </button>
</div>
```

- [ ] **Step 2: Manual verification**

On `/write/<id>`, type a brand-new tag name and press Enter — confirm it appears as a chip and (after ~2s) the autosave status shows "saved." Reload the page — confirm the tag persisted. Click an existing-tag suggestion — confirm it's added without creating a duplicate `Tag` row (check via `GET /tags` returning no duplicate name).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/pages/write/[id].vue
git commit -m "feat: add tag picker to the write page"
```

---

### Task 12: Cover image upload on the write page

**Files:**
- Modify: `apps/web/app/pages/write/[id].vue`

**Interfaces:**
- Consumes: `GET /articles/cover-upload-signature` (Task 7), Cloudinary's direct-upload endpoint (same external call pattern as Phase 1b's avatar upload — `$fetch` directly to `https://api.cloudinary.com/...`, not via `useApi`).
- Produces: a file input that uploads a cover image and immediately `PATCH`es `coverImageUrl` (not routed through the debounced autosave — an upload's completion should be reflected immediately, mirroring Phase 1b Task 5's avatar pattern exactly).

- [ ] **Step 1: Add the upload handler and UI**

In `apps/web/app/pages/write/[id].vue`, add to `<script setup>`:
```ts
const coverUploading = ref(false);
const coverError = ref<string | null>(null);

async function onCoverSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  coverUploading.value = true;
  coverError.value = null;
  try {
    const signature = await useApi<{
      timestamp: number;
      signature: string;
      apiKey: string;
      cloudName: string;
      folder: string;
    }>(
      config.public.apiBase,
      '/articles/cover-upload-signature',
      auth.accessToken,
      () => auth.refreshAccessToken(config.public.apiBase),
    );

    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', signature.apiKey);
    formData.append('timestamp', String(signature.timestamp));
    formData.append('signature', signature.signature);
    formData.append('folder', signature.folder);

    const uploadResult = await $fetch<{ secure_url: string }>(
      `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`,
      { method: 'POST', body: formData },
    );

    const updated = await useApi<Article>(
      config.public.apiBase,
      `/articles/${articleId}`,
      auth.accessToken,
      () => auth.refreshAccessToken(config.public.apiBase),
      { method: 'PATCH', body: { coverImageUrl: uploadResult.secure_url } },
    );
    if (article.value) article.value.coverImageUrl = updated.coverImageUrl;
  } catch {
    coverError.value = 'Cover image upload failed. Please try again.';
  } finally {
    coverUploading.value = false;
  }
}
```

Add to the `<template>`, after the tag picker:
```html
<div>
  <img v-if="article.coverImageUrl" :src="article.coverImageUrl" alt="Cover image" width="200" />
  <input type="file" accept="image/*" :disabled="coverUploading" @change="onCoverSelected" />
  <p v-if="coverUploading">Uploading...</p>
  <p v-if="coverError">{{ coverError }}</p>
</div>
```

- [ ] **Step 2: Manual verification**

On `/write/<id>`, select an image file. Confirm: (a) "Uploading..." shows briefly, (b) the cover image preview appears, (c) reloading the page shows the same cover image (proving the `PATCH` persisted), (d) the image appears in the Cloudinary `covers` folder (check the Cloudinary media library dashboard).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/pages/write/[id].vue
git commit -m "feat: add cover image upload to the write page"
```

---

### Task 13: Publish / unpublish controls

**Files:**
- Modify: `apps/web/app/pages/write/[id].vue`

**Interfaces:**
- Consumes: `POST /articles/:id/publish`, `POST /articles/:id/unpublish` (Task 6).
- Produces: a button toggling between the two, reflecting `article.status` and showing the resulting `slug`/public URL once published. This is the last piece of Phase 2a — closes out this sub-phase's "Done when."

- [ ] **Step 1: Add the publish/unpublish handlers and UI**

In `apps/web/app/pages/write/[id].vue`, add to `<script setup>`:
```ts
const publishError = ref<string | null>(null);

async function togglePublish() {
  if (!article.value) return;
  publishError.value = null;
  const action = article.value.status === 'PUBLISHED' ? 'unpublish' : 'publish';
  try {
    article.value = await useApi<Article>(
      config.public.apiBase,
      `/articles/${articleId}/${action}`,
      auth.accessToken,
      () => auth.refreshAccessToken(config.public.apiBase),
      { method: 'POST' },
    );
  } catch {
    publishError.value = `Could not ${action} this article. Make sure it has a title.`;
  }
}
```

Add to the `<template>`, after the cover image block:
```html
<div>
  <button type="button" @click="togglePublish">
    {{ article.status === 'PUBLISHED' ? 'Unpublish' : 'Publish' }}
  </button>
  <p v-if="article.status === 'PUBLISHED'">
    Published at <a :href="`/@${auth.user?.username}/${article.slug}`">/@{{ auth.user?.username }}/{{ article.slug }}</a>
  </p>
  <p v-if="publishError">{{ publishError }}</p>
</div>
```

- [ ] **Step 2: Manual verification**

On `/write/<id>` with a title and some content, click "Publish" — confirm the status flips to "Unpublish" and a link to `/@username/slug` appears (the link itself will 404 until Phase 2b builds that page — expected, not a bug). Click "Unpublish" — confirm it flips back. Click "Publish" again — confirm the slug stays the same as the first publish (not regenerated).

- [ ] **Step 3: Run the full test suite one more time**

```bash
pnpm build
pnpm test
pnpm --filter @hoard/api test:e2e
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/pages/write/[id].vue
git commit -m "feat: add publish/unpublish controls to the write page"
```

---

## Done When

- A logged-in user can navigate to `/write`, land on a fresh draft at `/write/<id>`, type a title and rich-text content that autosaves automatically, attach existing or new tags, upload a cover image, and publish the article (receiving a unique slug) — then unpublish it and republish it without losing the slug or original publish date.
- A non-owner (or logged-out visitor) cannot read or modify another user's draft via the `/articles/:id` endpoints (404, not 403, not 401-then-leak).
- All automated tests pass: `pnpm build`, `pnpm test` (unit, all three packages), `pnpm --filter @hoard/api test:e2e`.
- Public reading of a published article and the tag-listing page are explicitly **not** part of this phase's done-when — that's Phase 2b, which can begin once this phase's `Article`/`Tag` API is merged.
