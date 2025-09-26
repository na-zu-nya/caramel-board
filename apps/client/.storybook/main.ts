import { dirname, resolve } from 'node:path';
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(ts|tsx)'
  ],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-a11y'
  ],
  docs: {
    autodocs: 'tag',
  },
  viteFinal: async (config) => {
    // Ensure alias `@` -> src
    config.resolve = config.resolve || {};
    // @ts-expect-error - alias type is flexible between Vite versions
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': resolve(dirname(new URL(import.meta.url).pathname), '../src'),
    };
    // Prevent duplicate React
    // @ts-expect-error - dedupe type varies between Vite versions
    config.resolve.dedupe = [
      ...((config.resolve as any).dedupe || []),
      'react',
      'react-dom',
    ];

    // Add Tailwind v4 plugin to Storybook's Vite pipeline
    const tailwindcss = (await import('@tailwindcss/vite')).default;
    // @ts-expect-error - plugin array is fine
    config.plugins = [...(config.plugins || []), tailwindcss()];

    return config;
  },
};

export default config;
