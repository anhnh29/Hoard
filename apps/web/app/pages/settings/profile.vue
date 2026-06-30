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
