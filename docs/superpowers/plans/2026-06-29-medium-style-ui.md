# Medium-Style UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire `apps/web` frontend (currently bare, unstyled HTML) to look like medium.com, using Tailwind CSS and hand-built components.

**Architecture:** Pure presentation-layer change. Install Tailwind v4 + a serif/sans font pair, build a small shared component library (`app/components/ui/`), build one global nav layout, then restyle each existing page in place using those components. No backend/API/schema changes.

**Tech Stack:** Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first `@theme` config — no `tailwind.config.js`), `@nuxt/fonts` for self-hosted Google Fonts (Source Serif 4, Inter), Vue 3.5 `<script setup>` + `defineModel`, Vitest + `@vue/test-utils` for shared components, manual Playwright verification for pages.

Full design rationale: `docs/superpowers/specs/2026-06-29-medium-style-ui-design.md`.

## Global Constraints

- No backend, API, or Prisma schema changes — every task touches only `apps/web` (and `apps/web/package.json`/`pnpm-lock.yaml` for new dependencies).
- Styling is Tailwind CSS only. Do not add Nuxt UI or any other component library.
- Color tokens (define once in Task 1, use everywhere): background `#FFFFFF`, primary text `#242424` (`text-ink`), secondary/metadata text `#6B6B6B` (`text-ink-light`), accent `#1A8917` (`bg-accent`/`text-accent`/`border-accent`), hairline borders `#E5E5E5` (`border-border`).
- Typography split (define once in Task 2, use everywhere): **Source Serif 4** for article titles and article body content only (`font-serif`); **Inter** for absolutely everything else, including page headings outside article content (`font-sans`, also the global default body font).
- Article reading column max-width is `680px` (use the literal Tailwind arbitrary value `max-w-[680px]`, not a new theme token — it's used in only two places).
- Buttons are pill-shaped (`rounded-full`); inputs, textareas, and cards use a small `rounded-md` (~6px) radius; avatars are fully circular.
- Out of scope, do not build: dark mode, a search bar, notifications, a site footer, an avatar dropdown menu. `apps/web/app/pages/health.vue` is not touched by this plan at all.
- This codebase explicitly imports components rather than relying on Nuxt's auto-import (see `apps/web/app/pages/write/[id].vue:2`, `import ArticleEditor from '~/components/editor/ArticleEditor.vue';`). Follow this convention for every new shared component: always write an explicit `import X from '~/components/ui/X.vue';` line, even though Nuxt would auto-import it.
- Test policy: shared atomic components (Task 3–5) get real Vitest + `@vue/test-utils` render tests, matching the existing test style in `apps/web/app/stores/auth.test.ts` and `apps/web/app/composables/useArticleAutosave.test.ts` (explicit `import { describe, it, expect } from 'vitest'`, no global test functions). Page-restyle tasks (Task 8 onward) are markup/CSS changes with no new business logic — they get manual, real-browser Playwright verification instead of new unit tests, matching the project's established frontend test policy from Phase 2a/2b.
- Run `pnpm --filter @hoard/web test` after every task that touches a shared component, and `pnpm --filter @hoard/web build` after every task, to catch type errors and template mistakes immediately.

---

### Task 1: Install Tailwind CSS v4 and define color tokens

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/nuxt.config.ts`
- Create: `apps/web/app/assets/css/main.css`

**Interfaces:**
- Produces: CSS custom properties `--color-ink`, `--color-ink-light`, `--color-accent`, `--color-border` (and the Tailwind utilities they generate: `text-ink`, `bg-ink`, `text-ink-light`, `bg-accent`, `text-accent`, `border-accent`, `border-border`, etc.) — every later task relies on these utility classes existing.

- [ ] **Step 1: Add Tailwind dependencies**

Edit `apps/web/package.json`, add to `"dependencies"` (alphabetical, matching existing style):

```json
    "@tailwindcss/vite": "^4.1.18",
    "tailwindcss": "^4.1.18",
```

So the `dependencies` block reads (only the new lines shown in context):

```json
  "dependencies": {
    "@hoard/shared": "workspace:*",
    "@pinia/nuxt": "^0.11.3",
    "@tailwindcss/vite": "^4.1.18",
    "@tiptap/extension-image": "^2.27.2",
    "@tiptap/extension-link": "^2.27.2",
    "@tiptap/html": "^2.27.2",
    "@tiptap/pm": "^2.27.2",
    "@tiptap/starter-kit": "^2.27.2",
    "@tiptap/vue-3": "^2.27.2",
    "@vee-validate/zod": "^4.15.1",
    "nuxt": "^4.4.8",
    "pinia": "^3.0.4",
    "tailwindcss": "^4.1.18",
    "vee-validate": "^4.15.1",
    "vue": "^3.5.35",
    "vue-router": "^5.1.0",
    "zod": "^4.4.3"
  },
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates, no errors. `apps/web/package.json` and `pnpm-lock.yaml` both change — both must be committed together at the end of this task.

- [ ] **Step 3: Wire the Vite plugin and CSS file into Nuxt**

Replace the full contents of `apps/web/nuxt.config.ts`:

```typescript
// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@pinia/nuxt'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? 'http://localhost:3001',
    },
  },
});
```

- [ ] **Step 4: Create the design tokens**

Create `apps/web/app/assets/css/main.css`:

```css
@import "tailwindcss";

@theme {
  --color-ink: #242424;
  --color-ink-light: #6b6b6b;
  --color-accent: #1a8917;
  --color-border: #e5e5e5;
}

body {
  background-color: #ffffff;
  color: var(--color-ink);
}
```

- [ ] **Step 5: Verify the tokens are live**

Run: `pnpm --filter @hoard/web build`
Expected: build succeeds with no Tailwind/Vite errors.

Run: `pnpm --filter @hoard/web dev` (or reuse an already-running dev server), then with Playwright navigate to `http://localhost:3000/login`.

Expected: even though `login.vue` has no Tailwind classes yet, the page background is white and the body text is the dark `#242424` ink color (not browser-default black/serif) — confirms the global `body` rule in `main.css` is actually being applied. Check via `mcp__playwright__browser_evaluate`:

```javascript
() => getComputedStyle(document.body).color
```

Expected result: `"rgb(36, 36, 36)"` (the rgb() form of `#242424`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/nuxt.config.ts apps/web/app/assets/css/main.css
git commit -m "feat: install Tailwind CSS v4 and define color tokens"
```

---

### Task 2: Add Source Serif 4 + Inter via @nuxt/fonts

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/nuxt.config.ts`
- Modify: `apps/web/app/assets/css/main.css`

**Interfaces:**
- Consumes: `@theme` block from Task 1 (`apps/web/app/assets/css/main.css`).
- Produces: CSS custom properties `--font-serif`, `--font-sans` (and the Tailwind utilities `font-serif`, `font-sans`) — every page-restyle task relies on these.

- [ ] **Step 1: Add the fonts module**

Edit `apps/web/package.json`, add to `"dependencies"`:

```json
    "@nuxt/fonts": "^0.11.4",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates, no errors.

- [ ] **Step 3: Register the module and configure the exact font families**

Edit `apps/web/nuxt.config.ts` — add `'@nuxt/fonts'` to `modules` and add a `fonts` block:

```typescript
// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@pinia/nuxt', '@nuxt/fonts'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: {
    families: [
      { name: 'Source Serif 4', provider: 'google', weights: [400, 600, 700] },
      { name: 'Inter', provider: 'google', weights: [400, 500, 600, 700] },
    ],
  },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? 'http://localhost:3001',
    },
  },
});
```

- [ ] **Step 4: Wire the font tokens into the theme**

Edit `apps/web/app/assets/css/main.css`, add `--font-serif`/`--font-sans` to the existing `@theme` block and set the body's default font:

```css
@import "tailwindcss";

@theme {
  --color-ink: #242424;
  --color-ink-light: #6b6b6b;
  --color-accent: #1a8917;
  --color-border: #e5e5e5;
  --font-serif: "Source Serif 4", Georgia, serif;
  --font-sans: "Inter", system-ui, sans-serif;
}

body {
  background-color: #ffffff;
  color: var(--color-ink);
  font-family: var(--font-sans);
}
```

- [ ] **Step 5: Verify both fonts are actually being served**

Run: `pnpm --filter @hoard/web build`
Expected: succeeds with no errors.

With the dev server running, use Playwright to navigate to `http://localhost:3000/login`, then check network requests:

```javascript
// mcp__playwright__browser_network_requests, then inspect the list for font files
```

Expected: at least one `.woff2` request with a URL containing `Source-Serif` (or similar self-hosted font path `@nuxt/fonts` generates, e.g. under `/_fonts/`) and at least one containing `Inter`. Also confirm via `browser_evaluate`:

```javascript
() => getComputedStyle(document.body).fontFamily
```

Expected result: a string starting with `"Inter"`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/nuxt.config.ts apps/web/app/assets/css/main.css
git commit -m "feat: add Source Serif 4 and Inter via @nuxt/fonts"
```

---

### Task 3: Shared form primitives — Button, Input, Textarea

**Files:**
- Create: `apps/web/app/components/ui/Button.vue`
- Create: `apps/web/app/components/ui/Input.vue`
- Create: `apps/web/app/components/ui/Textarea.vue`
- Test: `apps/web/app/components/ui/Button.test.ts`
- Test: `apps/web/app/components/ui/Input.test.ts`

**Interfaces:**
- Consumes: `text-ink`, `text-ink-light`, `bg-accent`, `border-border`, `border-accent` utilities from Task 1.
- Produces:
  - `Button` props: `variant?: 'primary' | 'secondary' | 'text'` (default `'primary'`), `type?: 'button' | 'submit'` (default `'button'`); renders default slot as label.
  - `Input` props: `type?: string` (default `'text'`); uses `defineModel<string>()` for `v-model` — later pages bind `v-model="email"` etc. exactly as they do today against a native `<input>`.
  - `Textarea`: no props beyond native attrs; uses `defineModel<string>()`.

- [ ] **Step 1: Write the failing test for Button**

Create `apps/web/app/components/ui/Button.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Button from './Button.vue';

describe('Button', () => {
  it('renders slot content', () => {
    const wrapper = mount(Button, { slots: { default: 'Save' } });
    expect(wrapper.text()).toBe('Save');
  });

  it('defaults to type="button" and variant="primary" styling', () => {
    const wrapper = mount(Button, { slots: { default: 'Save' } });
    expect(wrapper.attributes('type')).toBe('button');
    expect(wrapper.classes()).toContain('bg-accent');
  });

  it('applies type="submit" when passed', () => {
    const wrapper = mount(Button, { props: { type: 'submit' }, slots: { default: 'Save' } });
    expect(wrapper.attributes('type')).toBe('submit');
  });

  it('applies secondary variant styling', () => {
    const wrapper = mount(Button, { props: { variant: 'secondary' }, slots: { default: 'Save' } });
    expect(wrapper.classes()).toContain('border-ink');
    expect(wrapper.classes()).not.toContain('bg-accent');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @hoard/web test -- Button`
Expected: FAIL — `Button.vue` does not exist.

- [ ] **Step 3: Implement Button**

Create `apps/web/app/components/ui/Button.vue`:

```vue
<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'primary' | 'secondary' | 'text'; type?: 'button' | 'submit' }>(), {
  variant: 'primary',
  type: 'button',
});
</script>

<template>
  <button
    :type="type"
    :class="[
      'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
      variant === 'primary' && 'bg-accent text-white hover:bg-accent/90',
      variant === 'secondary' && 'border border-ink text-ink hover:bg-neutral-50',
      variant === 'text' && 'text-ink-light hover:text-ink',
    ]"
  >
    <slot />
  </button>
</template>
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @hoard/web test -- Button`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing test for Input**

Create `apps/web/app/components/ui/Input.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Input from './Input.vue';

describe('Input', () => {
  it('defaults to type="text"', () => {
    const wrapper = mount(Input);
    expect(wrapper.attributes('type')).toBe('text');
  });

  it('applies the type prop', () => {
    const wrapper = mount(Input, { props: { type: 'email' } });
    expect(wrapper.attributes('type')).toBe('email');
  });

  it('supports v-model', async () => {
    const wrapper = mount(Input, {
      props: { modelValue: '', 'onUpdate:modelValue': (v: string) => wrapper.setProps({ modelValue: v }) },
    });
    await wrapper.find('input').setValue('hello@example.com');
    expect(wrapper.props('modelValue')).toBe('hello@example.com');
  });
});
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `pnpm --filter @hoard/web test -- Input`
Expected: FAIL — `Input.vue` does not exist.

- [ ] **Step 7: Implement Input and Textarea**

Create `apps/web/app/components/ui/Input.vue`:

```vue
<script setup lang="ts">
withDefaults(defineProps<{ type?: string }>(), { type: 'text' });
const model = defineModel<string>();
</script>

<template>
  <input
    v-model="model"
    :type="type"
    class="w-full rounded-md border border-border px-3 py-2 text-sm text-ink placeholder:text-ink-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
  />
</template>
```

Create `apps/web/app/components/ui/Textarea.vue`:

```vue
<script setup lang="ts">
const model = defineModel<string>();
</script>

<template>
  <textarea
    v-model="model"
    class="w-full rounded-md border border-border px-3 py-2 text-sm text-ink placeholder:text-ink-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
  />
</template>
```

- [ ] **Step 8: Run the tests to confirm they pass**

Run: `pnpm --filter @hoard/web test -- Input`
Expected: PASS, 3 tests.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/components/ui/Button.vue apps/web/app/components/ui/Button.test.ts apps/web/app/components/ui/Input.vue apps/web/app/components/ui/Input.test.ts apps/web/app/components/ui/Textarea.vue
git commit -m "feat: add shared Button, Input, Textarea components"
```

---

### Task 4: Shared atoms — Avatar, TagPill

**Files:**
- Create: `apps/web/app/components/ui/Avatar.vue`
- Create: `apps/web/app/components/ui/TagPill.vue`
- Test: `apps/web/app/components/ui/Avatar.test.ts`

**Interfaces:**
- Produces:
  - `Avatar` props: `src?: string | null`, `name: string` (required, used for the alt text and the initials fallback), `size?: number` (pixels, default `32`).
  - `TagPill` props: `name: string` (required); has a default slot for trailing content (e.g. a remove button), used by the tag picker in Task 13.

- [ ] **Step 1: Write the failing test for Avatar**

Create `apps/web/app/components/ui/Avatar.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Avatar from './Avatar.vue';

describe('Avatar', () => {
  it('renders an img when src is set', () => {
    const wrapper = mount(Avatar, { props: { src: 'https://example.com/a.jpg', name: 'Alice' } });
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/a.jpg');
    expect(img.attributes('alt')).toBe('Alice');
  });

  it('falls back to the first initial when src is missing', () => {
    const wrapper = mount(Avatar, { props: { name: 'Alice' } });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toBe('A');
  });

  it('falls back to the first initial when src is null', () => {
    const wrapper = mount(Avatar, { props: { src: null, name: 'bob' } });
    expect(wrapper.text()).toBe('B');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @hoard/web test -- Avatar`
Expected: FAIL — `Avatar.vue` does not exist.

- [ ] **Step 3: Implement Avatar**

Create `apps/web/app/components/ui/Avatar.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ src?: string | null; name: string; size?: number }>(), {
  src: null,
  size: 32,
});

const initial = computed(() => props.name.trim().charAt(0).toUpperCase() || '?');
const sizePx = computed(() => `${props.size}px`);
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="name"
    class="rounded-full object-cover"
    :style="{ width: sizePx, height: sizePx }"
  />
  <div
    v-else
    class="flex items-center justify-center rounded-full bg-border font-sans font-semibold text-ink-light"
    :style="{ width: sizePx, height: sizePx }"
  >
    {{ initial }}
  </div>
</template>
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @hoard/web test -- Avatar`
Expected: PASS, 3 tests.

- [ ] **Step 5: Implement TagPill (no test — pure markup, no logic to verify beyond what Vue itself guarantees)**

Create `apps/web/app/components/ui/TagPill.vue`:

```vue
<script setup lang="ts">
defineProps<{ name: string }>();
</script>

<template>
  <span class="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-ink-light">
    {{ name }}
    <slot />
  </span>
</template>
```

- [ ] **Step 6: Verify the build still succeeds**

Run: `pnpm --filter @hoard/web build`
Expected: succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/components/ui/Avatar.vue apps/web/app/components/ui/Avatar.test.ts apps/web/app/components/ui/TagPill.vue
git commit -m "feat: add shared Avatar and TagPill components"
```

---

### Task 5: ArticleCard component

**Files:**
- Create: `apps/web/app/components/ui/ArticleCard.vue`
- Test: `apps/web/app/components/ui/ArticleCard.test.ts`

**Interfaces:**
- Consumes: `Avatar` (Task 4), `ArticleListItem` type from `@hoard/shared` (`{ id, title, slug, excerpt, coverImageUrl, readingTime, publishedAt, tags, author: { username, name, avatarUrl } }`, defined in `packages/shared/src/article.ts:44-54`).
- Produces: `ArticleCard` props: `article: ArticleListItem` (required) — Task 16 (tag listing page) renders a list of these.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/components/ui/ArticleCard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { RouterLinkStub } from '@vue/test-utils';
import ArticleCard from './ArticleCard.vue';
import type { ArticleListItem } from '@hoard/shared';

const article: ArticleListItem = {
  id: 'a1',
  title: 'Designing a reading experience',
  slug: 'designing-a-reading-experience',
  excerpt: 'A few notes on typography.',
  coverImageUrl: null,
  readingTime: 6,
  publishedAt: '2026-06-26T00:00:00.000Z',
  tags: [{ name: 'Engineering', slug: 'engineering' }],
  author: { username: 'hoang', name: 'Hoang Anh', avatarUrl: null },
};

describe('ArticleCard', () => {
  it('renders the title, excerpt, author name, and reading time', () => {
    const wrapper = mount(ArticleCard, {
      props: { article },
      global: { stubs: { NuxtLink: RouterLinkStub } },
    });
    expect(wrapper.text()).toContain('Designing a reading experience');
    expect(wrapper.text()).toContain('A few notes on typography.');
    expect(wrapper.text()).toContain('Hoang Anh');
    expect(wrapper.text()).toContain('6 min read');
  });

  it('does not render a thumbnail when coverImageUrl is null', () => {
    const wrapper = mount(ArticleCard, {
      props: { article },
      global: { stubs: { NuxtLink: RouterLinkStub } },
    });
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('renders a thumbnail when coverImageUrl is set', () => {
    const wrapper = mount(ArticleCard, {
      props: { article: { ...article, coverImageUrl: 'https://example.com/cover.jpg' } },
      global: { stubs: { NuxtLink: RouterLinkStub } },
    });
    expect(wrapper.find('img').attributes('src')).toBe('https://example.com/cover.jpg');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @hoard/web test -- ArticleCard`
Expected: FAIL — `ArticleCard.vue` does not exist.

- [ ] **Step 3: Implement ArticleCard**

Create `apps/web/app/components/ui/ArticleCard.vue`:

```vue
<script setup lang="ts">
import type { ArticleListItem } from '@hoard/shared';
import Avatar from '~/components/ui/Avatar.vue';

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
      <p class="mt-3 text-xs text-ink-light">
        {{ article.readingTime }} min read · {{ new Date(article.publishedAt).toLocaleDateString() }}
      </p>
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

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @hoard/web test -- ArticleCard`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/ui/ArticleCard.vue apps/web/app/components/ui/ArticleCard.test.ts
git commit -m "feat: add shared ArticleCard component"
```

---

### Task 6: Global layout (header/nav) and home placeholder page

**Files:**
- Create: `apps/web/app/layouts/default.vue`
- Modify: `apps/web/app/app.vue`
- Create: `apps/web/app/pages/index.vue`

**Interfaces:**
- Consumes: `Avatar` (Task 4), `useAuthStore` (`apps/web/app/stores/auth.ts` — `auth.user: AuthUser | null`, where `AuthUser` has `id/email/username/name`, no `avatarUrl`; the nav avatar therefore always renders the initials fallback — this is a deliberate simplification, not a bug, since extending `AuthUser` would be a backend-touching change out of scope for this plan).
- Produces: every page in the app now renders inside this header automatically (Nuxt applies `layouts/default.vue` to all pages once `app.vue` wraps `<NuxtPage />` in `<NuxtLayout>`) — later page-restyle tasks do not need to add their own header markup.

- [ ] **Step 1: Build the layout**

Create `apps/web/app/layouts/default.vue`:

```vue
<script setup lang="ts">
import Avatar from '~/components/ui/Avatar.vue';

const auth = useAuthStore();
</script>

<template>
  <div class="flex min-h-screen flex-col font-sans text-ink">
    <header class="border-b border-border">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <NuxtLink to="/" class="font-serif text-2xl font-bold text-ink">Hoard</NuxtLink>
        <div class="flex items-center gap-5 text-sm font-medium">
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

- [ ] **Step 2: Apply the layout in app.vue**

Replace the full contents of `apps/web/app/app.vue`:

```vue
<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
```

- [ ] **Step 3: Build the home placeholder page**

Create `apps/web/app/pages/index.vue`:

```vue
<script setup lang="ts">
const auth = useAuthStore();
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-24 text-center">
    <h1 class="font-serif text-4xl font-bold text-ink">Human stories &amp; ideas</h1>
    <p class="mt-4 text-lg text-ink-light">A place to read, write, and deepen your understanding.</p>
    <div class="mt-8 flex items-center justify-center gap-4">
      <template v-if="auth.user">
        <NuxtLink
          to="/write"
          class="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent/90"
        >
          Start writing
        </NuxtLink>
        <NuxtLink :to="`/@${auth.user.username}`" class="text-sm font-medium text-ink hover:text-accent">
          Go to your profile
        </NuxtLink>
      </template>
      <template v-else>
        <NuxtLink
          to="/signup"
          class="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent/90"
        >
          Get started
        </NuxtLink>
        <NuxtLink to="/login" class="text-sm font-medium text-ink hover:text-accent">Sign in</NuxtLink>
      </template>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Verify the build succeeds**

Run: `pnpm --filter @hoard/web build`
Expected: succeeds with no errors.

- [ ] **Step 5: Manually verify in a real browser (logged out)**

With the dev server running, use Playwright to navigate to `http://localhost:3000/`.

Expected: header shows the "Hoard" wordmark (serif), "Sign in" and a green pill "Get started" button on the right; below it, the centered serif "Human stories & ideas" heading with a "Get started" button and "Sign in" link.

- [ ] **Step 6: Manually verify in a real browser (logged in)**

Sign up or log in via Playwright (fill `/signup` or `/login` and submit — the forms work already, they're just unstyled until Task 9/10). Then navigate to `/`.

Expected: header now shows a pencil-icon "Write" link and a circular avatar (showing your first initial) instead of "Sign in"/"Get started"; the home page shows "Start writing" and "Go to your profile" instead of "Get started"/"Sign in". Click the avatar and confirm it navigates to `/@<your-username>`. Click "Write" and confirm it navigates to `/write` (which will redirect to a new draft — this already works, just unstyled).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/layouts/default.vue apps/web/app/app.vue apps/web/app/pages/index.vue
git commit -m "feat: add global Medium-style nav layout and home placeholder"
```

---

### Task 7: Restyle login.vue and signup.vue

**Files:**
- Modify: `apps/web/app/pages/login.vue`
- Modify: `apps/web/app/pages/signup.vue`

**Interfaces:**
- Consumes: `Button`, `Input` (Task 3).

- [ ] **Step 1: Restyle login.vue**

Replace the `<template>` block of `apps/web/app/pages/login.vue` (script block is unchanged — do not modify lines 1–32) and add the two component imports at the top of the script block:

```vue
<script setup lang="ts">
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { loginSchema } from '@hoard/shared';
import type { AuthUser } from '@hoard/shared';
import Button from '~/components/ui/Button.vue';
import Input from '~/components/ui/Input.vue';

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
  <div class="mx-auto max-w-sm px-6 py-16">
    <h1 class="font-serif text-3xl font-bold text-ink">Log in</h1>
    <form class="mt-6 space-y-4" @submit="onSubmit">
      <div>
        <label class="block text-sm font-medium text-ink">Email</label>
        <Input v-model="email" type="email" class="mt-1" />
        <p v-if="errors.email" class="mt-1 text-sm text-red-600">{{ errors.email }}</p>
      </div>

      <div>
        <label class="block text-sm font-medium text-ink">Password</label>
        <Input v-model="password" type="password" class="mt-1" />
        <p v-if="errors.password" class="mt-1 text-sm text-red-600">{{ errors.password }}</p>
      </div>

      <p v-if="submitError" class="text-sm text-red-600">{{ submitError }}</p>
      <Button type="submit" class="w-full">Log in</Button>
    </form>
    <a
      :href="`${config.public.apiBase}/auth/google`"
      class="mt-4 block rounded-full border border-ink px-4 py-2 text-center text-sm font-semibold text-ink hover:bg-neutral-50"
    >
      Continue with Google
    </a>
  </div>
</template>
```

- [ ] **Step 2: Restyle signup.vue**

Replace the `<template>` block of `apps/web/app/pages/signup.vue` and add the same two imports at the top of the script block (script logic otherwise unchanged):

```vue
<script setup lang="ts">
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { signupSchema } from '@hoard/shared';
import type { AuthUser } from '@hoard/shared';
import Button from '~/components/ui/Button.vue';
import Input from '~/components/ui/Input.vue';

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
  <div class="mx-auto max-w-sm px-6 py-16">
    <h1 class="font-serif text-3xl font-bold text-ink">Sign up</h1>
    <form class="mt-6 space-y-4" @submit="onSubmit">
      <div>
        <label class="block text-sm font-medium text-ink">Email</label>
        <Input v-model="email" type="email" class="mt-1" />
        <p v-if="errors.email" class="mt-1 text-sm text-red-600">{{ errors.email }}</p>
      </div>

      <div>
        <label class="block text-sm font-medium text-ink">Password</label>
        <Input v-model="password" type="password" class="mt-1" />
        <p v-if="errors.password" class="mt-1 text-sm text-red-600">{{ errors.password }}</p>
      </div>

      <div>
        <label class="block text-sm font-medium text-ink">Name</label>
        <Input v-model="name" type="text" class="mt-1" />
        <p v-if="errors.name" class="mt-1 text-sm text-red-600">{{ errors.name }}</p>
      </div>

      <div>
        <label class="block text-sm font-medium text-ink">Username</label>
        <Input v-model="username" type="text" class="mt-1" />
        <p v-if="errors.username" class="mt-1 text-sm text-red-600">{{ errors.username }}</p>
      </div>

      <p v-if="submitError" class="text-sm text-red-600">{{ submitError }}</p>
      <Button type="submit" class="w-full">Create account</Button>
    </form>
    <a
      :href="`${config.public.apiBase}/auth/google`"
      class="mt-4 block rounded-full border border-ink px-4 py-2 text-center text-sm font-semibold text-ink hover:bg-neutral-50"
    >
      Continue with Google
    </a>
  </div>
</template>
```

- [ ] **Step 3: Verify the build succeeds**

Run: `pnpm --filter @hoard/web build`
Expected: succeeds with no errors.

- [ ] **Step 4: Manually verify both forms still work end-to-end**

With Playwright: navigate to `/signup`, fill in a new email/password/name/username, submit, confirm it redirects to `/@<username>`. Then log out (via `/settings/profile`'s logout button, still unstyled until Task 8 — that's fine), navigate to `/login`, log back in with the same credentials, confirm it redirects to `/@<username>` again. Confirm validation errors still render (e.g. submit `/signup` with an invalid email and confirm the error text appears under the field).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/pages/login.vue apps/web/app/pages/signup.vue
git commit -m "feat: restyle login and signup pages"
```

---

### Task 8: Restyle oauth/callback.vue and settings/profile.vue

**Files:**
- Modify: `apps/web/app/pages/oauth/callback.vue`
- Modify: `apps/web/app/pages/settings/profile.vue`

**Interfaces:**
- Consumes: `Avatar`, `Button`, `Input`, `Textarea` (Tasks 3–4).

- [ ] **Step 1: Restyle oauth/callback.vue**

Replace the `<template>` block only (script unchanged):

```vue
<template>
  <div class="mx-auto max-w-sm px-6 py-24 text-center">
    <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>
    <p v-else class="text-sm text-ink-light">Signing you in...</p>
  </div>
</template>
```

- [ ] **Step 2: Restyle settings/profile.vue**

Add imports for `Avatar`, `Button`, `Input`, `Textarea` at the top of the script block (rest of the script logic is unchanged), and replace the `<template>` block:

```vue
<script setup lang="ts">
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { updateProfileSchema } from '@hoard/shared';
import type { PublicProfile } from '@hoard/shared';
import Avatar from '~/components/ui/Avatar.vue';
import Button from '~/components/ui/Button.vue';
import Input from '~/components/ui/Input.vue';
import Textarea from '~/components/ui/Textarea.vue';

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
  <div class="mx-auto max-w-sm px-6 py-16">
    <h1 class="font-serif text-3xl font-bold text-ink">Edit profile</h1>

    <div class="mt-6 flex items-center gap-4">
      <Avatar :src="avatarUrl" :name="auth.user?.name ?? ''" :size="64" />
      <div>
        <input type="file" accept="image/*" :disabled="avatarUploading" class="text-sm" @change="onAvatarSelected" />
        <p v-if="avatarUploading" class="text-sm text-ink-light">Uploading...</p>
        <p v-if="avatarError" class="text-sm text-red-600">{{ avatarError }}</p>
      </div>
    </div>

    <form class="mt-6 space-y-4" @submit="onSubmit">
      <div>
        <label class="block text-sm font-medium text-ink">Name</label>
        <Input v-model="name" type="text" class="mt-1" />
        <p v-if="errors.name" class="mt-1 text-sm text-red-600">{{ errors.name }}</p>
      </div>

      <div>
        <label class="block text-sm font-medium text-ink">Bio</label>
        <Textarea v-model="bio" class="mt-1" />
        <p v-if="errors.bio" class="mt-1 text-sm text-red-600">{{ errors.bio }}</p>
      </div>

      <p v-if="submitError" class="text-sm text-red-600">{{ submitError }}</p>
      <Button type="submit" class="w-full">Save</Button>
    </form>

    <Button variant="text" class="mt-4" @click="logout">Log out</Button>
  </div>
</template>
```

- [ ] **Step 3: Verify the build succeeds**

Run: `pnpm --filter @hoard/web build`
Expected: succeeds with no errors.

- [ ] **Step 4: Manually verify in a real browser**

Log in via Playwright, navigate to `/settings/profile`. Confirm the avatar, name field (pre-filled), and bio field render styled; edit the name and save, confirm it redirects to `/@<username>`. Navigate back to `/settings/profile`, click "Log out", confirm it redirects to `/login` and that `auth.user` is now null (e.g. the global nav reverts to "Sign in"/"Get started").

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/pages/oauth/callback.vue apps/web/app/pages/settings/profile.vue
git commit -m "feat: restyle oauth callback and profile settings pages"
```

---

### Task 9: Restyle write/index.vue

**Files:**
- Modify: `apps/web/app/pages/write/index.vue`

- [ ] **Step 1: Restyle**

Replace the `<template>` block only (script unchanged):

```vue
<template>
  <div class="mx-auto max-w-sm px-6 py-24 text-center">
    <p class="text-sm text-ink-light">Creating a new draft...</p>
  </div>
</template>
```

- [ ] **Step 2: Verify the build succeeds**

Run: `pnpm --filter @hoard/web build`
Expected: succeeds with no errors.

- [ ] **Step 3: Manually verify in a real browser**

Log in via Playwright, click "Write" in the nav. Confirm the brief centered loading message renders, then it redirects to `/write/<new-id>`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/pages/write/index.vue
git commit -m "feat: restyle write draft-creation loading page"
```

---

### Task 10: Restyle write/[id].vue

**Files:**
- Modify: `apps/web/app/pages/write/[id].vue`

**Interfaces:**
- Consumes: `Button`, `Input`, `TagPill` (Tasks 3–4), `ArticleEditor` (existing, `apps/web/app/components/editor/ArticleEditor.vue` — unchanged).

This is the largest single page. The script block's logic is entirely unchanged from the current file — only imports are added and the template is replaced. Per the Global Constraints, the page-level nav stays the global default nav (no layout-slot override); the publish controls live in a sticky action row at the top of this page's own content, directly below the global header.

- [ ] **Step 1: Add component imports**

At the top of the `<script setup>` block in `apps/web/app/pages/write/[id].vue`, change:

```typescript
import ArticleEditor from '~/components/editor/ArticleEditor.vue';
import type { Article } from '@hoard/shared';
```

to:

```typescript
import ArticleEditor from '~/components/editor/ArticleEditor.vue';
import Button from '~/components/ui/Button.vue';
import Input from '~/components/ui/Input.vue';
import TagPill from '~/components/ui/TagPill.vue';
import type { Article } from '@hoard/shared';
```

Leave every other line of the script block exactly as-is (lines 5–134 of the current file: route/auth/config setup, `article`/`title`/`loadError` refs, the load `try/catch`, `allTags`/`tagNames`/`newTagInput` refs, the tags `try/catch`, `useArticleAutosave` wiring, `save`/`onTitleInput`/`onEditorUpdate`/`addTag`/`removeTag`, cover upload state and `onCoverSelected`, and `publishError`/`togglePublish`).

- [ ] **Step 2: Replace the template**

```vue
<template>
  <p v-if="loadError" class="mx-auto max-w-2xl px-6 py-16 text-sm text-red-600">{{ loadError }}</p>
  <div v-else-if="article">
    <div class="border-b border-border bg-white">
      <div class="mx-auto flex max-w-[680px] items-center justify-between px-6 py-3">
        <p class="text-sm text-ink-light">
          <span v-if="saveStatus === 'saving'">Saving...</span>
          <span v-else-if="saveStatus === 'saved'">Saved</span>
          <span v-else-if="saveStatus === 'error'">Could not save</span>
        </p>
        <div class="flex items-center gap-3">
          <p v-if="publishError" class="text-sm text-red-600">{{ publishError }}</p>
          <Button type="button" @click="togglePublish">
            {{ article.status === 'PUBLISHED' ? 'Unpublish' : 'Publish' }}
          </Button>
        </div>
      </div>
    </div>

    <div class="mx-auto max-w-[680px] px-6 py-10">
      <p v-if="article.status === 'PUBLISHED'" class="mb-4 text-sm text-ink-light">
        Published at
        <a :href="`/@${auth.user?.username}/${article.slug}`" class="text-accent hover:underline">
          /@{{ auth.user?.username }}/{{ article.slug }}
        </a>
      </p>

      <input
        v-model="title"
        placeholder="Title"
        class="w-full border-none font-serif text-4xl font-bold text-ink placeholder:text-ink-light/60 focus:outline-none"
        @input="onTitleInput"
      />

      <div class="mt-6 flex flex-wrap items-center gap-2">
        <TagPill v-for="tag in tagNames" :key="tag" :name="tag">
          <button type="button" class="text-ink-light hover:text-ink" @click="removeTag(tag)">×</button>
        </TagPill>
        <Input
          v-model="newTagInput"
          placeholder="Add a tag"
          class="w-32"
          @keyup.enter="addTag(newTagInput)"
        />
      </div>
      <div v-if="allTags.filter((t) => !tagNames.includes(t.name)).length > 0" class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="suggestion in allTags.filter((t) => !tagNames.includes(t.name))"
          :key="suggestion.name"
          type="button"
          class="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-ink-light hover:bg-neutral-200"
          @click="addTag(suggestion.name)"
        >
          {{ suggestion.name }}
        </button>
      </div>

      <div class="prose-serif mt-8">
        <ArticleEditor :content="article.content" @update="onEditorUpdate" />
      </div>

      <div class="mt-8 border-t border-border pt-6">
        <img v-if="article.coverImageUrl" :src="article.coverImageUrl" alt="Cover image" class="mb-3 w-full rounded-md object-cover" />
        <label class="block cursor-pointer rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-ink-light hover:border-accent">
          <input type="file" accept="image/*" :disabled="coverUploading" class="hidden" @change="onCoverSelected" />
          {{ article.coverImageUrl ? 'Replace cover image' : 'Add a cover image' }}
        </label>
        <p v-if="coverUploading" class="mt-2 text-sm text-ink-light">Uploading...</p>
        <p v-if="coverError" class="mt-2 text-sm text-red-600">{{ coverError }}</p>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Make the Tiptap editor body render in the article serif font**

Add a `<style>` block at the end of `apps/web/app/pages/write/[id].vue`, after the `</template>` tag:

```vue
<style scoped>
.prose-serif :deep(.tiptap) {
  font-family: var(--font-serif);
  font-size: 1.0625rem;
  line-height: 1.6;
  color: #242424;
  min-height: 200px;
  outline: none;
}

.prose-serif :deep(.tiptap p) {
  margin: 0.75em 0;
}
</style>
```

- [ ] **Step 4: Verify the build succeeds**

Run: `pnpm --filter @hoard/web build`
Expected: succeeds with no errors.

- [ ] **Step 5: Manually verify in a real browser**

Log in via Playwright, click "Write". On the new draft: type a title, confirm it appears in large serif text; type article content into the editor body, confirm it renders in serif; add a tag by typing and pressing Enter, confirm a pill appears with a working "×" remove button; click an existing tag suggestion (create a second test article with a different tag first if none exist) and confirm it adds correctly; upload a cover image and confirm it displays; click "Publish" and confirm the status flips to "Unpublish" and a published-at link appears; navigate to that link and confirm the live article matches what was written. Confirm the save-status text ("Saving..." then "Saved") appears correctly while typing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/pages/write/\[id\].vue
git commit -m "feat: restyle the article editor page"
```

---

### Task 11: Restyle @[username]/index.vue

**Files:**
- Modify: `apps/web/app/pages/@[username]/index.vue`

**Interfaces:**
- Consumes: `Avatar` (Task 4), `useAuthStore`.

- [ ] **Step 1: Restyle, adding the "Edit profile" link for the owner's own profile**

Replace the full contents of `apps/web/app/pages/@[username]/index.vue`:

```vue
<script setup lang="ts">
import type { PublicProfile } from '@hoard/shared';
import Avatar from '~/components/ui/Avatar.vue';

const route = useRoute();
const config = useRuntimeConfig();
const auth = useAuthStore();
const username = route.params.username as string;

const { data, error } = await useFetch<PublicProfile>(`${config.public.apiBase}/users/${username}`);

const isOwnProfile = computed(() => auth.user?.username === username);
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-16">
    <p v-if="error" class="text-sm text-ink-light">User not found.</p>
    <div v-else-if="data" class="text-center">
      <Avatar :src="data.avatarUrl" :name="data.name" :size="96" />
      <h1 class="mt-4 font-serif text-3xl font-bold text-ink">{{ data.name }}</h1>
      <p class="mt-1 text-sm text-ink-light">@{{ data.username }}</p>
      <p v-if="data.bio" class="mt-4 text-base text-ink">{{ data.bio }}</p>
      <NuxtLink
        v-if="isOwnProfile"
        to="/settings/profile"
        class="mt-4 inline-block rounded-full border border-ink px-4 py-2 text-sm font-semibold text-ink hover:bg-neutral-50"
      >
        Edit profile
      </NuxtLink>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Verify the build succeeds**

Run: `pnpm --filter @hoard/web build`
Expected: succeeds with no errors.

- [ ] **Step 3: Manually verify in a real browser**

Log in via Playwright, navigate to your own `/@<username>`. Confirm the centered avatar/name/handle/bio render, and an "Edit profile" link is visible that navigates to `/settings/profile`. Then navigate to a different (or logged-out) profile URL and confirm the "Edit profile" link does NOT appear. Navigate to a nonexistent username and confirm "User not found." renders.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/pages/@\[username\]/index.vue
git commit -m "feat: restyle public profile page"
```

---

### Task 12: Restyle @[username]/[slug].vue

**Files:**
- Modify: `apps/web/app/pages/@[username]/[slug].vue`

- [ ] **Step 1: Restyle (script unchanged)**

Replace the `<template>` block of `apps/web/app/pages/@[username]/[slug].vue`:

```vue
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
      <!-- safe: generateHTML only emits markup for the node/mark types declared
           in the extensions array above — it cannot emit arbitrary tags, since
           the input is our own Tiptap JSON, not raw user-supplied HTML. -->
      <div class="prose-serif mt-8" v-html="contentHtml" />
    </article>
  </div>
</template>
```

- [ ] **Step 2: Add the article body typography**

Add a `<style>` block after `</template>`:

```vue
<style scoped>
.prose-serif {
  font-family: var(--font-serif);
  font-size: 1.125rem;
  line-height: 1.7;
  color: #242424;
}

.prose-serif :deep(p) {
  margin: 1em 0;
}

.prose-serif :deep(h2) {
  font-weight: 700;
  font-size: 1.5rem;
  margin: 1.5em 0 0.5em;
}

.prose-serif :deep(a) {
  color: #1a8917;
  text-decoration: underline;
}

.prose-serif :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}
</style>
```

- [ ] **Step 3: Verify the build succeeds**

Run: `pnpm --filter @hoard/web build`
Expected: succeeds with no errors.

- [ ] **Step 4: Manually verify in a real browser**

Navigate (logged out) to a published article's `/@username/slug` URL. Confirm: cover image (if any), large serif title, byline linking to the author's profile, reading time + formatted date, tag pills linking to `/tag/<slug>`, and the article body in serif with the 680px reading column. Navigate to a nonexistent slug and confirm "Article not found." renders.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/pages/@\[username\]/\[slug\].vue
git commit -m "feat: restyle article reading page"
```

---

### Task 13: Restyle tag/[slug].vue

**Files:**
- Modify: `apps/web/app/pages/tag/[slug].vue`

**Interfaces:**
- Consumes: `ArticleCard` (Task 5).

- [ ] **Step 1: Restyle (script gets one new import, template replaced)**

Replace the full contents of `apps/web/app/pages/tag/[slug].vue`:

```vue
<script setup lang="ts">
import type { TagWithArticles } from '@hoard/shared';
import ArticleCard from '~/components/ui/ArticleCard.vue';

const route = useRoute();
const config = useRuntimeConfig();
const slug = route.params.slug as string;

const { data, error } = await useFetch<TagWithArticles>(`${config.public.apiBase}/tags/${slug}/articles`);
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-12">
    <p v-if="error" class="text-sm text-ink-light">Tag not found.</p>
    <div v-else-if="data">
      <h1 class="font-serif text-3xl font-bold text-ink">#{{ data.tag.name }}</h1>
      <p v-if="data.articles.length === 0" class="mt-6 text-sm text-ink-light">No published articles yet.</p>
      <div v-else class="mt-6">
        <ArticleCard v-for="article in data.articles" :key="article.id" :article="article" />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Verify the build succeeds**

Run: `pnpm --filter @hoard/web build`
Expected: succeeds with no errors.

- [ ] **Step 3: Manually verify in a real browser**

Navigate to `/tag/<a-tag-with-published-articles>`. Confirm the serif "#TagName" heading and a list of `ArticleCard`s, newest first, each linking correctly to the article and the author's profile. Navigate to `/tag/no-such-tag` and confirm "Tag not found." renders. If you have a tag with zero published articles, confirm "No published articles yet." renders instead of an empty list.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/pages/tag/\[slug\].vue
git commit -m "feat: restyle tag listing page"
```

---

### Task 14: Final full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all existing suites pass unchanged (this plan added no backend changes and no logic changes to any composable/store), plus the new Button/Input/Avatar/ArticleCard tests from Tasks 3–5 all pass.

- [ ] **Step 2: Run the full build**

Run: `pnpm build`
Expected: all three packages build successfully.

- [ ] **Step 3: Full manual click-through**

With Playwright, starting from a logged-out session: visit `/`, sign up, get redirected to your profile, edit your profile (name/bio/avatar), write and publish an article with a tag and a cover image, visit the published article at its `/@username/slug` URL, visit its tag page, log out, log back in, and visit someone else's profile and a nonexistent profile/article/tag to confirm all four not-found states render correctly. Confirm the header nav is present and correct (logged-in vs logged-out variants) on every page visited.

- [ ] **Step 4: No commit for this task** — it is verification only. If any issue is found, fix it within the task where it was introduced and re-run that task's own verification before returning here.
