import { Clapperboard, Download, GitMerge, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import type { SelectionAction } from '@/components/ui/selection-action-bar';

interface StackSelectionActionCopy {
  bulkEdit: string;
  downloadSelected: (count: number) => string;
  mergeStacks: string;
  refreshThumbnails: string;
  optimizeVideo: string;
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
  refreshThumbnails?: StackSelectionActionHandler;
  optimizeVideo?: StackSelectionActionHandler;
  deleteStacks?: StackSelectionActionHandler;
}

export function createStackSelectionActions({
  selectedCount,
  copy,
  bulkEdit,
  downloadSelected,
  mergeStacks,
  refreshThumbnails,
  optimizeVideo,
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

  if (refreshThumbnails) {
    actions.push({
      label: copy.refreshThumbnails,
      value: 'refresh-thumbnails',
      onSelect: refreshThumbnails.onSelect,
      icon: <RefreshCw size={12} />,
    });
  }

  if (optimizeVideo) {
    actions.push({
      label: copy.optimizeVideo,
      value: 'optimize-video',
      onSelect: optimizeVideo.onSelect,
      icon: <Clapperboard size={12} />,
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
