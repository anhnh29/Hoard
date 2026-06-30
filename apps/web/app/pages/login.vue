<script setup lang="ts">
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { loginSchema } from '@hoard/shared';
import type { AuthUser } from '@hoard/shared';
import Button from '~/components/ui/Button.vue';
import Input from '~/components/ui/Input.vue';

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
  <div class="mx-auto max-w-sm px-6 py-16">
    <h1 class="font-serif text-3xl font-bold text-ink">Log in</h1>
    <form class="mt-6 space-y-4" @submit="onSubmit">
      <div>
        <label class="block text-sm font-medium text-ink">Email</label>
        <Input v-model="email" type="email" class="mt-1" />
        <p v-if="errors.email" class="mt-1 text-sm text-red-600">{{ errors.email }}</p>
      </div>

      <div>
        <label class="block text-sm font-medium text-ink">Password</label>
        <Input v-model="password" type="password" class="mt-1" />
        <p v-if="errors.password" class="mt-1 text-sm text-red-600">{{ errors.password }}</p>
      </div>

      <p v-if="submitError" class="text-sm text-red-600">{{ submitError }}</p>
      <Button type="submit" class="w-full">Log in</Button>
    </form>
    <a
      :href="`${config.public.apiBase}/auth/google`"
      class="mt-4 block rounded-full border border-ink px-4 py-2 text-center text-sm font-semibold text-ink hover:bg-neutral-50"
    >
      Continue with Google
    </a>
  </div>
</template>
