import type { Meta, StoryObj } from '@storybook/react';
import BulkEditPanel from './BulkEditPanel';

const meta: Meta<typeof BulkEditPanel> = {
  title: 'Components/BulkEditPanel',
  component: BulkEditPanel,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'モバイル環境では右方向へスワイプするとパネルを閉じられます。',
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof BulkEditPanel>;

const selectedItems = new Set<string | number>([1, 2, 3]);

export const Default: Story = {
  render: () => (
    <div className="min-h-screen bg-slate-100">
      <BulkEditPanel
        isOpen
        onClose={() => console.log('close panel')}
        selectedItems={selectedItems}
        onSave={(updates) => console.log('apply bulk updates', updates)}
        items={[
          { id: 1, tags: ['landscape', 'sunset'], author: 'Alice' },
          { id: 2, tags: ['portrait'], author: 'Bob' },
          { id: 3, tags: ['travel'], author: 'Charlie' },
        ]}
      />
    </div>
  ),
};
