import type { Meta, StoryObj } from '@storybook/react';
import { MoreHorizontal } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './context-menu';

const meta: Meta<typeof ContextMenu> = {
  title: 'UI/ContextMenu',
  component: ContextMenu,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof ContextMenu>;

const items = Array.from({ length: 48 }, (_, index) => `Stack item ${index + 1}`);

export const LongListPortalLayer: Story = {
  render: () => (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl rounded border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
          Long list
        </div>
        <div className="max-h-[520px] overflow-y-auto">
          {items.map((item) => (
            <ContextMenu key={item}>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left text-sm text-gray-700 last:border-b-0 hover:bg-gray-50"
                >
                  <span className="mr-auto">{item}</span>
                  <MoreHorizontal className="h-4 w-4 text-gray-400" />
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuItem>Open</ContextMenuItem>
                <ContextMenuItem>Info</ContextMenuItem>
                <ContextMenuItem>Find similar</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem className="text-red-600 focus:text-red-700">
                  Remove Stack
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      </div>
    </div>
  ),
};
