import { useAtom } from 'jotai';
import type { ReactNode } from 'react';
import { selectionModeAtom } from '@/stores/ui';
import type { MediaGridItem } from '@/types';
import BulkEditPanel from '../BulkEditPanel.tsx';
import InfoSidebar from '../InfoSidebar';
import { EditPanelProvider, type EditUpdates } from './EditPanelProvider';

interface PanelManagerProps {
  children: ReactNode;
  selectedItems: Set<string | number>;
  items: MediaGridItem[];
  onSave: (updates: EditUpdates) => Promise<void>;
}

export function PanelManager({ children, selectedItems, items, onSave }: PanelManagerProps) {
  const [isSelectionMode, setSelectionMode] = useAtom(selectionModeAtom);

  return (
    <EditPanelProvider
      selectedItems={selectedItems}
      items={items.filter((item) => selectedItems.has(item.id))}
      onSave={onSave}
    >
      {children}

      {/* Edit Panel - Always visible in selection mode */}
      <BulkEditPanel
        isOpen={isSelectionMode}
        onClose={() => setSelectionMode(false)}
        selectedItems={selectedItems}
        items={items.filter((item) => selectedItems.has(item.id))}
        onSave={onSave}
      />

      {/* Info Sidebar is rendered globally in root for persistent mounting */}
    </EditPanelProvider>
  );
}
