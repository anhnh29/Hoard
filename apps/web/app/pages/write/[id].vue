<script setup lang="ts">
import ArticleEditor from '~/components/editor/ArticleEditor.vue';
import Button from '~/components/ui/Button.vue';
import Input from '~/components/ui/Input.vue';
import TagPill from '~/components/ui/TagPill.vue';
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

const allTags = ref<{ name: string }[]>([]);
const tagNames = ref<string[]>(article.value?.tagNames ?? []);
const newTagInput = ref('');

try {
  allTags.value = await $fetch<{ name: string }[]>(`${config.public.apiBase}/tags`);
} catch {
  allTags.value = [];
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
</script>

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

