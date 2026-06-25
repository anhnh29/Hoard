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
  </div>
</template>
