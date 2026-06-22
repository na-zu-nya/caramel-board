import { Download, GitMerge, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import type { SelectionAction } from '@/components/ui/selection-action-bar';

interface StackSelectionActionCopy {
  bulkEdit: string;
  downloadSelected: (count: number) => string;
  mergeStacks: string;
  refresh: string;
  deleteStacks: string;
  deleteStacksConfirm: (count: number) => string;
}

interface StackSelectionActionHandler {
  onSelect: () => void;
}

interface StackSelectionMergeAction extends StackSelectionActionHandler {
  confirmMessage?: string;
}

interface CreateStackSelectionActionsOptions {
  selectedCount: number;
  copy: StackSelectionActionCopy;
  bulkEdit?: StackSelectionActionHandler;
  downloadSelected?: StackSelectionActionHandler;
  mergeStacks?: StackSelectionMergeAction;
  refresh?: StackSelectionActionHandler;
  deleteStacks?: StackSelectionActionHandler;
}

export function createStackSelectionActions({
  selectedCount,
  copy,
  bulkEdit,
  downloadSelected,
  mergeStacks,
  refresh,
  deleteStacks,
}: CreateStackSelectionActionsOptions): SelectionAction[] {
  if (selectedCount === 0) return [];

  const actions: SelectionAction[] = [];

  if (bulkEdit) {
    actions.push({
      label: copy.bulkEdit,
      value: 'bulk-edit',
      onSelect: bulkEdit.onSelect,
      icon: <Pencil size={12} />,
      group: 'primary',
    });
  }

  if (mergeStacks) {
    actions.push({
      label: copy.mergeStacks,
      value: 'merge-stacks',
      onSelect: mergeStacks.onSelect,
      icon: <GitMerge size={12} />,
      confirmMessage: mergeStacks.confirmMessage,
      group: 'primary',
    });
  }

  if (downloadSelected) {
    actions.push({
      label: copy.downloadSelected(selectedCount),
      value: 'download-selected',
      onSelect: downloadSelected.onSelect,
      icon: <Download size={12} />,
    });
  }

  if (refresh) {
    actions.push({
      label: copy.refresh,
      value: 'refresh',
      onSelect: refresh.onSelect,
      icon: <RefreshCw size={12} />,
    });
  }

  if (deleteStacks) {
    actions.push({
      label: copy.deleteStacks,
      value: 'delete-stacks',
      onSelect: deleteStacks.onSelect,
      icon: <Trash2 size={12} />,
      confirmMessage: copy.deleteStacksConfirm(selectedCount),
      destructive: true,
    });
  }

  return actions;
}
