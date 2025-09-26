import type { MediaGridItem } from '@/types';
import { type ReactNode, createContext, useContext } from 'react';

export interface EditUpdates {
  addTags?: string[];
  setAuthor?: string;
  setMediaType?: 'image' | 'comic' | 'video';
}

interface EditPanelContextType {
  selectedItems: Set<string | number>;
  items: MediaGridItem[];
  onSave: (updates: EditUpdates) => Promise<void>;
}

const EditPanelContext = createContext<EditPanelContextType | null>(null);

interface EditPanelProviderProps {
  children: ReactNode;
  selectedItems: Set<string | number>;
  items: MediaGridItem[];
  onSave: (updates: EditUpdates) => Promise<void>;
}

export function EditPanelProvider({
  children,
  selectedItems,
  items,
  onSave,
}: EditPanelProviderProps) {
  const value = {
    selectedItems,
    items,
    onSave,
  };

  return <EditPanelContext.Provider value={value}>{children}</EditPanelContext.Provider>;
}

export function useEditPanelContext() {
  const context = useContext(EditPanelContext);
  if (!context) {
    throw new Error('useEditPanelContext must be used within EditPanelProvider');
  }
  return context;
}
