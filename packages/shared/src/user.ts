import { z } from 'zod';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  name: string;
}

export interface PublicProfile {
  id: string;
  username: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
}

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(80),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, numbers, and underscores'),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  bio: z.string().max(280).nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
