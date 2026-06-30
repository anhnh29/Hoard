import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Avatar from './Avatar.vue';

describe('Avatar', () => {
  it('renders an img when src is set', () => {
    const wrapper = mount(Avatar, { props: { src: 'https://example.com/a.jpg', name: 'Alice' } });
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/a.jpg');
    expect(img.attributes('alt')).toBe('Alice');
  });

  it('falls back to the first initial when src is missing', () => {
    const wrapper = mount(Avatar, { props: { name: 'Alice' } });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toBe('A');
  });

  it('falls back to the first initial when src is null', () => {
    const wrapper = mount(Avatar, { props: { src: null, name: 'bob' } });
    expect(wrapper.text()).toBe('B');
  });
});
