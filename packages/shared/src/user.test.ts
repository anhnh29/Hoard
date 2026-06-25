import { describe, it, expect } from 'vitest';
import { signupSchema, loginSchema, updateProfileSchema } from './user';

describe('signupSchema', () => {
  it('accepts a valid signup payload', () => {
    const result = signupSchema.safeParse({
      email: 'alice@example.com',
      password: 'password123',
      name: 'Alice',
      username: 'alice_1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = signupSchema.safeParse({
      email: 'alice@example.com',
      password: 'short',
      name: 'Alice',
      username: 'alice_1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a username with uppercase letters', () => {
    const result = signupSchema.safeParse({
      email: 'alice@example.com',
      password: 'password123',
      name: 'Alice',
      username: 'Alice',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts a valid login payload', () => {
    const result = loginSchema.safeParse({ email: 'alice@example.com', password: 'anything' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'anything' });
    expect(result.success).toBe(false);
  });
});

describe('updateProfileSchema', () => {
  it('accepts a partial update with just a name', () => {
    const result = updateProfileSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('accepts a null bio', () => {
    const result = updateProfileSchema.safeParse({ bio: null });
    expect(result.success).toBe(true);
  });

  it('rejects a bio longer than 280 characters', () => {
    const result = updateProfileSchema.safeParse({ bio: 'x'.repeat(281) });
    expect(result.success).toBe(false);
  });

  it('accepts an avatarUrl', () => {
    const result = updateProfileSchema.safeParse({
      avatarUrl: 'https://res.cloudinary.com/demo/image/upload/v1/avatar.png',
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.avatarUrl).toBe(
      'https://res.cloudinary.com/demo/image/upload/v1/avatar.png',
    );
  });

  it('rejects a non-URL avatarUrl', () => {
    const result = updateProfileSchema.safeParse({ avatarUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });
});
