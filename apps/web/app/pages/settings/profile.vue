<script setup lang="ts">
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { updateProfileSchema } from '@hoard/shared';
import type { PublicProfile } from '@hoard/shared';

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
