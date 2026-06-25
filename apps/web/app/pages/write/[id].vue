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
