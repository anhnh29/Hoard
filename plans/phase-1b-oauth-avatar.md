# Phase 1b — Google OAuth & Cloudinary Avatar Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users sign up/log in with Google (account auto-linked by email if a password account already exists) and upload a real avatar image via Cloudinary on the edit-profile page.

**Architecture:** `apps/api` owns every auth route, including the new Google OAuth redirect/callback pair, consistent with Phase 1a's `/auth/*` routes. Passport's `GoogleStrategy` finds-or-creates a `User` by email and issues the same JWT access/refresh token pair as the password flow; the callback redirects the browser back to a frontend landing page carrying the tokens in the URL fragment (never sent to any server, unlike a query string) so the existing in-memory Pinia session can be set up exactly like the password flow does today. Avatar upload is a signed direct-to-Cloudinary upload: the backend computes a Cloudinary upload signature (HMAC-style SHA-1 over the params, per Cloudinary's documented algorithm) using only Node's built-in `crypto`/`URL` — no Cloudinary SDK dependency — and the frontend uploads the file directly to Cloudinary's REST endpoint, then PATCHes the resulting URL onto the user's profile via the existing `PATCH /users/me` route.

**Tech Stack:** `passport-google-oauth20` (NestJS/Passport, already-installed `@nestjs/passport`), `dotenv` (new — see Task 1), Cloudinary's REST upload API called directly via `fetch`/`$fetch` (no Cloudinary npm SDK).

## Global Constraints

- `apps/api` may ONLY `import type { ... } from '@hoard/shared'` — never a runtime value (Zod schema/function). `@hoard/shared` is ESM (`"type": "module"`) and `apps/api` is CommonJS; a non-type-only import compiles to a `require()` call that throws `ERR_REQUIRE_ESM` at runtime.
- New required env vars for `apps/api` (all read via `process.env.X`, now actually loaded from `.env` thanks to Task 1): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` (set to `http://localhost:3001/auth/google/callback` for local dev — this exact URI must be registered as an Authorized redirect URI on the Google Cloud OAuth Client), `CLOUDINARY_URL` (format `cloudinary://<api_key>:<api_secret>@<cloud_name>`, as provided by the Cloudinary dashboard).
- Throttle limits on the two new Google routes (`GET /auth/google`, `GET /auth/google/callback`): 20/min each, matching the existing `/auth/refresh` tier (Phase 1a) since these are browser-navigation-driven, not scripted API calls.
- Account linking is by **email only** — there is no `googleId` column. If a `User` row already exists for the Google account's verified email (whether or not it has a `passwordHash`), that row is treated as the same identity; no new row is created and no error is thrown. This is a deliberate MVP simplification: Google verifies the email's ownership, so an email match is sufficient proof of identity without extra schema.
- No domain data leakage: the existing `AuthUser`/`PublicProfile` shapes (from Phase 1a) are unchanged — Google login still returns/sets an `AuthUser` (no `passwordHash`/`hashedRefreshToken` ever leave the backend).
- The OAuth callback hands off tokens to the frontend via the URL **fragment** (`#accessToken=...&user=...`), not a query string — fragments are never sent to any server (not even ours, on the next request) and don't appear in server access logs or `Referer` headers, unlike query parameters.
- Test policy carried over from Phase 1a: services/strategies get unit tests; routes that can be exercised without external services get e2e tests; the actual Google consent-screen exchange and a real Cloudinary upload are verified **manually** during the relevant task (full browser/real-account interaction isn't something an automated test can drive in this repo).

---

### Task 1: Load `.env` for `apps/api` via `dotenv`

**Context:** Every `process.env.X` read in `apps/api` (JWT secrets, `WEB_ORIGIN`, and the new Google/Cloudinary vars this plan adds) is currently `undefined` unless manually exported in the shell — `apps/api/.env` is never actually loaded by anything except Prisma's own internal handling of `DATABASE_URL`. This was a latent gap in Phase 1a (masked because earlier manual verifications happened to have the vars exported, or weren't checked from a clean shell) and it would silently break every task in this plan, since `GOOGLE_CLIENT_ID`/`CLOUDINARY_URL` would never be readable. Fix it first.

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/main.ts`

**Interfaces:**
- Produces: every subsequent task in this plan can assume `process.env.X` reflects the contents of `apps/api/.env` when the app is started via `nest start`/`nest start --watch`/`node dist/main`.

- [ ] **Step 1: Reproduce the bug**

Run (from the repo root, in a fresh shell with no env vars exported):
```bash
pnpm --filter @hoard/api start:dev
```
Expected: the process crashes on startup with `TypeError: JwtStrategy requires a secret or key` (because `JWT_ACCESS_SECRET` is `undefined`). Stop the process (Ctrl-C) once you've confirmed this.

- [ ] **Step 2: Add the `dotenv` dependency**

```bash
pnpm --filter @hoard/api add dotenv@^17.4.2
```

- [ ] **Step 3: Load it at the top of `main.ts`**

```ts
import 'dotenv/config';
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

- [ ] **Step 4: Verify the fix**

Run (same fresh-shell conditions as Step 1):
```bash
pnpm --filter @hoard/api start:dev
```
Expected: the app starts cleanly (no crash), logging the full Nest bootstrap sequence. Confirm with (in another terminal, once it's up):
```bash
curl -s -X POST http://localhost:3001/auth/signup -H "Content-Type: application/json" \
  -d '{"email":"dotenv-check@example.com","password":"password123","name":"Dotenv Check","username":"dotenvcheck"}'
```
Expected: a `201`-shaped JSON body with `user`/`accessToken` fields (not a 500). Stop the dev server afterward and confirm with `lsof -i :3001` that it actually stopped (empty output).

- [ ] **Step 5: Run the existing test suites to confirm no regression**

```bash
pnpm --filter @hoard/api test
pnpm --filter @hoard/api test:e2e
```
Expected: all suites still pass (unaffected — they set their own `process.env.X` fallbacks in `beforeAll`, independent of `.env`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/src/main.ts pnpm-lock.yaml
git commit -m "fix: load apps/api/.env via dotenv at startup"
```

---

### Task 2: Backend support for `avatarUrl` on `PATCH /users/me`

**Files:**
- Modify: `packages/shared/src/user.ts`
- Modify: `packages/shared/src/user.test.ts`
- Modify: `apps/api/src/users/dto/update-profile.dto.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.service.spec.ts`
- Modify: `apps/api/test/users.e2e-spec.ts`

**Interfaces:**
- Consumes: existing `updateProfileSchema` (`packages/shared/src/user.ts`), existing `UpdateProfileDto`/`UsersService.updateProfile` (`apps/api/src/users/`).
- Produces: `updateProfileSchema` and `UpdateProfileDto` both accept an optional `avatarUrl: string` (must be a valid URL); `UsersService.updateProfile`'s input type accepts `avatarUrl?: string` and passes it straight through to Prisma (no other behavior changes — this task only widens the existing pass-through). Later tasks (4, 5) rely on `PATCH /users/me` accepting `{ avatarUrl: string }`.

- [ ] **Step 1: Write the failing shared-schema tests**

Add to `packages/shared/src/user.test.ts`, inside the existing `describe('updateProfileSchema', ...)` block. Note the "accepts" test asserts the parsed *value*, not just `result.success` — the current schema silently strips unknown keys rather than rejecting them, so a `result.success`-only assertion would pass even before this task's fix and wouldn't prove anything:
```ts
  it('accepts an avatarUrl', () => {
    const result = updateProfileSchema.safeParse({
      avatarUrl: 'https://res.cloudinary.com/demo/image/upload/v1/avatar.png',
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.avatarUrl).toBe(
      'https://res.cloudinary.com/demo/image/upload/v1/avatar.png',
    );
  });

  it('rejects a non-URL avatarUrl', () => {
    const result = updateProfileSchema.safeParse({ avatarUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hoard/shared test`
Expected: FAIL on both new tests — the "accepts" test fails because `result.data.avatarUrl` is `undefined` (the current schema doesn't define `avatarUrl`, so it's stripped from the parsed output); the "rejects" test fails because `result.success` is `true` (an unknown key doesn't cause `z.object` to fail by default — only a key the schema actually validates can reject a bad value).

- [ ] **Step 3: Update the schema**

In `packages/shared/src/user.ts`, replace:
```ts
export const updateProfileSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  bio: z.string().max(280).nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
```
with:
```ts
export const updateProfileSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  bio: z.string().max(280).nullable().optional(),
  avatarUrl: z.string().url().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
```

- [ ] **Step 4: Rebuild shared and run its tests**

```bash
pnpm --filter @hoard/shared build
pnpm --filter @hoard/shared test
```
Expected: PASS (both new tests, plus all 13 pre-existing ones).

- [ ] **Step 5: Write the failing DTO/service tests**

Add to `apps/api/src/users/users.service.spec.ts`, after the existing `updateProfile()` test:
```ts
  it('updateProfile() updates avatarUrl', async () => {
    prismaMock.user.update.mockResolvedValue({ id: '1' });
    await service.updateProfile('1', { avatarUrl: 'https://example.com/a.png' });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { avatarUrl: 'https://example.com/a.png' },
    });
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @hoard/api test`
Expected: FAIL with a TypeScript error — `Object literal may only specify known properties, and 'avatarUrl' does not exist in type 'UpdateProfileInput'`.

- [ ] **Step 7: Widen the DTO and service input type**

In `apps/api/src/users/dto/update-profile.dto.ts`, replace the whole file with:
```ts
import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

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

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}
```

In `apps/api/src/users/users.service.ts`, replace:
```ts
interface UpdateProfileInput {
  name?: string;
  bio?: string | null;
}
```
with:
```ts
interface UpdateProfileInput {
  name?: string;
  bio?: string | null;
  avatarUrl?: string;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter @hoard/api test`
Expected: PASS, all suites.

- [ ] **Step 9: Add an e2e test for the full round-trip**

Add to `apps/api/test/users.e2e-spec.ts`, after the existing `'PATCH /users/me updates the current user...'` test:
```ts
  it('PATCH /users/me updates avatarUrl', async () => {
    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ avatarUrl: 'https://res.cloudinary.com/demo/image/upload/v1/avatar.png' })
      .expect(200);

    expect(res.body.avatarUrl).toBe('https://res.cloudinary.com/demo/image/upload/v1/avatar.png');
  });
```

- [ ] **Step 10: Run the e2e suite**

Run: `pnpm --filter @hoard/api test:e2e`
Expected: PASS, all suites (Postgres must be running — `docker compose ps` from the repo root; container should already be up on host port 5434 from earlier phases).

- [ ] **Step 11: Commit**

```bash
git add packages/shared/src/user.ts packages/shared/src/user.test.ts \
  apps/api/src/users/dto/update-profile.dto.ts apps/api/src/users/users.service.ts \
  apps/api/src/users/users.service.spec.ts apps/api/test/users.e2e-spec.ts
git commit -m "feat: accept avatarUrl on PATCH /users/me"
```

---

### Task 3: `CloudinaryService` — signed upload parameter generation

**Context:** No Cloudinary SDK is added. Cloudinary's signing algorithm is public and stable: sort the params-to-sign alphabetically by key, join as `key=value&key=value`, append the API secret directly (no separator), then SHA-1-hash the result (hex). `CLOUDINARY_URL` has the form `cloudinary://<api_key>:<api_secret>@<cloud_name>` — Node's built-in `URL` parses this generically (verified: `new URL('cloudinary://key:secret@cloud').username/.password/.hostname` give exactly the three parts).

**Files:**
- Create: `apps/api/src/cloudinary/cloudinary.service.ts`
- Create: `apps/api/src/cloudinary/cloudinary.service.spec.ts`
- Create: `apps/api/src/cloudinary/cloudinary.module.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Produces: `CloudinaryService.generateSignedUploadParams(folder: string): SignedUploadParams` where `SignedUploadParams = { timestamp: number; signature: string; apiKey: string; cloudName: string; folder: string }`. `CloudinaryModule` exports `CloudinaryService`. Task 4 imports `CloudinaryModule` into `UsersModule` and calls this method.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/cloudinary/cloudinary.service.spec.ts`:
```ts
import { createHash } from 'crypto';
import { CloudinaryService } from './cloudinary.service';

describe('CloudinaryService', () => {
  let service: CloudinaryService;

  beforeEach(() => {
    process.env.CLOUDINARY_URL = 'cloudinary://test-key:test-secret@test-cloud';
    service = new CloudinaryService();
  });

  it('returns the api key, cloud name, and folder from CLOUDINARY_URL', () => {
    const result = service.generateSignedUploadParams('avatars');
    expect(result.apiKey).toBe('test-key');
    expect(result.cloudName).toBe('test-cloud');
    expect(result.folder).toBe('avatars');
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it('returns a signature matching Cloudinary\'s documented signing algorithm', () => {
    const result = service.generateSignedUploadParams('avatars');
    const expectedSignedString = `folder=avatars&timestamp=${result.timestamp}test-secret`;
    const expectedSignature = createHash('sha1').update(expectedSignedString).digest('hex');
    expect(result.signature).toBe(expectedSignature);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hoard/api test cloudinary`
Expected: FAIL — `Cannot find module './cloudinary.service'`.

- [ ] **Step 3: Implement `CloudinaryService`**

Create `apps/api/src/cloudinary/cloudinary.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export interface SignedUploadParams {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
}

@Injectable()
export class CloudinaryService {
  generateSignedUploadParams(folder: string): SignedUploadParams {
    const { username: apiKey, password: apiSecret, hostname: cloudName } = new URL(
      process.env.CLOUDINARY_URL as string,
    );
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.sign({ folder, timestamp }, apiSecret);
    return { timestamp, signature, apiKey, cloudName, folder };
  }

  private sign(params: Record<string, string | number>, apiSecret: string): string {
    const sorted = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');
    return createHash('sha1').update(sorted + apiSecret).digest('hex');
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @hoard/api test cloudinary`
Expected: PASS, 2/2.

- [ ] **Step 5: Create the module**

Create `apps/api/src/cloudinary/cloudinary.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';

@Module({
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
```

- [ ] **Step 6: Document the new env var**

Append to `apps/api/.env.example`:
```
CLOUDINARY_URL="cloudinary://<api_key>:<api_secret>@<cloud_name>"
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/cloudinary apps/api/.env.example
git commit -m "feat: add CloudinaryService for signed avatar upload params"
```

---

### Task 4: `GET /users/me/avatar-upload-signature`

**Files:**
- Modify: `apps/api/src/users/users.module.ts`
- Modify: `apps/api/src/users/users.controller.ts`
- Modify: `apps/api/test/users.e2e-spec.ts`

**Interfaces:**
- Consumes: `CloudinaryService.generateSignedUploadParams(folder: string): SignedUploadParams` (Task 3).
- Produces: `GET /users/me/avatar-upload-signature` (auth-guarded) returns `SignedUploadParams` JSON. Task 5 (frontend) calls this route by name.

- [ ] **Step 1: Wire `CloudinaryModule` into `UsersModule`**

Replace `apps/api/src/users/users.module.ts` with:
```ts
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [CloudinaryModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 2: Write the failing e2e test**

Add to `apps/api/test/users.e2e-spec.ts`, inside `beforeAll` (right after the existing two `process.env.JWT_*` lines), add the Cloudinary fallback (this route's controller calls `CloudinaryService`, which reads `CLOUDINARY_URL` lazily — only needed for this file's new test, but harmless to set unconditionally):
```ts
    process.env.CLOUDINARY_URL ??= 'cloudinary://test-key:test-secret@test-cloud';
```
Then add a new test, after the existing `'PATCH /users/me updates avatarUrl'` test:
```ts
  it('GET /users/me/avatar-upload-signature returns signed Cloudinary upload params', async () => {
    await request(app.getHttpServer()).get('/users/me/avatar-upload-signature').expect(401);

    const res = await request(app.getHttpServer())
      .get('/users/me/avatar-upload-signature')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toEqual({
      timestamp: expect.any(Number),
      signature: expect.any(String),
      apiKey: 'test-key',
      cloudName: 'test-cloud',
      folder: 'avatars',
    });
  });
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @hoard/api test:e2e`
Expected: FAIL — `404 Not Found` (route doesn't exist yet).

- [ ] **Step 4: Add the route**

In `apps/api/src/users/users.controller.ts`, update the imports and constructor, and add the new route. Replace the whole file with:
```ts
import { Body, Controller, Get, NotFoundException, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser, PublicProfile } from '@hoard/shared';
import { UsersService } from './users.service';
import { toPublicProfile } from './users.mapper';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import type { SignedUploadParams } from '../cloudinary/cloudinary.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Get(':username')
  async getByUsername(@Param('username') username: string): Promise<PublicProfile> {
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicProfile(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/avatar-upload-signature')
  getAvatarUploadSignature(): SignedUploadParams {
    return this.cloudinaryService.generateSignedUploadParams('avatars');
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

- [ ] **Step 5: Run the e2e suite to verify it passes**

Run: `pnpm --filter @hoard/api test:e2e`
Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/users/users.module.ts apps/api/src/users/users.controller.ts apps/api/test/users.e2e-spec.ts
git commit -m "feat: add GET /users/me/avatar-upload-signature"
```

---

### Task 5: Avatar upload UI on the edit-profile page

**Files:**
- Modify: `apps/web/app/pages/settings/profile.vue`

**Interfaces:**
- Consumes: `useApi<T>(apiBase, path, accessToken, onRefresh, options?)` (Phase 1a, `apps/web/app/composables/useApi.ts`), `GET /users/me/avatar-upload-signature` → `SignedUploadParams` (Task 4), `PATCH /users/me` accepting `{ avatarUrl: string }` (Task 2).

- [ ] **Step 1: Add the upload handler and template**

Replace `apps/web/app/pages/settings/profile.vue` with:
```vue
<script setup lang="ts">
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { updateProfileSchema } from '@hoard/shared';
import type { PublicProfile } from '@hoard/shared';

interface SignedUploadParams {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
}

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

const avatarUrl = ref<string | null>(null);
const avatarUploading = ref(false);
const avatarError = ref<string | null>(null);

async function onAvatarSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  avatarError.value = null;
  avatarUploading.value = true;
  try {
    const params = await useApi<SignedUploadParams>(
      config.public.apiBase,
      '/users/me/avatar-upload-signature',
      auth.accessToken,
      () => auth.refreshAccessToken(config.public.apiBase),
    );

    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', params.apiKey);
    formData.append('timestamp', String(params.timestamp));
    formData.append('signature', params.signature);
    formData.append('folder', params.folder);

    const uploadResult = await $fetch<{ secure_url: string }>(
      `https://api.cloudinary.com/v1_1/${params.cloudName}/image/upload`,
      { method: 'POST', body: formData },
    );

    const updated = await useApi<PublicProfile>(
      config.public.apiBase,
      '/users/me',
      auth.accessToken,
      () => auth.refreshAccessToken(config.public.apiBase),
      { method: 'PATCH', body: { avatarUrl: uploadResult.secure_url } },
    );
    avatarUrl.value = updated.avatarUrl;
  } catch {
    avatarError.value = 'Could not upload your avatar. Try again.';
  } finally {
    avatarUploading.value = false;
  }
}

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
  <div>
    <h2>Avatar</h2>
    <img v-if="avatarUrl" :src="avatarUrl" alt="Avatar preview" width="96" height="96" />
    <input type="file" accept="image/*" :disabled="avatarUploading" @change="onAvatarSelected" />
    <p v-if="avatarUploading">Uploading...</p>
    <p v-if="avatarError">{{ avatarError }}</p>
  </div>

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

- [ ] **Step 2: Manually verify against the real Cloudinary account**

Start Postgres if needed (`docker compose ps` from the repo root), then start both apps:
```bash
pnpm dev
```

Create a tiny valid test image (a 1x1 transparent PNG) and sign up a fresh test user:
```bash
node -e "require('fs').writeFileSync('/tmp/test-avatar.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))"

curl -s -X POST http://localhost:3001/auth/signup -H "Content-Type: application/json" \
  -d '{"email":"avatar-check@example.com","password":"password123","name":"Avatar Check","username":"avatarcheck"}' \
  | tee /tmp/signup-result.json
```

Extract the access token and fetch a real signature from the running API:
```bash
ACCESS_TOKEN=$(node -e "console.log(require('/tmp/signup-result.json').accessToken)")
curl -s http://localhost:3001/users/me/avatar-upload-signature -H "Authorization: Bearer $ACCESS_TOKEN" | tee /tmp/sig-result.json
```

Upload directly to Cloudinary using those exact signed params (this hits your real Cloudinary account):
```bash
CLOUD_NAME=$(node -e "console.log(require('/tmp/sig-result.json').cloudName)")
API_KEY=$(node -e "console.log(require('/tmp/sig-result.json').apiKey)")
TIMESTAMP=$(node -e "console.log(require('/tmp/sig-result.json').timestamp)")
SIGNATURE=$(node -e "console.log(require('/tmp/sig-result.json').signature)")

curl -s -X POST "https://api.cloudinary.com/v1_1/$CLOUD_NAME/image/upload" \
  -F "file=@/tmp/test-avatar.png" -F "api_key=$API_KEY" -F "timestamp=$TIMESTAMP" \
  -F "signature=$SIGNATURE" -F "folder=avatars" | tee /tmp/upload-result.json
```
Expected: a 200 response with a `secure_url` pointing at `res.cloudinary.com`.

Patch it onto the profile and confirm it round-trips:
```bash
AVATAR_URL=$(node -e "console.log(require('/tmp/upload-result.json').secure_url)")
curl -s -X PATCH http://localhost:3001/users/me -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" -d "{\"avatarUrl\":\"$AVATAR_URL\"}"
curl -s http://localhost:3001/users/avatarcheck
```
Expected: both responses show the same `avatarUrl`.

Then load `http://localhost:3000/settings/profile` in a browser (after logging in as `avatar-check@example.com`/`password123` at `/login`) and confirm the file input and "Avatar" heading render, and that selecting the same `/tmp/test-avatar.png` file through the UI shows the uploaded image preview.

Stop the dev servers afterward and confirm with `lsof -i :3000 -i :3001` that nothing is left listening.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/pages/settings/profile.vue
git commit -m "feat: add avatar upload to the edit profile page"
```

---

### Task 6: `UsersService` — nullable password + unique-username generation for Google signups

**Files:**
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Produces: `UsersService.create`'s input type now accepts `passwordHash?: string | null` (was required `string`); new method `UsersService.generateUniqueUsernameFromEmail(email: string): Promise<string>`. Task 7 (`AuthService.findOrCreateGoogleUser`) calls both.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/users/users.service.spec.ts`, after the existing `create()` test:
```ts
  it('create() allows a null passwordHash (for Google-originated accounts)', async () => {
    const input = { email: 'a@b.com', passwordHash: null, name: 'Alice', username: 'alice' };
    prismaMock.user.create.mockResolvedValue({ id: '1', ...input });

    await service.create(input);

    expect(prismaMock.user.create).toHaveBeenCalledWith({ data: input });
  });
```
And at the end of the file, before the closing `});` of the outer `describe('UsersService', ...)` block:
```ts
  describe('generateUniqueUsernameFromEmail', () => {
    it('sanitizes the email local part into a lowercase username', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      const result = await service.generateUniqueUsernameFromEmail('Alice.Smith+test@example.com');
      expect(result).toBe('alicesmithtest');
    });

    it('appends a numeric suffix on collision', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'existing' }).mockResolvedValueOnce(null);
      const result = await service.generateUniqueUsernameFromEmail('alice@example.com');
      expect(result).toBe('alice1');
    });

    it('falls back to a "user"-prefixed name when the local part is too short', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      const result = await service.generateUniqueUsernameFromEmail('ab@example.com');
      expect(result).toBe('userab');
    });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hoard/api test users.service`
Expected: FAIL — `passwordHash: null` is a TypeScript error against `CreateUserInput`, and `generateUniqueUsernameFromEmail` doesn't exist on `UsersService`.

- [ ] **Step 3: Implement**

In `apps/api/src/users/users.service.ts`, replace the whole file with:
```ts
import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface CreateUserInput {
  email: string;
  passwordHash?: string | null;
  name: string;
  username: string;
}

interface UpdateProfileInput {
  name?: string;
  bio?: string | null;
  avatarUrl?: string;
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

  async generateUniqueUsernameFromEmail(email: string): Promise<string> {
    const localPart = email.split('@')[0]?.toLowerCase().replace(/[^a-z0-9_]/g, '') ?? '';
    const base = (localPart.length >= 3 ? localPart : `user${localPart}`).slice(0, 26);
    let candidate = base;
    let suffix = 0;
    while (await this.findByUsername(candidate)) {
      suffix += 1;
      candidate = `${base}${suffix}`.slice(0, 30);
    }
    return candidate;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @hoard/api test users.service`
Expected: PASS, all cases (the pre-existing `create()` test still passes since widening an interface to `passwordHash?: string | null` doesn't break callers passing a plain `string`).

- [ ] **Step 5: Run the full unit suite to confirm no regression**

Run: `pnpm --filter @hoard/api test`
Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/users/users.service.ts apps/api/src/users/users.service.spec.ts
git commit -m "feat: support nullable passwords and unique-username generation in UsersService"
```

---

### Task 7: `AuthService.findOrCreateGoogleUser`

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `UsersService.findByEmail`, `UsersService.create` (now accepts `passwordHash?: string | null`), `UsersService.generateUniqueUsernameFromEmail` (Task 6).
- Produces: `AuthService.findOrCreateGoogleUser(profile: { email: string; name: string }): Promise<AuthUser>`. Task 8 (`GoogleStrategy`) calls this.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/auth/auth.service.spec.ts`, add `generateUniqueUsernameFromEmail: jest.fn()` to the `usersServiceMock` object (so it reads):
```ts
  const usersServiceMock = {
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    setHashedRefreshToken: jest.fn(),
    generateUniqueUsernameFromEmail: jest.fn(),
  };
```
Then add a new `describe` block, after the existing `describe('logout', ...)` block, before the final closing `});`:
```ts
  describe('findOrCreateGoogleUser', () => {
    it('returns the existing user when the email already exists (account linking, no error)', async () => {
      usersServiceMock.findByEmail.mockResolvedValue(fakeUser);

      const result = await service.findOrCreateGoogleUser({ email: 'alice@example.com', name: 'Alice' });

      expect(result).toEqual({ id: 'u1', email: 'alice@example.com', username: 'alice', name: 'Alice' });
      expect(usersServiceMock.create).not.toHaveBeenCalled();
    });

    it('creates a new user with no password when the email is new', async () => {
      usersServiceMock.findByEmail.mockResolvedValue(null);
      usersServiceMock.generateUniqueUsernameFromEmail.mockResolvedValue('newgoogleuser');
      usersServiceMock.create.mockResolvedValue({
        ...fakeUser,
        id: 'u2',
        username: 'newgoogleuser',
        passwordHash: null,
      });

      const result = await service.findOrCreateGoogleUser({ email: 'new@example.com', name: 'New Person' });

      expect(usersServiceMock.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        passwordHash: null,
        name: 'New Person',
        username: 'newgoogleuser',
      });
      expect(result.username).toBe('newgoogleuser');
    });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hoard/api test auth.service`
Expected: FAIL — `service.findOrCreateGoogleUser is not a function`.

- [ ] **Step 3: Implement**

In `apps/api/src/auth/auth.service.ts`, add this method to the `AuthService` class, after `logout`:
```ts
  async findOrCreateGoogleUser(profile: { email: string; name: string }): Promise<AuthUser> {
    const existing = await this.usersService.findByEmail(profile.email);
    if (existing) {
      return toAuthUser(existing);
    }
    const username = await this.usersService.generateUniqueUsernameFromEmail(profile.email);
    const user = await this.usersService.create({
      email: profile.email,
      passwordHash: null,
      name: profile.name,
      username,
    });
    return toAuthUser(user);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @hoard/api test auth.service`
Expected: PASS, all cases.

- [ ] **Step 5: Run the full unit suite to confirm no regression**

Run: `pnpm --filter @hoard/api test`
Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts
git commit -m "feat: add AuthService.findOrCreateGoogleUser"
```

---

### Task 8: `GoogleStrategy` and `GoogleAuthGuard`

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/auth/google.strategy.ts`
- Create: `apps/api/src/auth/google.strategy.spec.ts`
- Create: `apps/api/src/auth/google-auth.guard.ts`
- Modify: `apps/api/src/auth/auth.module.ts`

**Interfaces:**
- Consumes: `AuthService.findOrCreateGoogleUser` (Task 7).
- Produces: `GoogleStrategy` registered under the Passport name `'google'`; `GoogleAuthGuard extends AuthGuard('google')`. Task 9 (`AuthController`) uses `GoogleAuthGuard` to guard the two new routes.

- [ ] **Step 1: Add dependencies**

```bash
pnpm --filter @hoard/api add passport-google-oauth20@^2.0.0
pnpm --filter @hoard/api add -D @types/passport-google-oauth20@^2.0.16
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/auth/google.strategy.spec.ts`:
```ts
import type { Profile } from 'passport-google-oauth20';
import { GoogleStrategy } from './google.strategy';
import { AuthService } from './auth.service';

describe('GoogleStrategy', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3001/auth/google/callback';
  });

  it('finds or creates a user from the Google profile and calls done with it', async () => {
    const authServiceMock = {
      findOrCreateGoogleUser: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'alice@example.com',
        username: 'alice',
        name: 'Alice',
      }),
    } as unknown as AuthService;
    const strategy = new GoogleStrategy(authServiceMock);
    const done = jest.fn();

    await strategy.validate(
      'access-token',
      'refresh-token',
      { emails: [{ value: 'alice@example.com' }], displayName: 'Alice' } as unknown as Profile,
      done,
    );

    expect(authServiceMock.findOrCreateGoogleUser).toHaveBeenCalledWith({
      email: 'alice@example.com',
      name: 'Alice',
    });
    expect(done).toHaveBeenCalledWith(null, {
      id: 'u1',
      email: 'alice@example.com',
      username: 'alice',
      name: 'Alice',
    });
  });

  it('calls done with an error when the Google profile has no email', async () => {
    const authServiceMock = { findOrCreateGoogleUser: jest.fn() } as unknown as AuthService;
    const strategy = new GoogleStrategy(authServiceMock);
    const done = jest.fn();

    await strategy.validate(
      'access-token',
      'refresh-token',
      { emails: [], displayName: 'Alice' } as unknown as Profile,
      done,
    );

    expect(authServiceMock.findOrCreateGoogleUser).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith(expect.any(Error), false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @hoard/api test google.strategy`
Expected: FAIL — `Cannot find module './google.strategy'`.

- [ ] **Step 4: Implement `GoogleStrategy`**

Create `apps/api/src/auth/google.strategy.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from './auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly authService: AuthService) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      callbackURL: process.env.GOOGLE_CALLBACK_URL as string,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('Google account has no email'), false);
      return;
    }
    const user = await this.authService.findOrCreateGoogleUser({
      email,
      name: profile.displayName,
    });
    done(null, user);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @hoard/api test google.strategy`
Expected: PASS, 2/2.

If you instead see a constructor error like `TypeError: OAuth2Strategy requires a clientID option`, it means the `process.env.GOOGLE_CLIENT_ID` etc. assignments in the test's `beforeEach` aren't taking effect before `new GoogleStrategy(...)` runs — double check the `beforeEach` block actually executes before each `it`.

- [ ] **Step 6: Create the guard**

Create `apps/api/src/auth/google-auth.guard.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {}
```

- [ ] **Step 7: Register the strategy in `AuthModule`**

In `apps/api/src/auth/auth.module.ts`, replace the whole file with:
```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { LocalStrategy } from './local.strategy';
import { JwtStrategy } from './jwt.strategy';
import { GoogleStrategy } from './google.strategy';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy, GoogleStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 8: Run the full unit suite to confirm no regression**

Run: `pnpm --filter @hoard/api test`
Expected: PASS, all suites.

- [ ] **Step 9: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/auth/google.strategy.ts \
  apps/api/src/auth/google.strategy.spec.ts apps/api/src/auth/google-auth.guard.ts \
  apps/api/src/auth/auth.module.ts
git commit -m "feat: add GoogleStrategy and GoogleAuthGuard"
```

---

### Task 9: `GET /auth/google` and `GET /auth/google/callback`

**Context:** `GoogleStrategy` is now a provider in `AuthModule`, which means its constructor runs (and validates `clientID`/`clientSecret`/`callbackURL` are present) every time `AppModule` is compiled — including in `auth.e2e-spec.ts` and `users.e2e-spec.ts`, neither of which previously needed any Google env vars. Both files' `beforeAll` blocks need fake test values added now, or `Test.createTestingModule({ imports: [AppModule] }).compile()` will throw before any test in either file runs.

**Files:**
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/test/auth.e2e-spec.ts`
- Modify: `apps/api/test/users.e2e-spec.ts`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/.env` (gitignored — not committed; add the real values you already have)

**Interfaces:**
- Consumes: `GoogleAuthGuard` (Task 8), `AuthService.login` (Phase 1a, reused as-is — same token issuance as the password flow).
- Produces: `GET /auth/google` (redirects to Google's consent screen), `GET /auth/google/callback` (redirects to `${WEB_ORIGIN}/oauth/callback#accessToken=...&user=...`). Task 10 (frontend) reads that fragment shape.

- [ ] **Step 1: Add the env-var fallbacks to both e2e spec files**

In `apps/api/test/auth.e2e-spec.ts`, inside `beforeAll`, right after the existing two `process.env.JWT_*` lines, add:
```ts
    process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
    process.env.GOOGLE_CALLBACK_URL ??= 'http://localhost:3001/auth/google/callback';
```
Do the same in `apps/api/test/users.e2e-spec.ts`'s `beforeAll`, right after its two `process.env.JWT_*` lines (before the `CLOUDINARY_URL` line Task 4 already added there).

- [ ] **Step 2: Write the failing e2e test**

Add to `apps/api/test/auth.e2e-spec.ts`, after the existing `'rejects /me without a token'` test:
```ts
  it('GET /auth/google redirects to Google\'s OAuth consent screen', async () => {
    const res = await request(app.getHttpServer()).get('/auth/google').expect(302);
    expect(res.headers.location).toContain('accounts.google.com');
  });
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @hoard/api test:e2e`
Expected: FAIL — `404 Not Found` (route doesn't exist yet).

- [ ] **Step 4: Add the routes**

In `apps/api/src/auth/auth.controller.ts`, add the `GoogleAuthGuard` import and the two new routes. Replace the whole file with:
```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthUser } from '@hoard/shared';
import { AuthService, REFRESH_TOKEN_TTL_MS } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleAuthGuard } from './google-auth.guard';
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

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  googleAuth() {}

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(@Req() req: Request & { user: AuthUser }, @Res() res: Response) {
    const tokens = await this.authService.login(req.user);
    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    const userParam = encodeURIComponent(JSON.stringify(req.user));
    res.redirect(`${webOrigin}/oauth/callback#accessToken=${tokens.accessToken}&user=${userParam}`);
  }
}
```

- [ ] **Step 5: Run the e2e suite to verify it passes**

Run: `pnpm --filter @hoard/api test:e2e`
Expected: PASS, all suites.

- [ ] **Step 6: Document the new env vars**

Append to `apps/api/.env.example`:
```
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_CALLBACK_URL="http://localhost:3001/auth/google/callback"
```
Confirm `apps/api/.env` (gitignored, not part of this commit) already has the real `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`CLOUDINARY_URL` values, and add `GOOGLE_CALLBACK_URL="http://localhost:3001/auth/google/callback"` to it if it's not already there.

- [ ] **Step 7: Manually verify the full redirect against the real Google Cloud OAuth client**

Start Postgres if needed, then `pnpm dev` from the repo root. Open `http://localhost:3001/auth/google` directly in a browser (not curl — the consent screen requires real browser interaction) and confirm it redirects to Google's real consent screen for the configured OAuth client. Stop here without completing the Google login (Task 10 builds the page that receives the callback) — just confirm the redirect target looks correct (the client ID and `redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fauth%2Fgoogle%2Fcallback` should appear in the URL). Stop the dev servers afterward and confirm with `lsof -i :3000 -i :3001` that nothing is left listening.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/auth/auth.controller.ts apps/api/test/auth.e2e-spec.ts \
  apps/api/test/users.e2e-spec.ts apps/api/.env.example
git commit -m "feat: add GET /auth/google and /auth/google/callback"
```

---

### Task 10: Frontend OAuth callback page + "Continue with Google" links

**Files:**
- Create: `apps/web/app/pages/oauth/callback.vue`
- Modify: `apps/web/app/pages/login.vue`
- Modify: `apps/web/app/pages/signup.vue`

**Interfaces:**
- Consumes: `useAuthStore().setSession(user, accessToken)` (Phase 1a), the `#accessToken=...&user=...` redirect shape produced by `GET /auth/google/callback` (Task 9).

- [ ] **Step 1: Create the callback page**

Create `apps/web/app/pages/oauth/callback.vue`:
```vue
<script setup lang="ts">
import type { AuthUser } from '@hoard/shared';

const auth = useAuthStore();
const router = useRouter();
const errorMessage = ref<string | null>(null);

onMounted(async () => {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(hash);
  const accessToken = params.get('accessToken');
  const userParam = params.get('user');

  if (!accessToken || !userParam) {
    errorMessage.value = 'Google sign-in failed. Please try again.';
    return;
  }

  const user = JSON.parse(userParam) as AuthUser;
  auth.setSession(user, accessToken);
  await router.push(`/@${user.username}`);
});
</script>

<template>
  <p v-if="errorMessage">{{ errorMessage }}</p>
  <p v-else>Signing you in...</p>
</template>
```

- [ ] **Step 2: Add the link to `login.vue`**

In `apps/web/app/pages/login.vue`, change the template's closing to add a link right after `</form>`:
```html
    <p v-if="submitError">{{ submitError }}</p>
    <button type="submit">Log in</button>
  </form>
  <a :href="`${config.public.apiBase}/auth/google`">Continue with Google</a>
</template>
```

- [ ] **Step 3: Add the link to `signup.vue`**

In `apps/web/app/pages/signup.vue`, change the template's closing the same way:
```html
    <p v-if="submitError">{{ submitError }}</p>
    <button type="submit">Create account</button>
  </form>
  <a :href="`${config.public.apiBase}/auth/google`">Continue with Google</a>
</template>
```

- [ ] **Step 4: Manually verify the complete flow end to end**

Start Postgres if needed, then `pnpm dev` from the repo root. In a browser, go to `http://localhost:3000/login`, click "Continue with Google", complete a real Google sign-in (use an account whose email isn't already a Hoard user, to exercise the create-new-user path). Confirm:
- You land on `/@<some-generated-username>` and the page shows your Google name.
- Run `curl http://localhost:3001/users/<that-username>` and confirm the response has the right `name` and a `null` `bio`/`avatarUrl` (since this is a brand-new account).

Then log out, and repeat the Google sign-in with the **same** Google account a second time. Confirm:
- You land on the same `/@<username>` (no duplicate account was created — exercises the find-by-email linking path).

Then, with a Hoard account you already created via email/password (e.g. `avatar-check@example.com` from Task 5, if that Google account's email matches — otherwise sign up a new password account first with an email that matches a Google account you control), click "Continue with Google" using that same email. Confirm:
- You're logged into the *existing* password account (same username as before), not a new one — exercises the linking-an-existing-password-account path explicitly required by this plan's scope.

Stop the dev servers afterward and confirm with `lsof -i :3000 -i :3001` that nothing is left listening.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/pages/oauth/callback.vue apps/web/app/pages/login.vue apps/web/app/pages/signup.vue
git commit -m "feat: add Google OAuth callback page and sign-in links"
```

---

## Done When

- A user can click "Continue with Google" from `/login` or `/signup`, complete Google's consent screen, and land on their profile page fully signed in (same session shape as the password flow).
- Signing in with Google a second time, or with a Google account whose email matches an existing password account, never creates a duplicate `User` row.
- A logged-in user can upload an image on `/settings/profile` and see it appear as their `avatarUrl` on their public profile page.
- All unit and e2e suites pass (`pnpm test` from the repo root, plus `pnpm --filter @hoard/api test:e2e`).
