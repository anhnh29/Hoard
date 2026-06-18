<script setup lang="ts">
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { signupSchema } from '@hoard/shared';
import type { AuthUser } from '@hoard/shared';

const { defineField, handleSubmit, errors } = useForm({
  validationSchema: toTypedSchema(signupSchema),
});

const [email] = defineField('email');
const [password] = defineField('password');
const [name] = defineField('name');
const [username] = defineField('username');

const auth = useAuthStore();
const router = useRouter();
const config = useRuntimeConfig();
const submitError = ref<string | null>(null);

const onSubmit = handleSubmit(async (values) => {
  submitError.value = null;
  try {
    const result = await $fetch<{ user: AuthUser; accessToken: string }>(
      `${config.public.apiBase}/auth/signup`,
      { method: 'POST', body: values, credentials: 'include' },
    );
    auth.setSession(result.user, result.accessToken);
    await router.push(`/@${result.user.username}`);
  } catch {
    submitError.value = 'Signup failed. Check your details and try again.';
  }
});
</script>

<template>
  <form @submit="onSubmit">
    <h1>Sign up</h1>
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

    <label>
      Name
      <input v-model="name" type="text" />
    </label>
    <p v-if="errors.name">{{ errors.name }}</p>

    <label>
      Username
      <input v-model="username" type="text" />
    </label>
    <p v-if="errors.username">{{ errors.username }}</p>

    <p v-if="submitError">{{ submitError }}</p>
    <button type="submit">Create account</button>
  </form>
</template>
