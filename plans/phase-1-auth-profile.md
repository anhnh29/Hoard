# Phase 1a — Email/Password Auth & Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can sign up and log in with email/password, log out, view a public profile at `/@username`, and edit their own name/bio.

**Architecture:** `apps/api` gains a `User` Prisma model, a `UsersModule` (CRUD on users), and an `AuthModule` (Passport `LocalStrategy` + `JwtStrategy`, JWT access token + httpOnly-cookie refresh token, bcrypt password hashing, `@nestjs/throttler` rate limiting). `apps/web` gains a Pinia auth store, an authenticated-fetch composable, and signup/login/profile pages. `packages/shared` gains the `User`/`AuthUser`/`PublicProfile` types and Zod schemas used for frontend form validation.

**Tech Stack:** `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-local`, `passport-jwt`, `@nestjs/throttler`, `bcrypt`, `cookie-parser`, `class-validator`, `class-transformer` (apps/api); `pinia`, `@pinia/nuxt`, `vee-validate`, `@vee-validate/zod`, `zod` (apps/web); `zod` (packages/shared).

## Global Constraints

- Node 22, pnpm 11.7.0, pnpm-only (no npm/yarn).
- All packages stay private, `@hoard/<name>`-scoped.
- JWT access token TTL: 15 minutes. Refresh token TTL: 7 days. (architecture.md)
- Passwords hashed with bcrypt, 10 salt rounds. (architecture.md)
- Refresh token is delivered as an httpOnly cookie named `refreshToken`, scoped to path `/auth`, not readable from JS. Access token is returned in the JSON response body and held in memory (Pinia), never in a cookie or localStorage.
- **`apps/api` is CommonJS; `packages/shared` is ESM (`"type": "module"`).** `apps/api` may only ever `import type { ... } from '@hoard/shared'` — never import a runtime value (e.g. a Zod schema or a function) from `@hoard/shared` into `apps/api`. A non-type-only import compiles to a `require()` call, which throws `ERR_REQUIRE_ESM` at runtime against an ESM package. Backend validation uses `class-validator` DTOs instead; the shared Zod schemas are for `apps/web` only (also ESM, no boundary issue there).
- Out of scope for this plan (deferred to a separate Phase 1b plan, once external credentials exist): Google OAuth, Cloudinary avatar upload. The `User` model still gets nullable `passwordHash` and `avatarUrl` columns now so Phase 1b doesn't need a column-nullability migration later — but no Google strategy, no upload endpoint, no avatar UI in this plan.
- Out of scope for this plan: Playwright / end-to-end browser tests. `plans/phase-6-launch.md` already owns "Playwright e2e covering the full golden path" across all phases — don't duplicate that setup here.
- Test policy for this plan: services, controllers (via supertest e2e against the real local Postgres), the shared Zod schemas, the Pinia store, and the `useApi` composable all get automated tests. Simple presentational pages (`signup.vue`, `login.vue`, `@[username].vue`, `settings/profile.vue`) get manual verification only — this matches the precedent set by Phase 0's `health.vue`, which also had no dedicated component test.
- No global Nuxt route-middleware system yet. The one protected page (`settings/profile.vue`) does an inline `if (!auth.user) navigateTo('/login')` check. Known accepted limitation: the Pinia auth store is in-memory only, so a hard page reload loses the session even though the refresh cookie is still valid — fixing that (silent boot-time refresh) is YAGNI for this plan and can be added later if it becomes annoying.

---

### Task 1: `User` Prisma model + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma model `User` with fields `id, email, passwordHash, name, username, bio, avatarUrl, hashedRefreshToken, createdAt` — every later task in this plan reads/writes this model via `PrismaService`.

- [ ] **Step 1: Make sure the local Postgres container is running**

Run: `docker compose ps`
Expected: a row for the `db` service with state `running` (port `5434->5432`). If it's not there, run `docker compose up -d db` from the repo root first.

- [ ] **Step 2: Add the `User` model**

Modify `apps/api/prisma/schema.prisma` to:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

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
}
```

- [ ] **Step 3: Run the migration**

Run (from the repo root): `pnpm --filter @hoard/api exec prisma migrate dev --name add_user`
Expected: prints "Your database is now in sync with your schema" and creates `apps/api/prisma/migrations/<timestamp>_add_user/migration.sql` containing `CREATE TABLE "User" (...)`.

- [ ] **Step 4: Confirm the Prisma Client picked up the new model**

Run: `pnpm --filter @hoard/api exec prisma generate`
Expected: exits 0, no errors. Then run `pnpm --filter @hoard/api exec tsc --noEmit -p tsconfig.json` — expected: exits 0 (confirms `@prisma/client`'s generated `User` type is visible to the TypeScript compiler).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma
git commit -m "feat: add User model and migration"
```

---

### Task 2: Auth/validation/throttle infra

**Files:**
- Create: `apps/api/src/prisma/prisma.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/.env` (gitignored, not committed)
- Modify: `apps/api/package.json` (new dependencies)

**Interfaces:**
- Produces: a `@Global()` `PrismaModule` exporting `PrismaService` — every module after this task injects `PrismaService` without listing it as its own provider. A global `ThrottlerGuard` (via `APP_GUARD`) — later tasks override its default limit per-route with `@Throttle(...)`.

This task has no new business logic to TDD — it's wiring. Verify each step by running the existing test suite, which must keep passing throughout.

- [ ] **Step 1: Install dependencies**

```bash
pnpm --filter @hoard/api add bcrypt @nestjs/jwt @nestjs/passport passport passport-local passport-jwt @nestjs/throttler cookie-parser class-validator class-transformer
pnpm --filter @hoard/api add -D @types/bcrypt @types/passport-local @types/passport-jwt @types/cookie-parser
```

- [ ] **Step 2: Extract `PrismaService` into its own global module**

Create `apps/api/src/prisma/prisma.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 3: Wire `PrismaModule` and `ThrottlerModule` into `AppModule`**

Modify `apps/api/src/app.module.ts` to:

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
  controllers: [AppController, HealthController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
```

Note: `PrismaService` is no longer listed directly in `providers` — it now comes from the global `PrismaModule`. `HealthController` still injects it the same way (constructor injection), no change needed there.

- [ ] **Step 4: Run the existing tests to confirm the refactor didn't break anything**

Run: `pnpm --filter @hoard/api test`
Expected: PASS, same 3 tests as before (`app.controller.spec.ts`, `health.controller.spec.ts`).

Run: `pnpm --filter @hoard/api test:e2e`
Expected: PASS, the existing `/  (GET)` test still passes.

- [ ] **Step 5: Wire cookie parsing, CORS, and global validation in `main.ts`**

Modify `apps/api/src/main.ts` to:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
```

- [ ] **Step 6: Add the new env vars**

Modify `apps/api/.env.example` to:

```
DATABASE_URL="postgresql://hoard:hoard@localhost:5434/hoard_dev?schema=public"
PORT=3001
WEB_ORIGIN="http://localhost:3000"
JWT_ACCESS_SECRET="change-me-access-secret"
JWT_REFRESH_SECRET="change-me-refresh-secret"
```

Add the same four new lines (`WEB_ORIGIN`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) to `apps/api/.env` with real local values (any non-empty string works for local dev — e.g. reuse the same placeholder text).

- [ ] **Step 7: Verify the app still boots**

Run: `pnpm --filter @hoard/api start:dev` (in background), then: `curl -s http://localhost:3001/health`
Expected: `{"status":"ok","dbConnected":true}` (unchanged from Phase 0). Stop the dev server afterward.

- [ ] **Step 8: Commit**

```bash
pnpm install
git add apps/api/src apps/api/main.ts apps/api/.env.example apps/api/package.json pnpm-lock.yaml
git commit -m "feat: add auth/validation/throttle infra (PrismaModule, cookie-parser, CORS, ValidationPipe, ThrottlerModule)"
```

---

### Task 3: `UsersService` + mapper

**Files:**
- Create: `apps/api/src/users/users.service.ts`
- Create: `apps/api/src/users/users.service.spec.ts`
- Create: `apps/api/src/users/users.mapper.ts`
- Create: `apps/api/src/users/users.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (global, from Task 2).
- Produces: `UsersService` with methods `create(data: {email, passwordHash, name, username}): Promise<User>`, `findByEmail(email: string): Promise<User | null>`, `findByUsername(username: string): Promise<User | null>`, `findById(id: string): Promise<User | null>`, `updateProfile(id: string, data: {name?: string, bio?: string | null}): Promise<User>`, `setHashedRefreshToken(id: string, hashedRefreshToken: string | null): Promise<User>`. Produces `toAuthUser(user: User): AuthUser` and `toPublicProfile(user: User): PublicProfile` from `users.mapper.ts` — Task 4 (AuthService) and Task 7 (UsersController) both import these.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/users/users.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  const prismaMock = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('create() delegates to prisma.user.create', async () => {
    const input = { email: 'a@b.com', passwordHash: 'hash', name: 'Alice', username: 'alice' };
    prismaMock.user.create.mockResolvedValue({ id: '1', ...input });

    const result = await service.create(input);

    expect(prismaMock.user.create).toHaveBeenCalledWith({ data: input });
    expect(result.id).toBe('1');
  });

  it('findByEmail() looks up by email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const result = await service.findByEmail('missing@b.com');
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { email: 'missing@b.com' } });
    expect(result).toBeNull();
  });

  it('findByUsername() looks up by username', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await service.findByUsername('alice');
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { username: 'alice' } });
  });

  it('findById() looks up by id', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await service.findById('1');
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
  });

  it('updateProfile() updates name/bio', async () => {
    prismaMock.user.update.mockResolvedValue({ id: '1' });
    await service.updateProfile('1', { name: 'New Name', bio: 'New bio' });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { name: 'New Name', bio: 'New bio' },
    });
  });

  it('setHashedRefreshToken() updates the token column', async () => {
    prismaMock.user.update.mockResolvedValue({ id: '1' });
    await service.setHashedRefreshToken('1', 'hashed-token');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { hashedRefreshToken: 'hashed-token' },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @hoard/api test -- users.service`
Expected: FAIL — `Cannot find module './users.service'`.

- [ ] **Step 3: Implement `UsersService`**

Create `apps/api/src/users/users.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  username: string;
}

interface UpdateProfileInput {
  name?: string;
  bio?: string | null;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateUserInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  updateProfile(id: string, data: UpdateProfileInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  setHashedRefreshToken(id: string, hashedRefreshToken: string | null): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { hashedRefreshToken } });
  }
}
```

- [ ] **Step 4: Create the mapper**

Create `apps/api/src/users/users.mapper.ts`:

```typescript
import type { User } from '@prisma/client';
import type { AuthUser, PublicProfile } from '@hoard/shared';

export function toAuthUser(user: User): AuthUser {
  return { id: user.id, email: user.email, username: user.username, name: user.name };
}

export function toPublicProfile(user: User): PublicProfile {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
  };
}
```

This imports `AuthUser`/`PublicProfile` from `@hoard/shared` — Task 8 (later in this plan) creates them. Since these are `import type` only, TypeScript only needs the `.d.ts` to exist at typecheck time, and Task 8 will be done before you run a typecheck that includes this file in a full build. If you're implementing tasks out of order, add a temporary local type and revisit — but in this plan's intended order, Task 8 happens later only because the frontend needs it later too; nothing stops you from doing Task 8 first if it's more convenient. (Tasks 3-7 only need the *types*, which are cheap to define early.)

- [ ] **Step 5: Create `UsersModule` and wire it into `AppModule`**

Create `apps/api/src/users/users.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

Modify `apps/api/src/app.module.ts` — add `UsersModule` to `imports`:

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]), UsersModule],
  controllers: [AppController, HealthController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @hoard/api test -- users.service`
Expected: PASS, 6 tests passed.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src
git commit -m "feat: add UsersService and user/profile mappers"
```

---

### Task 4: `AuthService`

**Files:**
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/auth.service.spec.ts`
- Create: `apps/api/src/auth/dto/signup.dto.ts`

**Interfaces:**
- Consumes: `UsersService` (Task 3), `toAuthUser` (Task 3's mapper), `JwtService` from `@nestjs/jwt`.
- Produces: `AuthService` with `signup(dto: SignupDto): Promise<{user: AuthUser, tokens: TokenPair}>`, `validateUser(email: string, password: string): Promise<AuthUser>`, `login(user: AuthUser): Promise<TokenPair>`, `refresh(refreshToken: string): Promise<TokenPair>`, `logout(userId: string): Promise<void>`, and the exported constant `REFRESH_TOKEN_TTL_MS`. `TokenPair` is `{accessToken: string, refreshToken: string}`. Task 5 (strategies) calls `validateUser`. Task 6 (controller) calls all five methods plus imports `REFRESH_TOKEN_TTL_MS` for the cookie's `maxAge`.

- [ ] **Step 1: Create the signup DTO**

Create `apps/api/src/auth/dto/signup.dto.ts`:

```typescript
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'username can only contain lowercase letters, numbers, and underscores',
  })
  username!: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/auth/auth.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  let service: AuthService;
  const usersServiceMock = {
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    setHashedRefreshToken: jest.fn(),
  };
  const jwtServiceMock = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const fakeUser = {
    id: 'u1',
    email: 'alice@example.com',
    name: 'Alice',
    username: 'alice',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
    bio: null,
    avatarUrl: null,
    hashedRefreshToken: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = 'access-secret';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret';
    jwtServiceMock.signAsync.mockResolvedValue('signed-token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersServiceMock },
        { provide: JwtService, useValue: jwtServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('signup', () => {
    it('rejects a duplicate email', async () => {
      usersServiceMock.findByEmail.mockResolvedValue(fakeUser);

      await expect(
        service.signup({ email: 'alice@example.com', password: 'password123', name: 'Alice', username: 'alice2' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a duplicate username', async () => {
      usersServiceMock.findByEmail.mockResolvedValue(null);
      usersServiceMock.findByUsername.mockResolvedValue(fakeUser);

      await expect(
        service.signup({ email: 'new@example.com', password: 'password123', name: 'Alice', username: 'alice' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates the user with a bcrypt password hash and issues tokens', async () => {
      usersServiceMock.findByEmail.mockResolvedValue(null);
      usersServiceMock.findByUsername.mockResolvedValue(null);
      usersServiceMock.create.mockResolvedValue(fakeUser);

      const result = await service.signup({
        email: 'alice@example.com',
        password: 'password123',
        name: 'Alice',
        username: 'alice',
      });

      expect(usersServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'alice@example.com', name: 'Alice', username: 'alice' }),
      );
      const createCallArg = usersServiceMock.create.mock.calls[0][0];
      expect(createCallArg.passwordHash).not.toBe('password123');
      expect(result.user).toEqual({ id: 'u1', email: 'alice@example.com', username: 'alice', name: 'Alice' });
      expect(result.tokens.accessToken).toBe('signed-token');
      expect(usersServiceMock.setHashedRefreshToken).toHaveBeenCalledWith('u1', expect.any(String));
    });
  });

  describe('validateUser', () => {
    it('throws when email or password is missing, without touching the database', async () => {
      await expect(service.validateUser('', 'password123')).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(service.validateUser('alice@example.com', '')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersServiceMock.findByEmail).not.toHaveBeenCalled();
    });

    it('throws when the user does not exist', async () => {
      usersServiceMock.findByEmail.mockResolvedValue(null);
      await expect(service.validateUser('missing@example.com', 'password123')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws when the password does not match', async () => {
      usersServiceMock.findByEmail.mockResolvedValue(fakeUser);
      await expect(service.validateUser('alice@example.com', 'wrong-password')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('throws when the refresh token signature is invalid', async () => {
      jwtServiceMock.verifyAsync.mockRejectedValue(new Error('bad signature'));
      await expect(service.refresh('bad-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws when the stored hash does not match', async () => {
      jwtServiceMock.verifyAsync.mockResolvedValue({ sub: 'u1' });
      usersServiceMock.findById.mockResolvedValue({ ...fakeUser, hashedRefreshToken: null });
      await expect(service.refresh('some-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('clears the stored refresh token hash', async () => {
      await service.logout('u1');
      expect(usersServiceMock.setHashedRefreshToken).toHaveBeenCalledWith('u1', null);
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @hoard/api test -- auth.service`
Expected: FAIL — `Cannot find module './auth.service'`.

- [ ] **Step 4: Implement `AuthService`**

Create `apps/api/src/auth/auth.service.ts`:

```typescript
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import type { AuthUser } from '@hoard/shared';
import { UsersService } from '../users/users.service';
import { toAuthUser } from '../users/users.mapper';
import { SignupDto } from './dto/signup.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto): Promise<{ user: AuthUser; tokens: TokenPair }> {
    const existingEmail = await this.usersService.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException('Email is already in use');
    }
    const existingUsername = await this.usersService.findByUsername(dto.username);
    if (existingUsername) {
      throw new ConflictException('Username is already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      username: dto.username,
    });

    const authUser = toAuthUser(user);
    const tokens = await this.issueTokens(authUser);
    return { user: authUser, tokens };
  }

  async validateUser(email: string, password: string): Promise<AuthUser> {
    if (!email || !password) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return toAuthUser(user);
  }

  login(user: AuthUser): Promise<TokenPair> {
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const matches = await bcrypt.compare(refreshToken, user.hashedRefreshToken);
    if (!matches) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.issueTokens(toAuthUser(user));
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.setHashedRefreshToken(userId, null);
  }

  private async issueTokens(user: AuthUser): Promise<TokenPair> {
    const payload = { sub: user.id, email: user.email, username: user.username, name: user.name };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: ACCESS_TOKEN_TTL,
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: REFRESH_TOKEN_TTL,
    });
    const hashedRefreshToken = await bcrypt.hash(refreshToken, BCRYPT_SALT_ROUNDS);
    await this.usersService.setHashedRefreshToken(user.id, hashedRefreshToken);
    return { accessToken, refreshToken };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @hoard/api test -- auth.service`
Expected: PASS, 9 tests passed.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth
git commit -m "feat: add AuthService (signup, login, refresh, logout)"
```

---

### Task 5: Passport strategies, guards, and `AuthModule`

**Files:**
- Create: `apps/api/src/auth/local.strategy.ts`
- Create: `apps/api/src/auth/jwt.strategy.ts`
- Create: `apps/api/src/auth/local-auth.guard.ts`
- Create: `apps/api/src/auth/jwt-auth.guard.ts`
- Create: `apps/api/src/auth/local.strategy.spec.ts`
- Create: `apps/api/src/auth/jwt.strategy.spec.ts`
- Create: `apps/api/src/auth/auth.module.ts`

**Interfaces:**
- Consumes: `AuthService.validateUser` (Task 4).
- Produces: `LocalAuthGuard` and `JwtAuthGuard` (both `@Injectable()`, both extend `AuthGuard`) — Task 6's `AuthController` and Task 7's `UsersController` apply these via `@UseGuards(...)`. A request handled by `JwtAuthGuard` gets `req.user` typed as `AuthUser`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/auth/local.strategy.spec.ts`:

```typescript
import { LocalStrategy } from './local.strategy';
import { AuthService } from './auth.service';

describe('LocalStrategy', () => {
  it('delegates validation to AuthService.validateUser', async () => {
    const authServiceMock = {
      validateUser: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.com', username: 'alice', name: 'Alice' }),
    } as unknown as AuthService;
    const strategy = new LocalStrategy(authServiceMock);

    const result = await strategy.validate('a@b.com', 'password123');

    expect(authServiceMock.validateUser).toHaveBeenCalledWith('a@b.com', 'password123');
    expect(result.username).toBe('alice');
  });
});
```

Create `apps/api/src/auth/jwt.strategy.spec.ts`:

```typescript
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'access-secret';
  });

  it('maps a JWT payload to an AuthUser', () => {
    const strategy = new JwtStrategy();
    const result = strategy.validate({ sub: 'u1', email: 'a@b.com', username: 'alice', name: 'Alice' });
    expect(result).toEqual({ id: 'u1', email: 'a@b.com', username: 'alice', name: 'Alice' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @hoard/api test -- local.strategy jwt.strategy`
Expected: FAIL — `Cannot find module './local.strategy'` / `'./jwt.strategy'`.

- [ ] **Step 3: Implement the strategies**

Create `apps/api/src/auth/local.strategy.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import type { AuthUser } from '@hoard/shared';
import { AuthService } from './auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'email' });
  }

  validate(email: string, password: string): Promise<AuthUser> {
    return this.authService.validateUser(email, password);
  }
}
```

Create `apps/api/src/auth/jwt.strategy.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from '@hoard/shared';

interface JwtPayload {
  sub: string;
  email: string;
  username: string;
  name: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET as string,
    });
  }

  validate(payload: JwtPayload): AuthUser {
    return { id: payload.sub, email: payload.email, username: payload.username, name: payload.name };
  }
}
```

- [ ] **Step 4: Implement the guards**

Create `apps/api/src/auth/local-auth.guard.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
```

Create `apps/api/src/auth/jwt-auth.guard.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 5: Create `AuthModule`**

Create `apps/api/src/auth/auth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LocalStrategy } from './local.strategy';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), UsersModule],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

Note: no `controllers` array yet — `AuthController` is Task 6. `AuthModule` isn't imported into `AppModule` yet either; Task 6 does that alongside adding the controller, so this task's module isn't reachable from the running app until then. That's fine — this task is fully tested at the unit level without needing the module wired into the app.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @hoard/api test -- local.strategy jwt.strategy`
Expected: PASS, 2 tests passed.

Run: `pnpm --filter @hoard/api test`
Expected: PASS, all tests across the project still pass (confirms nothing else broke).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth
git commit -m "feat: add Passport local/jwt strategies, guards, and AuthModule"
```

---

### Task 6: `AuthController`

**Files:**
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/test/auth.e2e-spec.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `AuthService` and `REFRESH_TOKEN_TTL_MS` (Task 4), `LocalAuthGuard`/`JwtAuthGuard` (Task 5).
- Produces: `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` — Task 7's manual verification and `apps/web` tasks (9-13) all call these exact paths.

Note: `/auth/login` has no `@Body()` DTO. `LocalAuthGuard` runs Passport's `local` strategy as part of its `canActivate()`, which executes before any handler-bound `ValidationPipe` would run — so a DTO on this route wouldn't actually validate anything before authentication is attempted, and would just be dead code. That's why Task 4's `AuthService.validateUser` was given an explicit `!email || !password` guard instead: it's the actual point where malformed input is rejected cleanly (as a 401) rather than reaching `bcrypt.compare`/Prisma with `undefined` and throwing an unhandled error.

- [ ] **Step 1: Write the failing e2e test**

Create `apps/api/test/auth.e2e-spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const testEmail = `e2e-${Date.now()}@e2e-test.local`;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
    process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@e2e-test.local' } } });
    await app.close();
  });

  it('signs up, logs in, refreshes, fetches /me, then logs out', async () => {
    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: testEmail, password: 'password123', name: 'E2E User', username: `e2e${Date.now()}` })
      .expect(201);

    expect(signupRes.body.user.email).toBe(testEmail);
    expect(signupRes.body.accessToken).toBeDefined();
    const signupCookie = signupRes.headers['set-cookie'];
    expect(signupCookie).toBeDefined();

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: 'password123' })
      .expect(201);

    expect(loginRes.body.accessToken).toBeDefined();
    const refreshCookie = loginRes.headers['set-cookie'];

    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);
    expect(meRes.body.email).toBe(testEmail);

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(201);
    expect(refreshRes.body.accessToken).toBeDefined();

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${refreshRes.body.accessToken}`)
      .expect(204);
  });

  it('rejects login with the wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: 'totally-wrong' })
      .expect(401);
  });

  it('rejects signup with a duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: testEmail, password: 'password123', name: 'Dupe', username: `dupe${Date.now()}` })
      .expect(409);
  });

  it('rejects /me without a token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });
});
```

- [ ] **Step 2: Run the e2e test to verify it fails**

Run: `pnpm --filter @hoard/api test:e2e -- auth`
Expected: FAIL — connection refused on `/auth/signup` (404, since the route doesn't exist yet).

- [ ] **Step 3: Implement `AuthController`**

Create `apps/api/src/auth/auth.controller.ts`:

```typescript
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthUser } from '@hoard/shared';
import { AuthService, REFRESH_TOKEN_TTL_MS } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SignupDto } from './dto/signup.dto';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/auth',
  maxAge: REFRESH_TOKEN_TTL_MS,
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.signup(dto);
    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
    return { user, accessToken: tokens.accessToken };
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Req() req: Request & { user: AuthUser }, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(req.user);
    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
    return { user: req.user, accessToken: tokens.accessToken };
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const tokens = await this.authService.refresh(refreshToken);
    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken: tokens.accessToken };
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Req() req: Request & { user: AuthUser }, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.user.id);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request & { user: AuthUser }): AuthUser {
    return req.user;
  }
}
```

- [ ] **Step 4: Wire `AuthController` into `AuthModule`, and `AuthModule` into `AppModule`**

Modify `apps/api/src/auth/auth.module.ts` — add `controllers`:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { LocalStrategy } from './local.strategy';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

Modify `apps/api/src/app.module.ts` — add `AuthModule` to `imports`:

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    UsersModule,
    AuthModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
```

- [ ] **Step 5: Run the e2e test to verify it passes**

Run: `pnpm --filter @hoard/api test:e2e -- auth`
Expected: PASS, 4 tests passed.

Run: `pnpm --filter @hoard/api test:e2e`
Expected: PASS, the original `app.e2e-spec.ts` still passes too.

- [ ] **Step 6: Manually verify throttling**

With `pnpm --filter @hoard/api start:dev` running, send 6 rapid signups: `for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/auth/signup -H 'Content-Type: application/json' -d "{\"email\":\"throttle$i@e2e-test.local\",\"password\":\"password123\",\"name\":\"T\",\"username\":\"throttle$i\"}"; done`
Expected: the first 5 print `201`, the 6th prints `429`. Stop the dev server afterward. Clean up the rows this created: `docker compose exec db psql -U hoard -d hoard_dev -c "DELETE FROM \"User\" WHERE email LIKE '%@e2e-test.local';"`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth apps/api/test
git commit -m "feat: add AuthController (signup, login, refresh, logout, me)"
```

---

### Task 7: `UsersController`

**Files:**
- Create: `apps/api/src/users/dto/update-profile.dto.ts`
- Create: `apps/api/src/users/users.controller.ts`
- Create: `apps/api/test/users.e2e-spec.ts`
- Modify: `apps/api/src/users/users.module.ts`

**Interfaces:**
- Consumes: `UsersService` (Task 3), `toPublicProfile` (Task 3), `JwtAuthGuard` (Task 5).
- Produces: `GET /users/:username` (public), `PATCH /users/me` (authenticated) — Task 12 and Task 13's pages call these exact paths.

- [ ] **Step 1: Create the update-profile DTO**

Create `apps/api/src/users/dto/update-profile.dto.ts`:

```typescript
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  bio?: string | null;
}
```

- [ ] **Step 2: Write the failing e2e test**

Create `apps/api/test/users.e2e-spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const testEmail = `e2e-users-${Date.now()}@e2e-test.local`;
  const testUsername = `e2eusers${Date.now()}`;
  let accessToken: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
    process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: testEmail, password: 'password123', name: 'Profile User', username: testUsername });
    accessToken = signupRes.body.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@e2e-test.local' } } });
    await app.close();
  });

  it('GET /users/:username returns the public profile', async () => {
    const res = await request(app.getHttpServer()).get(`/users/${testUsername}`).expect(200);
    expect(res.body).toEqual({
      id: expect.any(String),
      username: testUsername,
      name: 'Profile User',
      bio: null,
      avatarUrl: null,
    });
  });

  it('GET /users/:username 404s for an unknown username', async () => {
    await request(app.getHttpServer()).get('/users/does-not-exist').expect(404);
  });

  it('PATCH /users/me updates the current user and rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).patch('/users/me').send({ name: 'New Name' }).expect(401);

    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'New Name', bio: 'Hello world' })
      .expect(200);

    expect(res.body.name).toBe('New Name');
    expect(res.body.bio).toBe('Hello world');
  });
});
```

- [ ] **Step 3: Run the e2e test to verify it fails**

Run: `pnpm --filter @hoard/api test:e2e -- users`
Expected: FAIL — 404 on `GET /users/:username` (route doesn't exist yet).

- [ ] **Step 4: Implement `UsersController`**

Create `apps/api/src/users/users.controller.ts`:

```typescript
import { Body, Controller, Get, NotFoundException, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser, PublicProfile } from '@hoard/shared';
import { UsersService } from './users.service';
import { toPublicProfile } from './users.mapper';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':username')
  async getByUsername(@Param('username') username: string): Promise<PublicProfile> {
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicProfile(user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMe(
    @Req() req: Request & { user: AuthUser },
    @Body() dto: UpdateProfileDto,
  ): Promise<PublicProfile> {
    const updated = await this.usersService.updateProfile(req.user.id, dto);
    return toPublicProfile(updated);
  }
}
```

- [ ] **Step 5: Wire `UsersController` into `UsersModule`**

Modify `apps/api/src/users/users.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 6: Run the e2e test to verify it passes**

Run: `pnpm --filter @hoard/api test:e2e -- users`
Expected: PASS, 3 tests passed.

Run: `pnpm --filter @hoard/api test:e2e`
Expected: PASS — all e2e tests (`app`, `auth`, `users`) pass together.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/users apps/api/test
git commit -m "feat: add UsersController (public profile, update own profile)"
```

---

### Task 8: `packages/shared` — User types and Zod schemas

**Files:**
- Create: `packages/shared/src/user.ts`
- Create: `packages/shared/src/user.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json` (new dependency: `zod`)

**Interfaces:**
- Produces: types `AuthUser`, `PublicProfile`; Zod schemas `signupSchema`, `loginSchema`, `updateProfileSchema` and their inferred types `SignupInput`, `LoginInput`, `UpdateProfileInput`. `apps/api`'s Tasks 3-7 already used `import type { AuthUser, PublicProfile }` from this module (type-only, so those tasks didn't need this one to exist first — see the note in Task 3). `apps/web`'s Tasks 9-13 import the Zod schemas at runtime (safe — both packages are ESM).

- [ ] **Step 1: Add the `zod` dependency**

```bash
pnpm --filter @hoard/shared add zod
```

- [ ] **Step 2: Write the failing test**

Create `packages/shared/src/user.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { signupSchema, loginSchema, updateProfileSchema } from './user';

describe('signupSchema', () => {
  it('accepts a valid signup payload', () => {
    const result = signupSchema.safeParse({
      email: 'alice@example.com',
      password: 'password123',
      name: 'Alice',
      username: 'alice_1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = signupSchema.safeParse({
      email: 'alice@example.com',
      password: 'short',
      name: 'Alice',
      username: 'alice_1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a username with uppercase letters', () => {
    const result = signupSchema.safeParse({
      email: 'alice@example.com',
      password: 'password123',
      name: 'Alice',
      username: 'Alice',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts a valid login payload', () => {
    const result = loginSchema.safeParse({ email: 'alice@example.com', password: 'anything' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'anything' });
    expect(result.success).toBe(false);
  });
});

describe('updateProfileSchema', () => {
  it('accepts a partial update with just a name', () => {
    const result = updateProfileSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('accepts a null bio', () => {
    const result = updateProfileSchema.safeParse({ bio: null });
    expect(result.success).toBe(true);
  });

  it('rejects a bio longer than 280 characters', () => {
    const result = updateProfileSchema.safeParse({ bio: 'x'.repeat(281) });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @hoard/shared test`
Expected: FAIL — `Cannot find module './user'`.

- [ ] **Step 4: Implement `user.ts`**

Create `packages/shared/src/user.ts`:

```typescript
import { z } from 'zod';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  name: string;
}

export interface PublicProfile {
  id: string;
  username: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
}

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(80),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, numbers, and underscores'),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  bio: z.string().max(280).nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
```

- [ ] **Step 5: Re-export from the package entry point**

Modify `packages/shared/src/index.ts`:

```typescript
export * from './health.js';
export * from './user.js';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @hoard/shared test`
Expected: PASS, 11 tests passed (3 existing `health` tests + 8 new `user` tests: 3 signup + 2 login + 3 updateProfile).

- [ ] **Step 7: Build and verify the type-only imports in `apps/api` still typecheck**

Run: `pnpm --filter @hoard/shared build`
Expected: exits 0, `dist/user.js` and `dist/user.d.ts` created.

Run: `pnpm --filter @hoard/api exec tsc --noEmit -p tsconfig.json`
Expected: exits 0 (confirms `apps/api`'s `import type { AuthUser, PublicProfile } from '@hoard/shared'` in `users.mapper.ts`, `auth.service.ts`, etc. all resolve correctly now that the real module exists, not just speculatively).

- [ ] **Step 8: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat: add AuthUser/PublicProfile types and auth Zod schemas to @hoard/shared"
```

---

### Task 9: `apps/web` — Pinia auth store

**Files:**
- Modify: `apps/web/nuxt.config.ts`
- Modify: `apps/web/package.json` (new dependencies: `pinia`, `@pinia/nuxt`)
- Create: `apps/web/app/stores/auth.ts`
- Create: `apps/web/app/stores/auth.test.ts`

**Interfaces:**
- Produces: `useAuthStore()` with state `user: AuthUser | null`, `accessToken: string | null`; actions `setSession(user: AuthUser, accessToken: string)`, `clearSession()`, `refreshAccessToken(apiBase: string): Promise<string>`. Task 10's `useApi` is called with `() => auth.refreshAccessToken(apiBase)` as its refresh callback (Tasks 11-13). `auth.user`/`auth.accessToken` are read directly by Tasks 11-13's pages.

- [ ] **Step 1: Add Pinia**

```bash
pnpm --filter @hoard/web add pinia @pinia/nuxt
```

Modify `apps/web/nuxt.config.ts`:

```typescript
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@pinia/nuxt'],
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? 'http://localhost:3001',
    },
  },
});
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/app/stores/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from './auth';

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('$fetch', vi.fn());
  });

  it('starts with no session', () => {
    const store = useAuthStore();
    expect(store.user).toBeNull();
    expect(store.accessToken).toBeNull();
  });

  it('setSession stores the user and access token', () => {
    const store = useAuthStore();
    store.setSession({ id: '1', email: 'a@b.com', username: 'alice', name: 'Alice' }, 'token123');
    expect(store.user?.username).toBe('alice');
    expect(store.accessToken).toBe('token123');
  });

  it('clearSession resets state', () => {
    const store = useAuthStore();
    store.setSession({ id: '1', email: 'a@b.com', username: 'alice', name: 'Alice' }, 'token123');
    store.clearSession();
    expect(store.user).toBeNull();
    expect(store.accessToken).toBeNull();
  });

  it('refreshAccessToken calls /auth/refresh and updates the stored token', async () => {
    const fetchMock = globalThis.$fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ accessToken: 'new-token' });
    const store = useAuthStore();

    const result = await store.refreshAccessToken('http://localhost:3001');

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    expect(result).toBe('new-token');
    expect(store.accessToken).toBe('new-token');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @hoard/web test`
Expected: FAIL — `Cannot find module './auth'`.

- [ ] **Step 4: Implement the store**

Create `apps/web/app/stores/auth.ts`:

```typescript
import { defineStore } from 'pinia';
import type { AuthUser } from '@hoard/shared';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    accessToken: null,
  }),
  actions: {
    setSession(user: AuthUser, accessToken: string) {
      this.user = user;
      this.accessToken = accessToken;
    },
    clearSession() {
      this.user = null;
      this.accessToken = null;
    },
    async refreshAccessToken(apiBase: string): Promise<string> {
      const result = await $fetch<{ accessToken: string }>(`${apiBase}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      this.accessToken = result.accessToken;
      return result.accessToken;
    },
  },
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @hoard/web test`
Expected: PASS, 4 new tests passed (plus the existing `useHealth` tests still passing).

- [ ] **Step 6: Commit**

```bash
pnpm install
git add apps/web/nuxt.config.ts apps/web/package.json apps/web/app/stores pnpm-lock.yaml
git commit -m "feat: add Pinia auth store"
```

---

### Task 10: `apps/web` — `useApi` authenticated fetch composable

**Files:**
- Create: `apps/web/app/composables/useApi.ts`
- Create: `apps/web/app/composables/useApi.test.ts`

**Interfaces:**
- Produces: `useApi<T>(apiBase: string, path: string, accessToken: string | null, onRefresh: () => Promise<string>, options?: {method?: string, body?: unknown, headers?: Record<string,string>}): Promise<T>`. Task 13's edit-profile page calls this with `auth.refreshAccessToken` (Task 9) as `onRefresh`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/composables/useApi.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useApi } from './useApi';

describe('useApi', () => {
  beforeEach(() => {
    vi.stubGlobal('$fetch', vi.fn());
  });

  it('attaches the access token and returns the response on success', async () => {
    const fetchMock = globalThis.$fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: true });

    const result = await useApi('http://localhost:3001', '/auth/me', 'token-1', async () => 'token-2');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/auth/me',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
      }),
    );
  });

  it('refreshes once and retries on a 401, then succeeds', async () => {
    const fetchMock = globalThis.$fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce({ statusCode: 401 }).mockResolvedValueOnce({ ok: true });
    const onRefresh = vi.fn().mockResolvedValue('token-2');

    const result = await useApi('http://localhost:3001', '/auth/me', 'token-1', onRefresh);

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:3001/auth/me',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token-2' }) }),
    );
  });

  it('rethrows non-401 errors without attempting a refresh', async () => {
    const fetchMock = globalThis.$fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue({ statusCode: 500 });
    const onRefresh = vi.fn();

    await expect(useApi('http://localhost:3001', '/auth/me', 'token-1', onRefresh)).rejects.toEqual({
      statusCode: 500,
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @hoard/web test`
Expected: FAIL — `Cannot find module './useApi'`.

- [ ] **Step 3: Implement `useApi`**

Create `apps/web/app/composables/useApi.ts`:

```typescript
interface UseApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

function isUnauthorized(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { statusCode?: number }).statusCode === 401);
}

export async function useApi<T>(
  apiBase: string,
  path: string,
  accessToken: string | null,
  onRefresh: () => Promise<string>,
  options: UseApiOptions = {},
): Promise<T> {
  const doFetch = (token: string | null) =>
    $fetch<T>(`${apiBase}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  try {
    return await doFetch(accessToken);
  } catch (err) {
    if (isUnauthorized(err) && accessToken) {
      const newToken = await onRefresh();
      return await doFetch(newToken);
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @hoard/web test`
Expected: PASS, 3 new tests passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/composables/useApi.ts apps/web/app/composables/useApi.test.ts
git commit -m "feat: add useApi authenticated fetch composable with 401 retry"
```

---

### Task 11: `apps/web` — signup and login pages

**Files:**
- Create: `apps/web/app/pages/signup.vue`
- Create: `apps/web/app/pages/login.vue`
- Modify: `apps/web/package.json` (new dependencies: `vee-validate`, `@vee-validate/zod`, `zod`)

**Interfaces:**
- Consumes: `useAuthStore` (Task 9), `signupSchema`/`loginSchema` from `@hoard/shared` (Task 8).
- No automated test for this task (see Global Constraints) — manual verification only.

- [ ] **Step 1: Add form dependencies**

```bash
pnpm --filter @hoard/web add vee-validate @vee-validate/zod zod
```

- [ ] **Step 2: Create the signup page**

Create `apps/web/app/pages/signup.vue`:

```vue
<script setup lang="ts">
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { signupSchema } from '@hoard/shared';
import type { AuthUser } from '@hoard/shared';

const { defineField, handleSubmit, errors } = useForm({
  validationSchema: toTypedSchema(signupSchema),
});

const [email] = defineField('email');
const [password] = defineField('password');
const [name] = defineField('name');
const [username] = defineField('username');

const auth = useAuthStore();
const router = useRouter();
const config = useRuntimeConfig();
const submitError = ref<string | null>(null);

const onSubmit = handleSubmit(async (values) => {
  submitError.value = null;
  try {
    const result = await $fetch<{ user: AuthUser; accessToken: string }>(
      `${config.public.apiBase}/auth/signup`,
      { method: 'POST', body: values, credentials: 'include' },
    );
    auth.setSession(result.user, result.accessToken);
    await router.push(`/@${result.user.username}`);
  } catch {
    submitError.value = 'Signup failed. Check your details and try again.';
  }
});
</script>

<template>
  <form @submit="onSubmit">
    <h1>Sign up</h1>
    <label>
      Email
      <input v-model="email" type="email" />
    </label>
    <p v-if="errors.email">{{ errors.email }}</p>

    <label>
      Password
      <input v-model="password" type="password" />
    </label>
    <p v-if="errors.password">{{ errors.password }}</p>

    <label>
      Name
      <input v-model="name" type="text" />
    </label>
    <p v-if="errors.name">{{ errors.name }}</p>

    <label>
      Username
      <input v-model="username" type="text" />
    </label>
    <p v-if="errors.username">{{ errors.username }}</p>

    <p v-if="submitError">{{ submitError }}</p>
    <button type="submit">Create account</button>
  </form>
</template>
```

- [ ] **Step 3: Create the login page**

Create `apps/web/app/pages/login.vue`:

```vue
<script setup lang="ts">
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { loginSchema } from '@hoard/shared';
import type { AuthUser } from '@hoard/shared';

const { defineField, handleSubmit, errors } = useForm({
  validationSchema: toTypedSchema(loginSchema),
});

const [email] = defineField('email');
const [password] = defineField('password');

const auth = useAuthStore();
const router = useRouter();
const config = useRuntimeConfig();
const submitError = ref<string | null>(null);

const onSubmit = handleSubmit(async (values) => {
  submitError.value = null;
  try {
    const result = await $fetch<{ user: AuthUser; accessToken: string }>(
      `${config.public.apiBase}/auth/login`,
      { method: 'POST', body: values, credentials: 'include' },
    );
    auth.setSession(result.user, result.accessToken);
    await router.push(`/@${result.user.username}`);
  } catch {
    submitError.value = 'Invalid email or password.';
  }
});
</script>

<template>
  <form @submit="onSubmit">
    <h1>Log in</h1>
    <label>
      Email
      <input v-model="email" type="email" />
    </label>
    <p v-if="errors.email">{{ errors.email }}</p>

    <label>
      Password
      <input v-model="password" type="password" />
    </label>
    <p v-if="errors.password">{{ errors.password }}</p>

    <p v-if="submitError">{{ submitError }}</p>
    <button type="submit">Log in</button>
  </form>
</template>
```

- [ ] **Step 4: Manually verify**

Start Postgres (`docker compose up -d db`), then from the repo root run `pnpm dev` (starts both apps via Turborepo). Visit `http://localhost:3000/signup`, fill in the form with a brand-new email/username, submit. Expected: redirected to `/@<username>` (this page doesn't exist until Task 12 — a 404 here is expected and fine for this task; what you're confirming is that the signup request succeeded and the redirect was attempted with the right username). Then visit `http://localhost:3000/login` and log in with the same credentials — same expected redirect behavior.

- [ ] **Step 5: Commit**

```bash
pnpm install
git add apps/web/app/pages/signup.vue apps/web/app/pages/login.vue apps/web/package.json pnpm-lock.yaml
git commit -m "feat: add signup and login pages"
```

---

### Task 12: `apps/web` — public profile page

**Files:**
- Create: `apps/web/app/pages/@[username].vue`

**Interfaces:**
- Consumes: `GET /users/:username` (Task 7).
- No automated test for this task (see Global Constraints) — manual verification only.

- [ ] **Step 1: Create the page**

Create `apps/web/app/pages/@[username].vue`:

```vue
<script setup lang="ts">
import type { PublicProfile } from '@hoard/shared';

const route = useRoute();
const config = useRuntimeConfig();
const username = route.params.username as string;

const { data, error } = await useFetch<PublicProfile>(`${config.public.apiBase}/users/${username}`);
</script>

<template>
  <div>
    <p v-if="error">User not found.</p>
    <div v-else-if="data">
      <img v-if="data.avatarUrl" :src="data.avatarUrl" :alt="data.name" />
      <h1>{{ data.name }}</h1>
      <p>@{{ data.username }}</p>
      <p v-if="data.bio">{{ data.bio }}</p>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Manually verify**

With both dev servers running (`pnpm dev` from the repo root) and a user already signed up (from Task 11's verification, or sign up a new one now), visit `http://localhost:3000/@<that username>`. Expected: page renders the name, `@username`, and bio (empty at this point, since nothing has set a bio yet — that's Task 13). Visit `http://localhost:3000/@does-not-exist`. Expected: "User not found."

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/pages/@[username].vue"
git commit -m "feat: add public profile page"
```

---

### Task 13: `apps/web` — edit profile page and logout

**Files:**
- Create: `apps/web/app/pages/settings/profile.vue`

**Interfaces:**
- Consumes: `useAuthStore` (Task 9), `useApi` (Task 10), `updateProfileSchema` from `@hoard/shared` (Task 8), `PATCH /users/me` and `POST /auth/logout` (Tasks 6-7).
- No automated test for this task (see Global Constraints) — manual verification only.

- [ ] **Step 1: Create the page**

Create `apps/web/app/pages/settings/profile.vue`:

```vue
<script setup lang="ts">
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { updateProfileSchema } from '@hoard/shared';
import type { PublicProfile } from '@hoard/shared';

const auth = useAuthStore();
const config = useRuntimeConfig();
const router = useRouter();

if (!auth.user) {
  await navigateTo('/login');
}

const { defineField, handleSubmit, errors } = useForm({
  validationSchema: toTypedSchema(updateProfileSchema),
  initialValues: { name: auth.user?.name ?? '', bio: '' },
});

const [name] = defineField('name');
const [bio] = defineField('bio');
const submitError = ref<string | null>(null);

const onSubmit = handleSubmit(async (values) => {
  submitError.value = null;
  try {
    const updated = await useApi<PublicProfile>(
      config.public.apiBase,
      '/users/me',
      auth.accessToken,
      () => auth.refreshAccessToken(config.public.apiBase),
      { method: 'PATCH', body: values },
    );
    await router.push(`/@${updated.username}`);
  } catch {
    submitError.value = 'Could not save your profile. Try again.';
  }
});

async function logout() {
  try {
    await useApi(
      config.public.apiBase,
      '/auth/logout',
      auth.accessToken,
      () => auth.refreshAccessToken(config.public.apiBase),
      { method: 'POST' },
    );
  } finally {
    auth.clearSession();
    await router.push('/login');
  }
}
</script>

<template>
  <form @submit="onSubmit">
    <h1>Edit profile</h1>
    <label>
      Name
      <input v-model="name" type="text" />
    </label>
    <p v-if="errors.name">{{ errors.name }}</p>

    <label>
      Bio
      <textarea v-model="bio"></textarea>
    </label>
    <p v-if="errors.bio">{{ errors.bio }}</p>

    <p v-if="submitError">{{ submitError }}</p>
    <button type="submit">Save</button>
  </form>
  <button type="button" @click="logout">Log out</button>
</template>
```

- [ ] **Step 2: Manually verify**

With both dev servers running, sign up or log in via the browser (so the Pinia store has a session — see the Global Constraints note: this must be a client-side navigation from signup/login, not a fresh hard reload of `/settings/profile`, since the session is in-memory only). Navigate to `http://localhost:3000/settings/profile`, change the name and bio, submit. Expected: redirected to `/@<username>` and the profile page (Task 12) now shows the updated name/bio. Go back to `/settings/profile` and click "Log out". Expected: redirected to `/login`, and a subsequent direct visit to `/settings/profile` redirects to `/login` (since `auth.user` is now null).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/pages/settings
git commit -m "feat: add edit profile page with logout"
```

---

## Done when

- A new user can sign up at `/signup`, get redirected to their own `/@username` profile page.
- The same user can log out from `/settings/profile`, then log back in at `/login`.
- The user can edit their name and bio at `/settings/profile` and see the change reflected on their public profile page.
- `GET /users/:username` is publicly viewable by anyone, logged in or not.
- `pnpm test` (root) passes, including the new `apps/api` unit tests (`UsersService`, `AuthService`, `LocalStrategy`, `JwtStrategy`), the new `apps/api` e2e tests (`auth`, `users`), and the new `apps/web`/`packages/shared` unit tests (Zod schemas, Pinia store, `useApi`).
- `pnpm build` (root) passes.
- Manual rate-limit check (Task 6, Step 7) confirms signup throttles after 5 requests/minute.
