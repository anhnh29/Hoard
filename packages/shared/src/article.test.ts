import { describe, it, expect } from 'vitest';
import { updateArticleSchema } from './article';

describe('updateArticleSchema', () => {
  it('accepts a partial update with just a title', () => {
    const result = updateArticleSchema.safeParse({ title: 'New Title' });
    expect(result.success).toBe(true);
  });

  it('accepts content as an arbitrary object (Tiptap JSON)', () => {
    const result = updateArticleSchema.safeParse({
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts tagNames as an array of strings', () => {
    const result = updateArticleSchema.safeParse({ tagNames: ['vue', 'typescript'] });
    expect(result.success).toBe(true);
  });

  it('rejects more than 10 tagNames', () => {
    const result = updateArticleSchema.safeParse({
      tagNames: Array.from({ length: 11 }, (_, i) => `tag${i}`),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-url coverImageUrl', () => {
    const result = updateArticleSchema.safeParse({ coverImageUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });
});
