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
</script>

<template>
  <p v-if="loadError">{{ loadError }}</p>
  <div v-else-if="article">
    <input v-model="title" placeholder="Title" @input="onTitleInput" />
    <p>{{ saveStatus }}</p>
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
    <ArticleEditor :content="article.content" @update="onEditorUpdate" />
    <div>
      <img v-if="article.coverImageUrl" :src="article.coverImageUrl" alt="Cover image" width="200" />
      <input type="file" accept="image/*" :disabled="coverUploading" @change="onCoverSelected" />
      <p v-if="coverUploading">Uploading...</p>
      <p v-if="coverError">{{ coverError }}</p>
    </div>
  </div>
</template>
