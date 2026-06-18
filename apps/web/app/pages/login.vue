<script setup lang="ts">
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { loginSchema } from '@hoard/shared';
import type { AuthUser } from '@hoard/shared';

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
  <form @submit="onSubmit">
    <h1>Log in</h1>
    <label>
      Email
      <input v-model="email" type="email" />
    </label>
    <p v-if="errors.email">{{ errors.email }}</p>

    <label>
      Password
      <input v-model="password" type="password" />
    </label>
    <p v-if="errors.password">{{ errors.password }}</p>

    <p v-if="submitError">{{ submitError }}</p>
    <button type="submit">Log in</button>
  </form>
</template>
