# Phase 4 — Social Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add follow/unfollow (with a Following tab in the home feed), claps (10-clap cap), comments (one level of replies), and bookmarks (with a Reading list page).

**Architecture:** Four new NestJS modules (Follows, Claps, Comments, Bookmarks) share one Prisma migration. FeedService gains `findFollowingPage` for the auth'd Following feed. Four Vue composables wrap the API calls; four UI components and four page modifications wire everything together.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Vue 3 / Nuxt 4, Pinia auth store, Vitest (web), Jest (API).

## Global Constraints

- All new models use `@id @default(uuid())` — consistent with existing schema
- `CLAP_CAP = 10` — enforced server-side; never hardcoded as a bare literal in service code
- Follow self → `400 BadRequest`; delete another user's comment → `403 ForbiddenException`
- `GET /feed/following` requires `JwtAuthGuard`; `GET /articles/:slug/claps` uses `OptionalJwtAuthGuard` (returns `userClaps: 0` when unauthenticated)
- All write endpoints (`POST`, `DELETE`) for social features require `JwtAuthGuard`
- Public endpoints (`GET /articles/:slug/comments`, `GET /articles/:slug/claps`) have no auth guard
- No changes to `ArticleListItem` shape — social counts live on separate endpoints
- Composables take `(apiBase: string, …, accessToken: string | null, onRefresh: () => Promise<string>)` — same pattern as `useArticleAutosave`
- Frontend composable tests use `vi.mock('./useApi', ...)` pattern (same as `useArticleAutosave.test.ts`)
- BookmarkButton and ClapButton render nothing / redirect to login when `auth.user` is absent
- FollowButton renders nothing when `auth.user` is absent or viewing own profile
- `reading-list.vue` uses `definePageMeta({ middleware: 'auth' })`
- Run API tests from worktree root: `pnpm --filter @hoard/api test`
- Run web tests from worktree root: `pnpm --filter @hoard/web test`
- Run full build: `pnpm build`

---

### Task 1: Prisma schema migration + shared social types

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_phase_4_social/migration.sql` (generated)
- Create: `packages/shared/src/social.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `FollowStatus`, `ClapStatus`, `CommentItem`, `BookmarkStatus` — shared types consumed by Tasks 2–9

- [ ] **Step 1: Add the 4 new models to the Prisma schema**

Edit `apps/api/prisma/schema.prisma`. Add new relations to existing models, then append the 4 new models:

```prisma
// Add to User model (before the closing brace):
  following     Follow[]   @relation("Following")
  followers     Follow[]   @relation("Followers")
  claps         Clap[]
  comments      Comment[]
  bookmarks     Bookmark[]

// Add to Article model (before the closing brace):
  claps         Clap[]
  comments      Comment[]
  bookmarks     Bookmark[]

// Append new models after ArticleTag:

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

- [ ] **Step 2: Create and apply the migration**

Run (Docker DB must be running — `docker compose up -d db`):
```bash
pnpm --filter @hoard/api exec prisma migrate dev --name phase_4_social
```
Expected: "Your database is now in sync with your schema." A new migration directory appears at `apps/api/prisma/migrations/<timestamp>_phase_4_social/`.

- [ ] **Step 3: Create the shared social types**

Create `packages/shared/src/social.ts`:

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

- [ ] **Step 4: Re-export from the shared index**

Edit `packages/shared/src/index.ts` — add one line:

```typescript
export * from './social.js';
```

- [ ] **Step 5: Rebuild shared package**

Run: `pnpm --filter @hoard/shared build`
Expected: `dist/` updated, no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma \
  apps/api/prisma/migrations/ \
  packages/shared/src/social.ts \
  packages/shared/src/index.ts
git commit -m "feat: add social schema (Follow, Clap, Comment, Bookmark) and shared types"
```

---

### Task 2: Follows API + Following feed endpoint

**Files:**
- Create: `apps/api/src/follows/follows.service.ts`
- Create: `apps/api/src/follows/follows.service.spec.ts`
- Create: `apps/api/src/follows/follows.controller.ts`
- Create: `apps/api/src/follows/follows.module.ts`
- Modify: `apps/api/src/feed/feed.service.ts`
- Modify: `apps/api/src/feed/feed.service.spec.ts`
- Modify: `apps/api/src/feed/feed.controller.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `FollowStatus` from `@hoard/shared`; `PrismaService`; `JwtAuthGuard` from `../auth/jwt-auth.guard`; existing `findPage` from `FeedService`
- Produces: `POST /follows/:username`, `DELETE /follows/:username`, `GET /follows/:username/status`; `GET /feed/following`; `FeedService.findFollowingPage(userId, cursor?, limit?)`

- [ ] **Step 1: Write FollowsService tests**

Create `apps/api/src/follows/follows.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FollowsService } from './follows.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FollowsService', () => {
  let service: FollowsService;
  const prismaMock = {
    user: { findUnique: jest.fn() },
    follow: { upsert: jest.fn(), deleteMany: jest.fn(), findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [FollowsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get<FollowsService>(FollowsService);
  });

  it('follow creates a Follow record and returns isFollowing: true', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u2' });
    prismaMock.follow.upsert.mockResolvedValue({});
    const result = await service.follow('u1', 'alice');
    expect(prismaMock.follow.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { followerId_followingId: { followerId: 'u1', followingId: 'u2' } } }),
    );
    expect(result).toEqual({ isFollowing: true });
  });

  it('follow throws BadRequestException when following self', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' });
    await expect(service.follow('u1', 'self')).rejects.toThrow(BadRequestException);
    expect(prismaMock.follow.upsert).not.toHaveBeenCalled();
  });

  it('follow throws NotFoundException when target user does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(service.follow('u1', 'nobody')).rejects.toThrow(NotFoundException);
  });

  it('unfollow removes the Follow record', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u2' });
    prismaMock.follow.deleteMany.mockResolvedValue({ count: 1 });
    await service.unfollow('u1', 'alice');
    expect(prismaMock.follow.deleteMany).toHaveBeenCalledWith({
      where: { followerId: 'u1', followingId: 'u2' },
    });
  });

  it('getStatus returns isFollowing: true when record exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u2' });
    prismaMock.follow.findUnique.mockResolvedValue({ id: 'f1' });
    const result = await service.getStatus('u1', 'alice');
    expect(result).toEqual({ isFollowing: true });
  });

  it('getStatus returns isFollowing: false when record does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u2' });
    prismaMock.follow.findUnique.mockResolvedValue(null);
    const result = await service.getStatus('u1', 'alice');
    expect(result).toEqual({ isFollowing: false });
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

Run: `pnpm --filter @hoard/api test -- --testPathPattern=follows.service`
Expected: FAIL — "Cannot find module './follows.service'"

- [ ] **Step 3: Implement FollowsService**

Create `apps/api/src/follows/follows.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { FollowStatus } from '@hoard/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  async follow(followerId: string, username: string): Promise<FollowStatus> {
    const target = await this.prisma.user.findUnique({ where: { username } });
    if (!target) throw new NotFoundException('User not found');
    if (target.id === followerId) throw new BadRequestException('Cannot follow yourself');
    await this.prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId: target.id } },
      create: { followerId, followingId: target.id },
      update: {},
    });
    return { isFollowing: true };
  }

  async unfollow(followerId: string, username: string): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { username } });
    if (!target) throw new NotFoundException('User not found');
    await this.prisma.follow.deleteMany({ where: { followerId, followingId: target.id } });
  }

  async getStatus(followerId: string, username: string): Promise<FollowStatus> {
    const target = await this.prisma.user.findUnique({ where: { username } });
    if (!target) throw new NotFoundException('User not found');
    const record = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId: target.id } },
    });
    return { isFollowing: !!record };
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

Run: `pnpm --filter @hoard/api test -- --testPathPattern=follows.service`
Expected: PASS — 6 tests

- [ ] **Step 5: Write FeedService.findFollowingPage tests**

Add to `apps/api/src/feed/feed.service.spec.ts` — add a second `describe` block at the bottom:

```typescript
describe('FeedService.findFollowingPage', () => {
  let service: FeedService;
  const prismaMock = {
    follow: { findMany: jest.fn() },
    article: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [FeedService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get<FeedService>(FeedService);
  });

  it('falls back to findPage (Explore) when user follows nobody', async () => {
    prismaMock.follow.findMany.mockResolvedValue([]);
    prismaMock.article.findMany.mockResolvedValue([]);
    const result = await service.findFollowingPage('u1');
    expect(result).toEqual({ articles: [], nextCursor: null });
    expect(prismaMock.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PUBLISHED' } }),
    );
  });

  it('filters by followed author IDs when user has follows', async () => {
    prismaMock.follow.findMany.mockResolvedValue([{ followingId: 'u2' }, { followingId: 'u3' }]);
    prismaMock.article.findMany.mockResolvedValue([]);
    await service.findFollowingPage('u1');
    expect(prismaMock.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ authorId: { in: ['u2', 'u3'] } }),
      }),
    );
  });
});
```

- [ ] **Step 6: Implement FeedService.findFollowingPage**

Edit `apps/api/src/feed/feed.service.ts` — add the method:

```typescript
async findFollowingPage(userId: string, cursor?: string, limit = DEFAULT_LIMIT): Promise<PaginatedArticles> {
  const follows = await this.prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  if (follows.length === 0) return this.findPage(cursor, limit);

  const followingIds = follows.map((f) => f.followingId);
  const effectiveLimit = Math.min(Number.isFinite(limit) ? limit : DEFAULT_LIMIT, MAX_LIMIT);
  const take = effectiveLimit + 1;
  const articles = await this.prisma.article.findMany({
    where: {
      status: 'PUBLISHED',
      authorId: { in: followingIds },
      ...(cursor ? { publishedAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { publishedAt: 'desc' },
    take,
    include: ARTICLE_WITH_AUTHOR_INCLUDE,
  });
  const hasNext = articles.length > effectiveLimit;
  const page = hasNext ? articles.slice(0, effectiveLimit) : articles;
  return {
    articles: page.map((a) => toArticleListItem(a as ArticleWithTagsAndAuthor)),
    nextCursor: hasNext ? (page[page.length - 1].publishedAt as Date).toISOString() : null,
  };
}
```

Note: `this.prisma.follow` requires that `follow` is on the PrismaService client — it will be after the migration is applied (Step 2 of Task 1).

- [ ] **Step 7: Run full feed tests**

Run: `pnpm --filter @hoard/api test -- --testPathPattern=feed.service`
Expected: PASS — all existing tests + 2 new

- [ ] **Step 8: Create FollowsController and FollowsModule**

Create `apps/api/src/follows/follows.controller.ts`:

```typescript
import { Controller, Delete, Get, HttpCode, Param, Post, Request, UseGuards } from '@nestjs/common';
import type { FollowStatus } from '@hoard/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FollowsService } from './follows.service';

@Controller('follows')
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  @Post(':username')
  @UseGuards(JwtAuthGuard)
  follow(@Param('username') username: string, @Request() req): Promise<FollowStatus> {
    return this.followsService.follow(req.user.id, username);
  }

  @Delete(':username')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  unfollow(@Param('username') username: string, @Request() req): Promise<void> {
    return this.followsService.unfollow(req.user.id, username);
  }

  @Get(':username/status')
  @UseGuards(JwtAuthGuard)
  getStatus(@Param('username') username: string, @Request() req): Promise<FollowStatus> {
    return this.followsService.getStatus(req.user.id, username);
  }
}
```

Create `apps/api/src/follows/follows.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { FollowsController } from './follows.controller';
import { FollowsService } from './follows.service';

@Module({
  controllers: [FollowsController],
  providers: [FollowsService],
})
export class FollowsModule {}
```

- [ ] **Step 9: Add GET /feed/following to FeedController**

Edit `apps/api/src/feed/feed.controller.ts`:

```typescript
import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import type { PaginatedArticles } from '@hoard/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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

  @Get('following')
  @UseGuards(JwtAuthGuard)
  findFollowingPage(
    @Request() req,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedArticles> {
    return this.feedService.findFollowingPage(req.user.id, cursor, limit ? Number(limit) : undefined);
  }
}
```

- [ ] **Step 10: Wire FollowsModule into AppModule**

Edit `apps/api/src/app.module.ts`:

```typescript
import { FollowsModule } from './follows/follows.module';
// ...
imports: [
  PrismaModule,
  ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
  UsersModule,
  AuthModule,
  TagsModule,
  ArticlesModule,
  FeedModule,
  SearchModule,
  FollowsModule,
],
```

- [ ] **Step 11: Run full API test suite**

Run: `pnpm --filter @hoard/api test`
Expected: all tests pass.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/follows/ \
  apps/api/src/feed/feed.service.ts \
  apps/api/src/feed/feed.service.spec.ts \
  apps/api/src/feed/feed.controller.ts \
  apps/api/src/app.module.ts
git commit -m "feat: add follows API and GET /feed/following endpoint"
```

---

### Task 3: Claps API

**Files:**
- Create: `apps/api/src/auth/optional-jwt-auth.guard.ts`
- Create: `apps/api/src/claps/claps.service.ts`
- Create: `apps/api/src/claps/claps.service.spec.ts`
- Create: `apps/api/src/claps/claps.controller.ts`
- Create: `apps/api/src/claps/claps.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `ClapStatus` from `@hoard/shared`; `PrismaService`; `JwtAuthGuard`, new `OptionalJwtAuthGuard`
- Produces: `GET /articles/:slug/claps` (optional auth), `POST /articles/:slug/claps` (auth); `ClapsService.getStatus(slug, userId?)`, `ClapsService.clap(slug, userId)`

- [ ] **Step 1: Create OptionalJwtAuthGuard**

Create `apps/api/src/auth/optional-jwt-auth.guard.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(_err: any, user: any) {
    return user ?? null;
  }
}
```

- [ ] **Step 2: Write ClapsService tests**

Create `apps/api/src/claps/claps.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClapsService } from './claps.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ClapsService', () => {
  let service: ClapsService;
  const prismaMock = {
    article: { findUnique: jest.fn() },
    clap: {
      aggregate: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const article = { id: 'art1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClapsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get<ClapsService>(ClapsService);
  });

  it('getStatus returns totalClaps and userClaps: 0 when unauthenticated', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    prismaMock.clap.aggregate.mockResolvedValue({ _sum: { count: 5 } });
    const result = await service.getStatus('my-article');
    expect(result).toEqual({ totalClaps: 5, userClaps: 0 });
    expect(prismaMock.clap.findUnique).not.toHaveBeenCalled();
  });

  it('getStatus returns userClaps from DB when userId is provided', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    prismaMock.clap.aggregate.mockResolvedValue({ _sum: { count: 10 } });
    prismaMock.clap.findUnique.mockResolvedValue({ count: 3 });
    const result = await service.getStatus('my-article', 'u1');
    expect(result).toEqual({ totalClaps: 10, userClaps: 3 });
  });

  it('getStatus throws NotFoundException for unknown slug', async () => {
    prismaMock.article.findUnique.mockResolvedValue(null);
    await expect(service.getStatus('no-such-slug')).rejects.toThrow(NotFoundException);
  });

  it('clap increments count and returns updated totals', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    prismaMock.clap.findUnique.mockResolvedValueOnce(null); // before upsert
    prismaMock.clap.upsert.mockResolvedValue({});
    prismaMock.clap.aggregate.mockResolvedValue({ _sum: { count: 1 } });
    prismaMock.clap.findUnique.mockResolvedValueOnce({ count: 1 }); // after upsert (getStatus)
    const result = await service.clap('my-article', 'u1');
    expect(prismaMock.clap.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_articleId: { userId: 'u1', articleId: 'art1' } },
        create: { userId: 'u1', articleId: 'art1', count: 1 },
        update: { count: { increment: 1 } },
      }),
    );
    expect(result.userClaps).toBe(1);
  });

  it('clap throws BadRequestException when userClaps is already at cap', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    prismaMock.clap.findUnique.mockResolvedValue({ count: 10 });
    await expect(service.clap('my-article', 'u1')).rejects.toThrow(BadRequestException);
    expect(prismaMock.clap.upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests — confirm they fail**

Run: `pnpm --filter @hoard/api test -- --testPathPattern=claps.service`
Expected: FAIL — "Cannot find module './claps.service'"

- [ ] **Step 4: Implement ClapsService**

Create `apps/api/src/claps/claps.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ClapStatus } from '@hoard/shared';
import { PrismaService } from '../prisma/prisma.service';

const CLAP_CAP = 10;

@Injectable()
export class ClapsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(slug: string, userId?: string): Promise<ClapStatus> {
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article) throw new NotFoundException('Article not found');

    const agg = await this.prisma.clap.aggregate({
      where: { articleId: article.id },
      _sum: { count: true },
    });
    const totalClaps = agg._sum.count ?? 0;

    let userClaps = 0;
    if (userId) {
      const clap = await this.prisma.clap.findUnique({
        where: { userId_articleId: { userId, articleId: article.id } },
      });
      userClaps = clap?.count ?? 0;
    }

    return { totalClaps, userClaps };
  }

  async clap(slug: string, userId: string): Promise<ClapStatus> {
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article) throw new NotFoundException('Article not found');

    const existing = await this.prisma.clap.findUnique({
      where: { userId_articleId: { userId, articleId: article.id } },
    });
    if ((existing?.count ?? 0) >= CLAP_CAP) {
      throw new BadRequestException(`Clap limit of ${CLAP_CAP} reached`);
    }

    await this.prisma.clap.upsert({
      where: { userId_articleId: { userId, articleId: article.id } },
      create: { userId, articleId: article.id, count: 1 },
      update: { count: { increment: 1 } },
    });

    return this.getStatus(slug, userId);
  }
}
```

- [ ] **Step 5: Run tests — confirm they pass**

Run: `pnpm --filter @hoard/api test -- --testPathPattern=claps.service`
Expected: PASS — 5 tests

- [ ] **Step 6: Create ClapsController and ClapsModule**

Create `apps/api/src/claps/claps.controller.ts`:

```typescript
import { Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import type { ClapStatus } from '@hoard/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { ClapsService } from './claps.service';

@Controller('articles')
export class ClapsController {
  constructor(private readonly clapsService: ClapsService) {}

  @Get(':slug/claps')
  @UseGuards(OptionalJwtAuthGuard)
  getStatus(@Param('slug') slug: string, @Request() req): Promise<ClapStatus> {
    return this.clapsService.getStatus(slug, req.user?.id);
  }

  @Post(':slug/claps')
  @UseGuards(JwtAuthGuard)
  clap(@Param('slug') slug: string, @Request() req): Promise<ClapStatus> {
    return this.clapsService.clap(slug, req.user.id);
  }
}
```

Create `apps/api/src/claps/claps.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ClapsController } from './claps.controller';
import { ClapsService } from './claps.service';

@Module({
  controllers: [ClapsController],
  providers: [ClapsService],
})
export class ClapsModule {}
```

- [ ] **Step 7: Wire ClapsModule into AppModule**

Add to `apps/api/src/app.module.ts` imports:
```typescript
import { ClapsModule } from './claps/claps.module';
// ... add ClapsModule to the imports array after FollowsModule
```

- [ ] **Step 8: Run full API test suite**

Run: `pnpm --filter @hoard/api test`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/auth/optional-jwt-auth.guard.ts \
  apps/api/src/claps/ \
  apps/api/src/app.module.ts
git commit -m "feat: add claps API with 10-clap cap"
```

---

### Task 4: Comments API

**Files:**
- Create: `apps/api/src/comments/comments.service.ts`
- Create: `apps/api/src/comments/comments.service.spec.ts`
- Create: `apps/api/src/comments/comments.controller.ts`
- Create: `apps/api/src/comments/comments.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `CommentItem` from `@hoard/shared`; `PrismaService`; `JwtAuthGuard`
- Produces: `GET /articles/:slug/comments`, `POST /articles/:slug/comments`, `POST /articles/:slug/comments/:commentId/replies`, `DELETE /comments/:commentId`

- [ ] **Step 1: Write CommentsService tests**

Create `apps/api/src/comments/comments.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';

const makeComment = (overrides = {}) => ({
  id: 'c1',
  content: 'Hello',
  authorId: 'u1',
  articleId: 'art1',
  parentId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  author: { username: 'user', name: 'User', avatarUrl: null },
  replies: [],
  ...overrides,
});

describe('CommentsService', () => {
  let service: CommentsService;
  const prismaMock = {
    article: { findUnique: jest.fn() },
    comment: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
  };

  const article = { id: 'art1', slug: 'my-article' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommentsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get<CommentsService>(CommentsService);
  });

  it('findAll returns top-level comments with replies', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    prismaMock.comment.findMany.mockResolvedValue([makeComment()]);
    const result = await service.findAll('my-article');
    expect(result).toHaveLength(1);
    expect(result[0].replies).toEqual([]);
  });

  it('create adds a top-level comment with parentId: null', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    prismaMock.comment.create.mockResolvedValue(makeComment());
    const result = await service.create('my-article', 'u1', 'Hello');
    expect(prismaMock.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentId: null, content: 'Hello' }),
      }),
    );
    expect(result.content).toBe('Hello');
  });

  it('create throws BadRequestException for empty content', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    await expect(service.create('my-article', 'u1', '   ')).rejects.toThrow(BadRequestException);
  });

  it('createReply sets parentId correctly', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    prismaMock.comment.findUnique.mockResolvedValue(makeComment({ id: 'c1', parentId: null }));
    prismaMock.comment.create.mockResolvedValue(makeComment({ id: 'c2', parentId: 'c1' }));
    await service.createReply('my-article', 'c1', 'u1', 'Nice!');
    expect(prismaMock.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentId: 'c1' }),
      }),
    );
  });

  it('createReply throws BadRequestException when trying to reply to a reply', async () => {
    prismaMock.article.findUnique.mockResolvedValue(article);
    prismaMock.comment.findUnique.mockResolvedValue(makeComment({ parentId: 'c0' }));
    await expect(service.createReply('my-article', 'c1', 'u1', 'Nested')).rejects.toThrow(BadRequestException);
  });

  it('delete removes own comment', async () => {
    prismaMock.comment.findUnique.mockResolvedValue(makeComment({ authorId: 'u1' }));
    prismaMock.comment.delete.mockResolvedValue({});
    await service.delete('c1', 'u1');
    expect(prismaMock.comment.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('delete throws ForbiddenException when deleting another user comment', async () => {
    prismaMock.comment.findUnique.mockResolvedValue(makeComment({ authorId: 'u2' }));
    await expect(service.delete('c1', 'u1')).rejects.toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

Run: `pnpm --filter @hoard/api test -- --testPathPattern=comments.service`
Expected: FAIL — "Cannot find module './comments.service'"

- [ ] **Step 3: Implement CommentsService**

Create `apps/api/src/comments/comments.service.ts`:

```typescript
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Comment as PrismaComment, User } from '@prisma/client';
import type { CommentItem } from '@hoard/shared';
import { PrismaService } from '../prisma/prisma.service';

type CommentWithAuthor = PrismaComment & { author: User; replies: (PrismaComment & { author: User })[] };

function toCommentItem(c: CommentWithAuthor): CommentItem {
  return {
    id: c.id,
    content: c.content,
    author: { username: c.author.username, name: c.author.name, avatarUrl: c.author.avatarUrl },
    createdAt: c.createdAt.toISOString(),
    replies: (c.replies ?? []).map((r) => ({
      id: r.id,
      content: r.content,
      author: { username: (r as any).author.username, name: (r as any).author.name, avatarUrl: (r as any).author.avatarUrl },
      createdAt: r.createdAt.toISOString(),
      replies: [],
    })),
  };
}

const COMMENT_INCLUDE = {
  author: true,
  replies: { include: { author: true }, orderBy: { createdAt: 'asc' as const } },
} as const;

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(slug: string): Promise<CommentItem[]> {
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article) throw new NotFoundException('Article not found');
    const comments = await this.prisma.comment.findMany({
      where: { articleId: article.id, parentId: null },
      include: COMMENT_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return comments.map(toCommentItem);
  }

  async create(slug: string, authorId: string, content: string): Promise<CommentItem> {
    if (!content.trim()) throw new BadRequestException('Comment cannot be empty');
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article) throw new NotFoundException('Article not found');
    const comment = await this.prisma.comment.create({
      data: { content: content.trim(), authorId, articleId: article.id, parentId: null },
      include: COMMENT_INCLUDE,
    });
    return toCommentItem(comment as CommentWithAuthor);
  }

  async createReply(slug: string, parentId: string, authorId: string, content: string): Promise<CommentItem> {
    if (!content.trim()) throw new BadRequestException('Comment cannot be empty');
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article) throw new NotFoundException('Article not found');
    const parent = await this.prisma.comment.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Comment not found');
    if (parent.parentId !== null) throw new BadRequestException('Cannot reply to a reply');
    const comment = await this.prisma.comment.create({
      data: { content: content.trim(), authorId, articleId: article.id, parentId },
      include: COMMENT_INCLUDE,
    });
    return toCommentItem(comment as CommentWithAuthor);
  }

  async delete(commentId: string, userId: string): Promise<void> {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== userId) throw new ForbiddenException('Cannot delete another user\'s comment');
    await this.prisma.comment.delete({ where: { id: commentId } });
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

Run: `pnpm --filter @hoard/api test -- --testPathPattern=comments.service`
Expected: PASS — 7 tests

- [ ] **Step 5: Create CommentsController and CommentsModule**

Create `apps/api/src/comments/comments.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { CommentItem } from '@hoard/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommentsService } from './comments.service';

@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('articles/:slug/comments')
  findAll(@Param('slug') slug: string): Promise<CommentItem[]> {
    return this.commentsService.findAll(slug);
  }

  @Post('articles/:slug/comments')
  @UseGuards(JwtAuthGuard)
  create(
    @Param('slug') slug: string,
    @Body('content') content: string,
    @Request() req,
  ): Promise<CommentItem> {
    return this.commentsService.create(slug, req.user.id, content);
  }

  @Post('articles/:slug/comments/:commentId/replies')
  @UseGuards(JwtAuthGuard)
  createReply(
    @Param('slug') slug: string,
    @Param('commentId') commentId: string,
    @Body('content') content: string,
    @Request() req,
  ): Promise<CommentItem> {
    return this.commentsService.createReply(slug, commentId, req.user.id, content);
  }

  @Delete('comments/:commentId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  delete(@Param('commentId') commentId: string, @Request() req): Promise<void> {
    return this.commentsService.delete(commentId, req.user.id);
  }
}
```

Create `apps/api/src/comments/comments.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
```

- [ ] **Step 6: Wire CommentsModule into AppModule**

Add to `apps/api/src/app.module.ts`:
```typescript
import { CommentsModule } from './comments/comments.module';
// ... add CommentsModule after ClapsModule in imports array
```

- [ ] **Step 7: Run full API test suite**

Run: `pnpm --filter @hoard/api test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/comments/ apps/api/src/app.module.ts
git commit -m "feat: add comments API with one-level replies"
```

---

### Task 5: Bookmarks API

**Files:**
- Create: `apps/api/src/bookmarks/bookmarks.service.ts`
- Create: `apps/api/src/bookmarks/bookmarks.service.spec.ts`
- Create: `apps/api/src/bookmarks/bookmarks.controller.ts`
- Create: `apps/api/src/bookmarks/bookmarks.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `BookmarkStatus`, `PaginatedArticles` from `@hoard/shared`; `PrismaService`; `JwtAuthGuard`; `ARTICLE_WITH_AUTHOR_INCLUDE`, `toArticleListItem`, `ArticleWithTagsAndAuthor` from `../articles/articles.mapper`
- Produces: `POST /bookmarks/:slug`, `DELETE /bookmarks/:slug`, `GET /bookmarks/:slug/status`, `GET /bookmarks`

- [ ] **Step 1: Write BookmarksService tests**

Create `apps/api/src/bookmarks/bookmarks.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BookmarksService } from './bookmarks.service';
import { PrismaService } from '../prisma/prisma.service';

const makeBookmark = (createdAt: Date) => ({
  id: 'bm1',
  userId: 'u1',
  articleId: 'art1',
  createdAt,
  article: {
    id: 'art1', title: 'Hello', slug: 'hello', excerpt: null,
    coverImageUrl: null, readingTime: 1, publishedAt: createdAt,
    tags: [], author: { username: 'alice', name: 'Alice', avatarUrl: null },
  },
});

describe('BookmarksService', () => {
  let service: BookmarksService;
  const prismaMock = {
    article: { findUnique: jest.fn() },
    bookmark: { upsert: jest.fn(), deleteMany: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [BookmarksService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get<BookmarksService>(BookmarksService);
  });

  it('bookmark upserts and returns isBookmarked: true', async () => {
    prismaMock.article.findUnique.mockResolvedValue({ id: 'art1' });
    prismaMock.bookmark.upsert.mockResolvedValue({});
    const result = await service.bookmark('my-article', 'u1');
    expect(prismaMock.bookmark.upsert).toHaveBeenCalled();
    expect(result).toEqual({ isBookmarked: true });
  });

  it('bookmark throws NotFoundException for unknown slug', async () => {
    prismaMock.article.findUnique.mockResolvedValue(null);
    await expect(service.bookmark('no-such', 'u1')).rejects.toThrow(NotFoundException);
  });

  it('unbookmark calls deleteMany', async () => {
    prismaMock.article.findUnique.mockResolvedValue({ id: 'art1' });
    prismaMock.bookmark.deleteMany.mockResolvedValue({ count: 1 });
    await service.unbookmark('my-article', 'u1');
    expect(prismaMock.bookmark.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', articleId: 'art1' },
    });
  });

  it('getStatus returns isBookmarked: true when record exists', async () => {
    prismaMock.article.findUnique.mockResolvedValue({ id: 'art1' });
    prismaMock.bookmark.findUnique.mockResolvedValue({ id: 'bm1' });
    const result = await service.getStatus('my-article', 'u1');
    expect(result).toEqual({ isBookmarked: true });
  });

  it('getReadingList returns PaginatedArticles ordered by bookmark createdAt DESC', async () => {
    const date = new Date('2024-01-01');
    prismaMock.bookmark.findMany.mockResolvedValue([makeBookmark(date)]);
    const result = await service.getReadingList('u1');
    expect(result.articles).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
    expect(prismaMock.bookmark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

Run: `pnpm --filter @hoard/api test -- --testPathPattern=bookmarks.service`
Expected: FAIL — "Cannot find module './bookmarks.service'"

- [ ] **Step 3: Implement BookmarksService**

Create `apps/api/src/bookmarks/bookmarks.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import type { BookmarkStatus, PaginatedArticles } from '@hoard/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  ARTICLE_WITH_AUTHOR_INCLUDE,
  toArticleListItem,
  type ArticleWithTagsAndAuthor,
} from '../articles/articles.mapper';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

@Injectable()
export class BookmarksService {
  constructor(private readonly prisma: PrismaService) {}

  async bookmark(slug: string, userId: string): Promise<BookmarkStatus> {
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article) throw new NotFoundException('Article not found');
    await this.prisma.bookmark.upsert({
      where: { userId_articleId: { userId, articleId: article.id } },
      create: { userId, articleId: article.id },
      update: {},
    });
    return { isBookmarked: true };
  }

  async unbookmark(slug: string, userId: string): Promise<void> {
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article) throw new NotFoundException('Article not found');
    await this.prisma.bookmark.deleteMany({ where: { userId, articleId: article.id } });
  }

  async getStatus(slug: string, userId: string): Promise<BookmarkStatus> {
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article) throw new NotFoundException('Article not found');
    const record = await this.prisma.bookmark.findUnique({
      where: { userId_articleId: { userId, articleId: article.id } },
    });
    return { isBookmarked: !!record };
  }

  async getReadingList(userId: string, cursor?: string, limit = DEFAULT_LIMIT): Promise<PaginatedArticles> {
    const effectiveLimit = Math.min(Number.isFinite(limit) ? limit : DEFAULT_LIMIT, MAX_LIMIT);
    const take = effectiveLimit + 1;
    const bookmarks = await this.prisma.bookmark.findMany({
      where: {
        userId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: { article: { include: ARTICLE_WITH_AUTHOR_INCLUDE } },
    });
    const hasNext = bookmarks.length > effectiveLimit;
    const page = hasNext ? bookmarks.slice(0, effectiveLimit) : bookmarks;
    return {
      articles: page.map((b) => toArticleListItem(b.article as ArticleWithTagsAndAuthor)),
      nextCursor: hasNext ? page[page.length - 1].createdAt.toISOString() : null,
    };
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

Run: `pnpm --filter @hoard/api test -- --testPathPattern=bookmarks.service`
Expected: PASS — 5 tests

- [ ] **Step 5: Create BookmarksController and BookmarksModule**

Create `apps/api/src/bookmarks/bookmarks.controller.ts`:

```typescript
import { Controller, Delete, Get, HttpCode, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import type { BookmarkStatus, PaginatedArticles } from '@hoard/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BookmarksService } from './bookmarks.service';

@Controller('bookmarks')
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  @Post(':slug')
  @UseGuards(JwtAuthGuard)
  bookmark(@Param('slug') slug: string, @Request() req): Promise<BookmarkStatus> {
    return this.bookmarksService.bookmark(slug, req.user.id);
  }

  @Delete(':slug')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  unbookmark(@Param('slug') slug: string, @Request() req): Promise<void> {
    return this.bookmarksService.unbookmark(slug, req.user.id);
  }

  @Get(':slug/status')
  @UseGuards(JwtAuthGuard)
  getStatus(@Param('slug') slug: string, @Request() req): Promise<BookmarkStatus> {
    return this.bookmarksService.getStatus(slug, req.user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  getReadingList(
    @Request() req,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedArticles> {
    return this.bookmarksService.getReadingList(req.user.id, cursor, limit ? Number(limit) : undefined);
  }
}
```

Create `apps/api/src/bookmarks/bookmarks.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { BookmarksController } from './bookmarks.controller';
import { BookmarksService } from './bookmarks.service';

@Module({
  controllers: [BookmarksController],
  providers: [BookmarksService],
})
export class BookmarksModule {}
```

- [ ] **Step 6: Wire BookmarksModule into AppModule**

Add to `apps/api/src/app.module.ts`:
```typescript
import { BookmarksModule } from './bookmarks/bookmarks.module';
// ... add BookmarksModule after CommentsModule in imports array
```

- [ ] **Step 7: Run full API test suite**

Run: `pnpm --filter @hoard/api test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/bookmarks/ apps/api/src/app.module.ts
git commit -m "feat: add bookmarks API and reading list endpoint"
```

---

### Task 6: Auth middleware + frontend composables

**Files:**
- Create: `apps/web/app/middleware/auth.ts`
- Create: `apps/web/app/composables/useFollowingFeed.ts`
- Create: `apps/web/app/composables/useFollowingFeed.test.ts`
- Create: `apps/web/app/composables/useFollow.ts`
- Create: `apps/web/app/composables/useFollow.test.ts`
- Create: `apps/web/app/composables/useClaps.ts`
- Create: `apps/web/app/composables/useClaps.test.ts`
- Create: `apps/web/app/composables/useBookmark.ts`
- Create: `apps/web/app/composables/useBookmark.test.ts`

**Interfaces:**
- Consumes: `useApi` from `./useApi`; `FollowStatus`, `ClapStatus`, `BookmarkStatus`, `PaginatedArticles`, `ArticleListItem` from `@hoard/shared`
- Produces:
  - `useFollowingFeed(apiBase, accessToken, onRefresh)` → `{ articles, nextCursor, loading, error, loadMore }`
  - `useFollow(apiBase, username, accessToken, onRefresh)` → `{ isFollowing, loading, load, toggle }`
  - `useClaps(apiBase, slug, accessToken, onRefresh)` → `{ totalClaps, userClaps, loading, load, clap }`
  - `useBookmark(apiBase, slug, accessToken, onRefresh)` → `{ isBookmarked, loading, load, toggle }`

- [ ] **Step 1: Create auth middleware**

Create `apps/web/app/middleware/auth.ts`:

```typescript
export default defineNuxtRouteMiddleware(() => {
  const auth = useAuthStore();
  if (!auth.user) {
    return navigateTo('/login');
  }
});
```

- [ ] **Step 2: Write useFollowingFeed tests**

Create `apps/web/app/composables/useFollowingFeed.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./useApi', () => ({ useApi: vi.fn() }));
import { useApi } from './useApi';
import { useFollowingFeed } from './useFollowingFeed';

describe('useFollowingFeed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts with empty state', () => {
    const { articles, nextCursor, loading } = useFollowingFeed('http://localhost:3001', 'token', vi.fn());
    expect(articles.value).toEqual([]);
    expect(nextCursor.value).toBeNull();
    expect(loading.value).toBe(false);
  });

  it('loadMore calls /feed/following and appends articles', async () => {
    (useApi as ReturnType<typeof vi.fn>).mockResolvedValue({
      articles: [{ id: 'a1' }],
      nextCursor: '2024-01-01T00:00:00.000Z',
    });
    const { articles, nextCursor, loadMore } = useFollowingFeed('http://localhost:3001', 'token', vi.fn());
    await loadMore();
    expect(articles.value).toHaveLength(1);
    expect(nextCursor.value).toBe('2024-01-01T00:00:00.000Z');
    expect(useApi).toHaveBeenCalledWith('http://localhost:3001', '/feed/following', 'token', expect.any(Function));
  });

  it('passes cursor on subsequent loadMore calls', async () => {
    (useApi as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ articles: [{ id: 'a1' }], nextCursor: '2024-01-01T00:00:00.000Z' })
      .mockResolvedValueOnce({ articles: [{ id: 'a2' }], nextCursor: null });
    const { articles, nextCursor, loadMore } = useFollowingFeed('http://localhost:3001', 'tok', vi.fn());
    await loadMore();
    await loadMore();
    expect(articles.value).toHaveLength(2);
    expect(nextCursor.value).toBeNull();
    expect(useApi).toHaveBeenNthCalledWith(
      2, 'http://localhost:3001',
      '/feed/following?cursor=2024-01-01T00%3A00%3A00.000Z', 'tok', expect.any(Function),
    );
  });
});
```

- [ ] **Step 3: Implement useFollowingFeed**

Create `apps/web/app/composables/useFollowingFeed.ts`:

```typescript
import { ref } from 'vue';
import type { ArticleListItem, PaginatedArticles } from '@hoard/shared';
import { useApi } from './useApi';

export function useFollowingFeed(
  apiBase: string,
  accessToken: string | null,
  onRefresh: () => Promise<string>,
) {
  const articles = ref<ArticleListItem[]>([]);
  const nextCursor = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadMore() {
    loading.value = true;
    error.value = null;
    try {
      const path = nextCursor.value
        ? `/feed/following?cursor=${encodeURIComponent(nextCursor.value)}`
        : '/feed/following';
      const data = await useApi<PaginatedArticles>(apiBase, path, accessToken, onRefresh);
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

- [ ] **Step 4: Write useFollow tests**

Create `apps/web/app/composables/useFollow.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./useApi', () => ({ useApi: vi.fn() }));
import { useApi } from './useApi';
import { useFollow } from './useFollow';

describe('useFollow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('load sets isFollowing from API response', async () => {
    (useApi as ReturnType<typeof vi.fn>).mockResolvedValue({ isFollowing: true });
    const { isFollowing, load } = useFollow('http://localhost:3001', 'alice', 'token', vi.fn());
    await load();
    expect(isFollowing.value).toBe(true);
    expect(useApi).toHaveBeenCalledWith('http://localhost:3001', '/follows/alice/status', 'token', expect.any(Function));
  });

  it('toggle calls POST and flips isFollowing from false to true', async () => {
    (useApi as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ isFollowing: false }) // load
      .mockResolvedValueOnce({ isFollowing: true }); // POST
    const { isFollowing, load, toggle } = useFollow('http://localhost:3001', 'alice', 'token', vi.fn());
    await load();
    await toggle();
    expect(isFollowing.value).toBe(true);
    expect(useApi).toHaveBeenCalledWith(
      'http://localhost:3001', '/follows/alice', 'token', expect.any(Function),
      { method: 'POST' },
    );
  });

  it('toggle calls DELETE when already following', async () => {
    (useApi as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ isFollowing: true }) // load
      .mockResolvedValueOnce(undefined); // DELETE
    const { isFollowing, load, toggle } = useFollow('http://localhost:3001', 'alice', 'token', vi.fn());
    await load();
    await toggle();
    expect(isFollowing.value).toBe(false);
    expect(useApi).toHaveBeenCalledWith(
      'http://localhost:3001', '/follows/alice', 'token', expect.any(Function),
      { method: 'DELETE' },
    );
  });
});
```

- [ ] **Step 5: Implement useFollow**

Create `apps/web/app/composables/useFollow.ts`:

```typescript
import { ref } from 'vue';
import type { FollowStatus } from '@hoard/shared';
import { useApi } from './useApi';

export function useFollow(
  apiBase: string,
  username: string,
  accessToken: string | null,
  onRefresh: () => Promise<string>,
) {
  const isFollowing = ref(false);
  const loading = ref(false);

  async function load() {
    try {
      const data = await useApi<FollowStatus>(apiBase, `/follows/${username}/status`, accessToken, onRefresh);
      isFollowing.value = data.isFollowing;
    } catch {
      // keep default false
    }
  }

  async function toggle() {
    if (loading.value) return;
    loading.value = true;
    const was = isFollowing.value;
    isFollowing.value = !was;
    try {
      if (was) {
        await useApi<void>(apiBase, `/follows/${username}`, accessToken, onRefresh, { method: 'DELETE' });
      } else {
        await useApi<FollowStatus>(apiBase, `/follows/${username}`, accessToken, onRefresh, { method: 'POST' });
      }
    } catch {
      isFollowing.value = was;
    } finally {
      loading.value = false;
    }
  }

  return { isFollowing, loading, load, toggle };
}
```

- [ ] **Step 6: Write useClaps tests**

Create `apps/web/app/composables/useClaps.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./useApi', () => ({ useApi: vi.fn() }));
import { useApi } from './useApi';
import { useClaps } from './useClaps';

describe('useClaps', () => {
  beforeEach(() => vi.clearAllMocks());

  it('load fetches clap status', async () => {
    (useApi as ReturnType<typeof vi.fn>).mockResolvedValue({ totalClaps: 5, userClaps: 2 });
    const { totalClaps, userClaps, load } = useClaps('http://localhost:3001', 'my-article', 'token', vi.fn());
    await load();
    expect(totalClaps.value).toBe(5);
    expect(userClaps.value).toBe(2);
  });

  it('clap() calls POST and updates state', async () => {
    (useApi as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ totalClaps: 0, userClaps: 0 }) // load
      .mockResolvedValueOnce({ totalClaps: 1, userClaps: 1 }); // POST
    const { totalClaps, userClaps, load, clap } = useClaps('http://localhost:3001', 'my-article', 'token', vi.fn());
    await load();
    await clap();
    expect(totalClaps.value).toBe(1);
    expect(userClaps.value).toBe(1);
    expect(useApi).toHaveBeenCalledWith(
      'http://localhost:3001', '/articles/my-article/claps', 'token', expect.any(Function),
      { method: 'POST', body: { count: 1 } },
    );
  });

  it('clap() is a no-op when userClaps is at cap (10)', async () => {
    (useApi as ReturnType<typeof vi.fn>).mockResolvedValue({ totalClaps: 50, userClaps: 10 });
    const { load, clap } = useClaps('http://localhost:3001', 'my-article', 'token', vi.fn());
    await load();
    vi.clearAllMocks();
    await clap();
    expect(useApi).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Implement useClaps**

Create `apps/web/app/composables/useClaps.ts`:

```typescript
import { ref } from 'vue';
import type { ClapStatus } from '@hoard/shared';
import { useApi } from './useApi';

const CLAP_CAP = 10;

export function useClaps(
  apiBase: string,
  slug: string,
  accessToken: string | null,
  onRefresh: () => Promise<string>,
) {
  const totalClaps = ref(0);
  const userClaps = ref(0);
  const loading = ref(false);

  async function load() {
    try {
      const data = await useApi<ClapStatus>(apiBase, `/articles/${slug}/claps`, accessToken, onRefresh);
      totalClaps.value = data.totalClaps;
      userClaps.value = data.userClaps;
    } catch {
      // keep defaults
    }
  }

  async function clap() {
    if (loading.value || userClaps.value >= CLAP_CAP) return;
    loading.value = true;
    try {
      const data = await useApi<ClapStatus>(
        apiBase, `/articles/${slug}/claps`, accessToken, onRefresh,
        { method: 'POST', body: { count: 1 } },
      );
      totalClaps.value = data.totalClaps;
      userClaps.value = data.userClaps;
    } catch {
      // keep current state
    } finally {
      loading.value = false;
    }
  }

  return { totalClaps, userClaps, loading, load, clap };
}
```

- [ ] **Step 8: Write useBookmark tests**

Create `apps/web/app/composables/useBookmark.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./useApi', () => ({ useApi: vi.fn() }));
import { useApi } from './useApi';
import { useBookmark } from './useBookmark';

describe('useBookmark', () => {
  beforeEach(() => vi.clearAllMocks());

  it('load sets isBookmarked from API', async () => {
    (useApi as ReturnType<typeof vi.fn>).mockResolvedValue({ isBookmarked: true });
    const { isBookmarked, load } = useBookmark('http://localhost:3001', 'my-article', 'token', vi.fn());
    await load();
    expect(isBookmarked.value).toBe(true);
    expect(useApi).toHaveBeenCalledWith('http://localhost:3001', '/bookmarks/my-article/status', 'token', expect.any(Function));
  });

  it('toggle calls POST when not bookmarked', async () => {
    (useApi as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ isBookmarked: false }) // load
      .mockResolvedValueOnce({ isBookmarked: true }); // POST
    const { isBookmarked, load, toggle } = useBookmark('http://localhost:3001', 'my-article', 'token', vi.fn());
    await load();
    await toggle();
    expect(isBookmarked.value).toBe(true);
    expect(useApi).toHaveBeenCalledWith(
      'http://localhost:3001', '/bookmarks/my-article', 'token', expect.any(Function), { method: 'POST' },
    );
  });

  it('toggle calls DELETE when already bookmarked', async () => {
    (useApi as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ isBookmarked: true })
      .mockResolvedValueOnce(undefined);
    const { isBookmarked, load, toggle } = useBookmark('http://localhost:3001', 'my-article', 'token', vi.fn());
    await load();
    await toggle();
    expect(isBookmarked.value).toBe(false);
  });
});
```

- [ ] **Step 9: Implement useBookmark**

Create `apps/web/app/composables/useBookmark.ts`:

```typescript
import { ref } from 'vue';
import type { BookmarkStatus } from '@hoard/shared';
import { useApi } from './useApi';

export function useBookmark(
  apiBase: string,
  slug: string,
  accessToken: string | null,
  onRefresh: () => Promise<string>,
) {
  const isBookmarked = ref(false);
  const loading = ref(false);

  async function load() {
    try {
      const data = await useApi<BookmarkStatus>(apiBase, `/bookmarks/${slug}/status`, accessToken, onRefresh);
      isBookmarked.value = data.isBookmarked;
    } catch {
      // keep default false
    }
  }

  async function toggle() {
    if (loading.value) return;
    loading.value = true;
    const was = isBookmarked.value;
    isBookmarked.value = !was;
    try {
      if (was) {
        await useApi<void>(apiBase, `/bookmarks/${slug}`, accessToken, onRefresh, { method: 'DELETE' });
      } else {
        await useApi<BookmarkStatus>(apiBase, `/bookmarks/${slug}`, accessToken, onRefresh, { method: 'POST' });
      }
    } catch {
      isBookmarked.value = was;
    } finally {
      loading.value = false;
    }
  }

  return { isBookmarked, loading, load, toggle };
}
```

- [ ] **Step 10: Run all web tests**

Run: `pnpm --filter @hoard/web test`
Expected: all 30 pre-existing + 9 new composable tests = 39 pass

- [ ] **Step 11: Commit**

```bash
git add apps/web/app/middleware/auth.ts \
  apps/web/app/composables/useFollowingFeed.ts \
  apps/web/app/composables/useFollowingFeed.test.ts \
  apps/web/app/composables/useFollow.ts \
  apps/web/app/composables/useFollow.test.ts \
  apps/web/app/composables/useClaps.ts \
  apps/web/app/composables/useClaps.test.ts \
  apps/web/app/composables/useBookmark.ts \
  apps/web/app/composables/useBookmark.test.ts
git commit -m "feat: add auth middleware and social composables (follow, claps, bookmark, following feed)"
```

---

### Task 7: FollowButton, ClapButton, BookmarkButton components + ArticleCard update

**Files:**
- Create: `apps/web/app/components/ui/FollowButton.vue`
- Create: `apps/web/app/components/ui/ClapButton.vue`
- Create: `apps/web/app/components/ui/BookmarkButton.vue`
- Modify: `apps/web/app/components/ui/ArticleCard.vue`

**Interfaces:**
- Consumes: `useFollow`, `useClaps`, `useBookmark`; `useAuthStore` (Pinia, Nuxt auto-import); `useRuntimeConfig`, `navigateTo`, `onMounted` (Nuxt auto-imports)
- Produces: `<FollowButton username="...">`, `<ClapButton slug="...">`, `<BookmarkButton slug="...">`; `ArticleCard` gains `BookmarkButton` in its footer

- [ ] **Step 1: Create FollowButton**

Create `apps/web/app/components/ui/FollowButton.vue`:

```vue
<script setup lang="ts">
import { useFollow } from '~/composables/useFollow';

const props = defineProps<{ username: string }>();
const auth = useAuthStore();
const { public: { apiBase } } = useRuntimeConfig();

const { isFollowing, loading, load, toggle } = useFollow(
  apiBase,
  props.username,
  auth.accessToken,
  () => auth.refreshAccessToken(),
);

onMounted(load);
</script>

<template>
  <button
    v-if="auth.user && auth.user.username !== username"
    :disabled="loading"
    class="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
    :class="isFollowing
      ? 'border-border text-ink-light hover:border-red-300 hover:text-red-500'
      : 'border-accent bg-accent text-white hover:bg-accent/90'"
    @click="toggle"
  >
    {{ isFollowing ? 'Following' : 'Follow' }}
  </button>
</template>
```

- [ ] **Step 2: Create ClapButton**

Create `apps/web/app/components/ui/ClapButton.vue`:

```vue
<script setup lang="ts">
import { useClaps } from '~/composables/useClaps';

const props = defineProps<{ slug: string }>();
const auth = useAuthStore();
const { public: { apiBase } } = useRuntimeConfig();

const { totalClaps, userClaps, loading, load, clap } = useClaps(
  apiBase,
  props.slug,
  auth.accessToken,
  () => auth.refreshAccessToken(),
);

onMounted(load);

function handleClap() {
  if (!auth.user) {
    navigateTo('/login');
    return;
  }
  clap();
}
</script>

<template>
  <div class="flex items-center gap-2">
    <button
      :disabled="loading || userClaps >= 10"
      class="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      @click="handleClap"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      {{ totalClaps }}
    </button>
    <span v-if="auth.user" class="text-xs text-ink-light">{{ userClaps }}/10</span>
  </div>
</template>
```

- [ ] **Step 3: Create BookmarkButton**

Create `apps/web/app/components/ui/BookmarkButton.vue`:

```vue
<script setup lang="ts">
import { useBookmark } from '~/composables/useBookmark';

const props = defineProps<{ slug: string }>();
const auth = useAuthStore();
const { public: { apiBase } } = useRuntimeConfig();

const { isBookmarked, loading, load, toggle } = useBookmark(
  apiBase,
  props.slug,
  auth.accessToken,
  () => auth.refreshAccessToken(),
);

onMounted(() => {
  if (auth.user) load();
});
</script>

<template>
  <button
    v-if="auth.user"
    :disabled="loading"
    class="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
    :class="isBookmarked ? 'border-accent text-accent' : 'text-ink hover:border-accent hover:text-accent'"
    @click="toggle"
  >
    <svg
      width="16" height="16" viewBox="0 0 24 24"
      :fill="isBookmarked ? 'currentColor' : 'none'"
      stroke="currentColor" stroke-width="2"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
    {{ isBookmarked ? 'Saved' : 'Save' }}
  </button>
</template>
```

- [ ] **Step 4: Add BookmarkButton to ArticleCard**

Edit `apps/web/app/components/ui/ArticleCard.vue` — add the import and the button below the reading time line. Replace the entire file content:

```vue
<script setup lang="ts">
import type { ArticleListItem } from '@hoard/shared';
import Avatar from '~/components/ui/Avatar.vue';
import BookmarkButton from '~/components/ui/BookmarkButton.vue';

defineProps<{ article: ArticleListItem }>();
</script>

<template>
  <article class="flex items-start justify-between gap-6 border-b border-border py-6">
    <div class="min-w-0 flex-1">
      <div class="mb-2 flex items-center gap-2 text-sm">
        <Avatar :src="article.author.avatarUrl" :name="article.author.name" :size="20" />
        <NuxtLink :to="`/@${article.author.username}`" class="font-medium text-ink hover:underline">
          {{ article.author.name }}
        </NuxtLink>
      </div>
      <NuxtLink :to="`/@${article.author.username}/${article.slug}`">
        <h2 class="font-serif text-xl font-bold leading-snug text-ink">{{ article.title }}</h2>
        <p v-if="article.excerpt" class="mt-1 line-clamp-2 font-serif text-base text-ink-light">
          {{ article.excerpt }}
        </p>
      </NuxtLink>
      <div class="mt-3 flex items-center gap-4">
        <p class="text-xs text-ink-light">
          {{ article.readingTime }} min read · {{ new Date(article.publishedAt).toLocaleDateString() }}
        </p>
        <BookmarkButton :slug="article.slug" />
      </div>
    </div>
    <img
      v-if="article.coverImageUrl"
      :src="article.coverImageUrl"
      :alt="article.title"
      class="h-24 w-24 shrink-0 rounded-md object-cover"
    />
  </article>
</template>
```

- [ ] **Step 5: Run web tests**

Run: `pnpm --filter @hoard/web test`
Expected: all tests pass (no new unit tests for components — verified manually with the live stack).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/components/ui/FollowButton.vue \
  apps/web/app/components/ui/ClapButton.vue \
  apps/web/app/components/ui/BookmarkButton.vue \
  apps/web/app/components/ui/ArticleCard.vue
git commit -m "feat: add FollowButton, ClapButton, BookmarkButton components"
```

---

### Task 8: CommentThread component

**Files:**
- Create: `apps/web/app/components/ui/CommentThread.vue`

**Interfaces:**
- Consumes: `CommentItem` from `@hoard/shared`; `useApi` from `~/composables/useApi`; `useAuthStore`; `Avatar` component; `$fetch` (Nuxt global for the public GET)
- Produces: `<CommentThread slug="...">` — renders all comments + inline reply forms + delete actions

- [ ] **Step 1: Create CommentThread**

Create `apps/web/app/components/ui/CommentThread.vue`:

```vue
<script setup lang="ts">
import type { CommentItem } from '@hoard/shared';
import Avatar from '~/components/ui/Avatar.vue';
import { useApi } from '~/composables/useApi';

const props = defineProps<{ slug: string }>();
const auth = useAuthStore();
const { public: { apiBase } } = useRuntimeConfig();

const comments = ref<CommentItem[]>([]);
const loading = ref(false);
const newComment = ref('');
const submitting = ref(false);
const replyingTo = ref<string | null>(null);
const replyContent = ref('');

async function fetchComments() {
  loading.value = true;
  try {
    comments.value = await $fetch<CommentItem[]>(`${apiBase}/articles/${props.slug}/comments`);
  } finally {
    loading.value = false;
  }
}

async function submitComment() {
  if (!newComment.value.trim() || submitting.value) return;
  submitting.value = true;
  try {
    await useApi<CommentItem>(
      apiBase,
      `/articles/${props.slug}/comments`,
      auth.accessToken,
      () => auth.refreshAccessToken(),
      { method: 'POST', body: { content: newComment.value.trim() } },
    );
    newComment.value = '';
    await fetchComments();
  } finally {
    submitting.value = false;
  }
}

async function submitReply(parentId: string) {
  if (!replyContent.value.trim() || submitting.value) return;
  submitting.value = true;
  try {
    await useApi<CommentItem>(
      apiBase,
      `/articles/${props.slug}/comments/${parentId}/replies`,
      auth.accessToken,
      () => auth.refreshAccessToken(),
      { method: 'POST', body: { content: replyContent.value.trim() } },
    );
    replyContent.value = '';
    replyingTo.value = null;
    await fetchComments();
  } finally {
    submitting.value = false;
  }
}

async function deleteComment(commentId: string) {
  await useApi<void>(
    apiBase,
    `/comments/${commentId}`,
    auth.accessToken,
    () => auth.refreshAccessToken(),
    { method: 'DELETE' },
  );
  await fetchComments();
}

onMounted(fetchComments);
</script>

<template>
  <section class="mt-12 border-t border-border pt-10">
    <h2 class="mb-6 font-serif text-2xl font-bold text-ink">Responses</h2>

    <div v-if="auth.user" class="mb-8">
      <textarea
        v-model="newComment"
        placeholder="Write a response..."
        rows="3"
        class="w-full rounded-md border border-border px-4 py-3 text-sm text-ink placeholder:text-ink-light focus:border-accent focus:outline-none resize-none"
      />
      <div class="mt-2 flex justify-end">
        <button
          :disabled="!newComment.trim() || submitting"
          class="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          @click="submitComment"
        >
          Post
        </button>
      </div>
    </div>

    <p v-if="loading" class="text-sm text-ink-light">Loading responses...</p>
    <p v-else-if="comments.length === 0" class="text-sm text-ink-light">No responses yet.</p>

    <div class="space-y-8">
      <div v-for="comment in comments" :key="comment.id">
        <div class="flex gap-3">
          <Avatar :name="comment.author.name" :src="comment.author.avatarUrl" :size="32" />
          <div class="flex-1">
            <div class="flex items-center gap-2 text-sm">
              <NuxtLink :to="`/@${comment.author.username}`" class="font-medium text-ink hover:underline">
                {{ comment.author.name }}
              </NuxtLink>
              <span class="text-ink-light">· {{ new Date(comment.createdAt).toLocaleDateString() }}</span>
            </div>
            <p class="mt-1 text-sm text-ink">{{ comment.content }}</p>
            <div class="mt-2 flex gap-4 text-xs text-ink-light">
              <button v-if="auth.user" class="hover:text-ink" @click="replyingTo = replyingTo === comment.id ? null : comment.id">
                Reply
              </button>
              <button
                v-if="auth.user?.username === comment.author.username"
                class="hover:text-red-500"
                @click="deleteComment(comment.id)"
              >
                Delete
              </button>
            </div>
            <div v-if="replyingTo === comment.id" class="mt-3">
              <textarea
                v-model="replyContent"
                placeholder="Write a reply..."
                rows="2"
                class="w-full rounded-md border border-border px-3 py-2 text-sm text-ink placeholder:text-ink-light focus:border-accent focus:outline-none resize-none"
              />
              <div class="mt-1 flex gap-2 justify-end">
                <button class="text-xs text-ink-light hover:text-ink" @click="replyingTo = null; replyContent = ''">Cancel</button>
                <button
                  :disabled="!replyContent.trim() || submitting"
                  class="rounded-full bg-accent px-4 py-1 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
                  @click="submitReply(comment.id)"
                >
                  Reply
                </button>
              </div>
            </div>

            <div v-if="comment.replies.length > 0" class="mt-4 space-y-4 border-l-2 border-border pl-4">
              <div v-for="reply in comment.replies" :key="reply.id" class="flex gap-3">
                <Avatar :name="reply.author.name" :src="reply.author.avatarUrl" :size="24" />
                <div class="flex-1">
                  <div class="flex items-center gap-2 text-sm">
                    <NuxtLink :to="`/@${reply.author.username}`" class="font-medium text-ink hover:underline">
                      {{ reply.author.name }}
                    </NuxtLink>
                    <span class="text-ink-light">· {{ new Date(reply.createdAt).toLocaleDateString() }}</span>
                  </div>
                  <p class="mt-1 text-sm text-ink">{{ reply.content }}</p>
                  <button
                    v-if="auth.user?.username === reply.author.username"
                    class="mt-1 text-xs text-ink-light hover:text-red-500"
                    @click="deleteComment(reply.id)"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
```

- [ ] **Step 2: Run web tests**

Run: `pnpm --filter @hoard/web test`
Expected: all tests still pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/components/ui/CommentThread.vue
git commit -m "feat: add CommentThread component with inline replies"
```

---

### Task 9: Pages — tab switcher, profile FollowButton, article social actions, reading list

**Files:**
- Modify: `apps/web/app/pages/index.vue`
- Modify: `apps/web/app/pages/@[username]/index.vue`
- Modify: `apps/web/app/pages/@[username]/[slug].vue`
- Create: `apps/web/app/pages/reading-list.vue`

**Interfaces:**
- Consumes: `useFeed`, `useFollowingFeed`; `FollowButton`, `ClapButton`, `BookmarkButton`, `CommentThread`, `ArticleCard` (all from previous tasks); `useAuthStore`; `PaginatedArticles`, `ArticleListItem` from `@hoard/shared`; `useApi`

- [ ] **Step 1: Update home page with Following/Explore tab switcher**

Replace the entire content of `apps/web/app/pages/index.vue`:

```vue
<script setup lang="ts">
import ArticleCard from '~/components/ui/ArticleCard.vue';
import { useFeed } from '~/composables/useFeed';
import { useFollowingFeed } from '~/composables/useFollowingFeed';

const auth = useAuthStore();
const { public: { apiBase } } = useRuntimeConfig();

const activeTab = ref<'following' | 'explore'>(auth.user ? 'following' : 'explore');

const exploreFeed = useFeed(apiBase);
const followingFeed = useFollowingFeed(
  apiBase,
  auth.accessToken,
  () => auth.refreshAccessToken(),
);

const feed = computed(() => activeTab.value === 'following' ? followingFeed : exploreFeed);

onMounted(() => {
  if (auth.user) followingFeed.loadMore();
  exploreFeed.loadMore();
});
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-12">
    <div class="mb-8 flex items-center gap-6 border-b border-border">
      <button
        v-if="auth.user"
        class="pb-3 text-sm font-medium transition-colors"
        :class="activeTab === 'following' ? 'border-b-2 border-ink text-ink' : 'text-ink-light hover:text-ink'"
        @click="activeTab = 'following'"
      >
        Following
      </button>
      <button
        class="pb-3 text-sm font-medium transition-colors"
        :class="activeTab === 'explore' ? 'border-b-2 border-ink text-ink' : 'text-ink-light hover:text-ink'"
        @click="activeTab = 'explore'"
      >
        Explore
      </button>
    </div>

    <p v-if="feed.error.value" class="text-sm text-red-600">{{ feed.error.value }}</p>

    <p v-else-if="feed.articles.value.length === 0 && !feed.loading.value" class="text-sm text-ink-light">
      No articles yet.
    </p>

    <div class="divide-y divide-border">
      <ArticleCard v-for="article in feed.articles.value" :key="article.id" :article="article" class="py-8" />
    </div>

    <div class="mt-8 text-center">
      <p v-if="feed.loading.value" class="text-sm text-ink-light">Loading...</p>
      <button
        v-else-if="feed.nextCursor.value"
        class="rounded-full border border-border px-6 py-2 text-sm font-medium text-ink hover:border-accent hover:text-accent"
        @click="feed.loadMore()"
      >
        Load more
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Add FollowButton to profile page**

Replace the entire content of `apps/web/app/pages/@[username]/index.vue`:

```vue
<script setup lang="ts">
import type { PublicProfile } from '@hoard/shared';
import Avatar from '~/components/ui/Avatar.vue';
import FollowButton from '~/components/ui/FollowButton.vue';

const route = useRoute();
const config = useRuntimeConfig();
const auth = useAuthStore();
const username = route.params.username as string;

const { data, error } = await useFetch<PublicProfile>(`${config.public.apiBase}/users/${username}`);

const isOwnProfile = computed(() => auth.user?.username === username);
</script>

<template>
  <div class="mx-auto max-w-sm px-6 py-16">
    <p v-if="error" class="text-center text-ink-light">User not found.</p>
    <div v-else-if="data" class="space-y-4 text-center">
      <Avatar :src="data.avatarUrl" :name="data.name" :size="96" />
      <h1 class="font-serif text-3xl font-bold text-ink">{{ data.name }}</h1>
      <p class="text-ink-light">@{{ data.username }}</p>
      <p v-if="data.bio" class="text-ink">{{ data.bio }}</p>
      <div class="flex items-center justify-center gap-4 pt-4">
        <NuxtLink
          v-if="isOwnProfile"
          to="/settings/profile"
          class="text-sm font-semibold text-ink-light transition-colors hover:text-ink"
        >
          Edit profile
        </NuxtLink>
        <FollowButton v-else :username="username" />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Add ClapButton, BookmarkButton, and CommentThread to article page**

Replace the entire content of `apps/web/app/pages/@[username]/[slug].vue`:

```vue
<script setup lang="ts">
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import type { PublicArticle } from '@hoard/shared';
import ClapButton from '~/components/ui/ClapButton.vue';
import BookmarkButton from '~/components/ui/BookmarkButton.vue';
import CommentThread from '~/components/ui/CommentThread.vue';

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
  <div class="mx-auto max-w-[680px] px-6 py-12">
    <p v-if="error" class="text-sm text-ink-light">Article not found.</p>
    <article v-else-if="data">
      <img v-if="data.coverImageUrl" :src="data.coverImageUrl" :alt="data.title" class="mb-8 w-full rounded-md object-cover" />
      <h1 class="font-serif text-4xl font-bold leading-tight text-ink">{{ data.title }}</h1>
      <p class="mt-4 text-sm text-ink-light">
        <NuxtLink :to="`/@${data.author.username}`" class="font-medium text-ink hover:underline">
          {{ data.author.name }}
        </NuxtLink>
        · {{ data.readingTime }} min read · {{ new Date(data.publishedAt).toLocaleDateString() }}
      </p>
      <p class="mt-3 flex flex-wrap gap-2">
        <NuxtLink
          v-for="tag in data.tags"
          :key="tag.slug"
          :to="`/tag/${tag.slug}`"
          class="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-ink-light hover:bg-neutral-200"
        >
          {{ tag.name }}
        </NuxtLink>
      </p>

      <div class="mt-6 flex items-center justify-between">
        <ClapButton :slug="data.slug" />
        <BookmarkButton :slug="data.slug" />
      </div>

      <!-- safe: generateHTML only emits markup for the node/mark types declared
           in the extensions array above — it cannot emit arbitrary tags, since
           the input is our own Tiptap JSON, not raw user-supplied HTML. -->
      <div class="prose-serif mt-8" v-html="contentHtml" />

      <CommentThread :slug="data.slug" />
    </article>
  </div>
</template>

<style scoped>
.prose-serif {
  font-family: var(--font-serif);
  font-size: 1.125rem;
  line-height: 1.7;
  color: #242424;
}

.prose-serif :deep(p) {
  margin-bottom: 1.25em;
}

.prose-serif :deep(h1),
.prose-serif :deep(h2),
.prose-serif :deep(h3) {
  font-family: var(--font-serif);
  font-weight: 700;
  margin: 1.5em 0 0.5em;
}

.prose-serif :deep(blockquote) {
  border-left: 3px solid #e5e7eb;
  padding-left: 1rem;
  color: #6b7280;
  font-style: italic;
}

.prose-serif :deep(code) {
  background: #f3f4f6;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-size: 0.875em;
}

.prose-serif :deep(pre) {
  background: #1f2937;
  color: #f9fafb;
  padding: 1rem;
  border-radius: 6px;
  overflow-x: auto;
}

.prose-serif :deep(pre code) {
  background: none;
  padding: 0;
}

.prose-serif :deep(img) {
  max-width: 100%;
  border-radius: 6px;
  margin: 1.5rem auto;
}

.prose-serif :deep(ul),
.prose-serif :deep(ol) {
  padding-left: 1.5rem;
  margin-bottom: 1.25em;
}

.prose-serif :deep(a) {
  text-decoration: underline;
}
</style>
```

- [ ] **Step 4: Create reading-list page**

Create `apps/web/app/pages/reading-list.vue`:

```vue
<script setup lang="ts">
import type { ArticleListItem, PaginatedArticles } from '@hoard/shared';
import ArticleCard from '~/components/ui/ArticleCard.vue';
import { useApi } from '~/composables/useApi';

definePageMeta({ middleware: 'auth' });

const auth = useAuthStore();
const { public: { apiBase } } = useRuntimeConfig();

const articles = ref<ArticleListItem[]>([]);
const nextCursor = ref<string | null>(null);
const loading = ref(false);

async function loadMore() {
  loading.value = true;
  try {
    const path = nextCursor.value
      ? `/bookmarks?cursor=${encodeURIComponent(nextCursor.value)}`
      : '/bookmarks';
    const data = await useApi<PaginatedArticles>(
      apiBase, path, auth.accessToken, () => auth.refreshAccessToken(),
    );
    articles.value.push(...data.articles);
    nextCursor.value = data.nextCursor;
  } finally {
    loading.value = false;
  }
}

onMounted(loadMore);
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-12">
    <h1 class="mb-8 font-serif text-3xl font-bold text-ink">Reading list</h1>

    <p v-if="articles.length === 0 && !loading" class="text-sm text-ink-light">
      Your reading list is empty.
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

- [ ] **Step 5: Run full test suite**

Run: `pnpm --filter @hoard/web test`
Expected: all tests pass.

- [ ] **Step 6: Run full build**

Run: `pnpm build`
Expected: all 3 packages build with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/pages/index.vue \
  apps/web/app/pages/@\[username\]/index.vue \
  apps/web/app/pages/@\[username\]/\[slug\].vue \
  apps/web/app/pages/reading-list.vue
git commit -m "feat: add Following tab, FollowButton on profiles, social actions on article page, reading list"
```
