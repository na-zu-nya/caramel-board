import type { Meta, StoryObj } from '@storybook/react';
import { EntityCard } from './EntityCard';

const meta: Meta<typeof EntityCard> = {
  title: 'Card/EntityCard',
  component: EntityCard,
};
export default meta;
type Story = StoryObj<typeof EntityCard>;

export const Square: Story = {
  args: {
    aspect: '1/1',
    title: 'Collection Alpha',
    subtitle: '123 items',
    thumbnailSrc: '',
    icon: '📁',
  },
};

export const Widescreen: Story = {
  args: {
    aspect: '16/9',
    title: 'Images',
    subtitle: '1,234 items',
    thumbnailSrc: '',
    icon: '🖼️',
  },
};
