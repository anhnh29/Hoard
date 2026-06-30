import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Input from './Input.vue';

describe('Input', () => {
  it('defaults to type="text"', () => {
    const wrapper = mount(Input);
    expect(wrapper.attributes('type')).toBe('text');
  });

  it('applies the type prop', () => {
    const wrapper = mount(Input, { props: { type: 'email' } });
    expect(wrapper.attributes('type')).toBe('email');
  });

  it('supports v-model', async () => {
    const wrapper = mount(Input, {
      props: { modelValue: '', 'onUpdate:modelValue': (v: string) => wrapper.setProps({ modelValue: v }) },
    });
    await wrapper.find('input').setValue('hello@example.com');
    expect(wrapper.props('modelValue')).toBe('hello@example.com');
  });
});
