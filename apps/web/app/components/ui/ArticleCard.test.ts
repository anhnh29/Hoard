import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { RouterLinkStub } from '@vue/test-utils';
import ArticleCard from './ArticleCard.vue';
import type { ArticleListItem } from '@hoard/shared';

const article: ArticleListItem = {
  id: 'a1',
  title: 'Designing a reading experience',
  slug: 'designing-a-reading-experience',
  excerpt: 'A few notes on typography.',
  coverImageUrl: null,
  readingTime: 6,
  publishedAt: '2026-06-26T00:00:00.000Z',
  tags: [{ name: 'Engineering', slug: 'engineering' }],
  author: { username: 'hoang', name: 'Hoang Anh', avatarUrl: null },
};

describe('ArticleCard', () => {
  it('renders the title, excerpt, author name, and reading time', () => {
    const wrapper = mount(ArticleCard, {
      props: { article },
      global: { stubs: { NuxtLink: RouterLinkStub } },
    });
    expect(wrapper.text()).toContain('Designing a reading experience');
    expect(wrapper.text()).toContain('A few notes on typography.');
    expect(wrapper.text()).toContain('Hoang Anh');
    expect(wrapper.text()).toContain('6 min read');
  });

  it('does not render a thumbnail when coverImageUrl is null', () => {
    const wrapper = mount(ArticleCard, {
      props: { article },
      global: { stubs: { NuxtLink: RouterLinkStub } },
    });
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('renders a thumbnail when coverImageUrl is set', () => {
    const wrapper = mount(ArticleCard, {
      props: { article: { ...article, coverImageUrl: 'https://example.com/cover.jpg' } },
      global: { stubs: { NuxtLink: RouterLinkStub } },
    });
    expect(wrapper.find('img').attributes('src')).toBe('https://example.com/cover.jpg');
  });
});
