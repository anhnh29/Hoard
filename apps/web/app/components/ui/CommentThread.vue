<script setup lang="ts">
import type { CommentItem } from '@hoard/shared';
import Avatar from '~/components/ui/Avatar.vue';
import { useApi } from '~/composables/useApi';

const props = defineProps<{ slug: string }>();
const auth = useAuthStore();
const { public: { apiBase } } = useRuntimeConfig();

const comments = ref<CommentItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const newComment = ref('');
const submitting = ref(false);
const replyingTo = ref<string | null>(null);
const replyContent = ref('');

async function fetchComments() {
  loading.value = true;
  error.value = null;
  try {
    comments.value = await $fetch<CommentItem[]>(`${apiBase}/articles/${props.slug}/comments`);
  } catch {
    error.value = 'Failed to load responses.';
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

    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
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
