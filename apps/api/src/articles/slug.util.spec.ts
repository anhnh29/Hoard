import { slugify } from './slug.util';

describe('slugify', () => {
  it('lowercases and hyphenates a simple title', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('collapses runs of non-alphanumeric characters into a single hyphen', () => {
    expect(slugify('Hello, World!! Foo___Bar')).toBe('hello-world-foo-bar');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('--Hello World--')).toBe('hello-world');
  });

  it('truncates to 80 characters', () => {
    const longTitle = 'a'.repeat(100);
    expect(slugify(longTitle).length).toBe(80);
  });
});
