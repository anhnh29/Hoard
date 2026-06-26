import { extractPlainText, calculateReadingTime, calculateExcerpt } from './reading-time.util';

const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'This is ' },
        { type: 'text', text: 'a second paragraph.' },
      ],
    },
  ],
};

describe('extractPlainText', () => {
  it('walks the Tiptap JSON tree and concatenates all text nodes with spaces', () => {
    expect(extractPlainText(doc)).toBe('Hello world This is a second paragraph.');
  });

  it('returns an empty string for a doc with no text nodes', () => {
    expect(extractPlainText({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe('');
  });
});

describe('calculateReadingTime', () => {
  it('returns a minimum of 1 minute for short content', () => {
    expect(calculateReadingTime(doc)).toBe(1);
  });

  it('rounds up for longer content (200 words = 1 minute, 201 = 2)', () => {
    const longDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'word '.repeat(201).trim() }] }],
    };
    expect(calculateReadingTime(longDoc)).toBe(2);
  });
});

describe('calculateExcerpt', () => {
  it('returns the first 160 characters of the plain text', () => {
    expect(calculateExcerpt(doc)).toBe('Hello world This is a second paragraph.');
  });

  it('truncates long content to exactly 160 characters', () => {
    const longDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a'.repeat(200) }] }],
    };
    expect(calculateExcerpt(longDoc).length).toBe(160);
  });
});
