import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Button from './Button.vue';

describe('Button', () => {
  it('renders slot content', () => {
    const wrapper = mount(Button, { slots: { default: 'Save' } });
    expect(wrapper.text()).toBe('Save');
  });

  it('defaults to type="button" and variant="primary" styling', () => {
    const wrapper = mount(Button, { slots: { default: 'Save' } });
    expect(wrapper.attributes('type')).toBe('button');
    expect(wrapper.classes()).toContain('bg-accent');
  });

  it('applies type="submit" when passed', () => {
    const wrapper = mount(Button, { props: { type: 'submit' }, slots: { default: 'Save' } });
    expect(wrapper.attributes('type')).toBe('submit');
  });

  it('applies secondary variant styling', () => {
    const wrapper = mount(Button, { props: { variant: 'secondary' }, slots: { default: 'Save' } });
    expect(wrapper.classes()).toContain('border-ink');
    expect(wrapper.classes()).not.toContain('bg-accent');
  });
});
