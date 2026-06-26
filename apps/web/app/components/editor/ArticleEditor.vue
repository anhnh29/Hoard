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
