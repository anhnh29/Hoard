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
