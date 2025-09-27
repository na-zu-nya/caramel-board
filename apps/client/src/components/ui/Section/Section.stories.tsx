import type { Meta, StoryObj } from '@storybook/react';
import { SectionHeader, SectionBlock } from './Section';

const meta: Meta<typeof SectionHeader> = {
  title: 'Section/SectionHeader',
  component: SectionHeader,
};
export default meta;
type Story = StoryObj<typeof SectionHeader>;

export const HeaderOnly: Story = {
  args: { title: 'Section Title' },
};

export const WithAction: Story = {
  render: () => <SectionHeader title="Recent Items" action={<a href="#more">See all ›</a>} />,
};

export const Block: Story = {
  render: () => (
    <SectionBlock title="Recent Items" action={<a href="#more">See all ›</a>}>
      <div className="grid grid-cols-3 gap-2">
        <div className="h-12 bg-gray-100 rounded" />
        <div className="h-12 bg-gray-100 rounded" />
        <div className="h-12 bg-gray-100 rounded" />
      </div>
    </SectionBlock>
  ),
};
