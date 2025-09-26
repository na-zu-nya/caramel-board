import type { Preview } from '@storybook/react';
import '../src/styles.css';
import React from 'react';
import { DragProvider } from '../src/contexts/DragContext';

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    options: {
      storySort: {
        order: ['Overview', 'Components', 'Pages'],
      },
    },
  },
  decorators: [
    (Story) => (
      <DragProvider>
        <div style={{ padding: 16 }}>
          <Story />
        </div>
      </DragProvider>
    ),
  ],
};

export default preview;
