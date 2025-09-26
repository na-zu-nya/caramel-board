import type { Meta, StoryObj } from '@storybook/react';
import { AppHeader, AppHeaderDivider } from './AppHeader';
import { HeaderIconButton } from '../HeaderIconButton';
import { Filter, Menu, Shuffle, Check } from 'lucide-react';

const meta: Meta<typeof AppHeader> = {
  title: 'App Shell/AppHeader',
  component: AppHeader,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    withSidebar: false,
  },
};
export default meta;
type Story = StoryObj<typeof AppHeader>;

export const Default: Story = {
  render: (args) => (
    <div style={{ height: 80 }}>
      <AppHeader
        {...args}
        backgroundColor="rgba(59,130,246,0.5)"
        left={
          <>
            <HeaderIconButton aria-label="Toggle sidebar">
              <Menu size={18} />
            </HeaderIconButton>
            <HeaderIconButton aria-label="Shuffle">
              <Shuffle size={18} />
            </HeaderIconButton>
          </>
        }
        center={<span className="text-sm opacity-80">Pins / Center content</span>}
        right={
          <>
            <HeaderIconButton aria-label="Filter">
              <Filter size={18} />
            </HeaderIconButton>
            <HeaderIconButton isActive aria-label="Select mode">
              <Check size={18} />
            </HeaderIconButton>
            <AppHeaderDivider />
            <div className="text-xs opacity-80">Custom actions</div>
          </>
        }
      />
    </div>
  ),
};
