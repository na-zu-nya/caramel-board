import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useScratch } from '@/hooks/useScratch';
import { apiClient } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { NotebookText } from 'lucide-react';

interface StackContextMenuProps {
  datasetId: string;
  stackId: number | string;
  children: React.ReactNode;
}

export function StackContextMenu({ datasetId, stackId, children }: StackContextMenuProps) {
  const { ensureScratch } = useScratch(datasetId);
  const queryClient = useQueryClient();

  const handleAddToScratch = async () => {
    const sc = await ensureScratch();
    const idNum = typeof stackId === 'string' ? parseInt(stackId, 10) : stackId;
    await apiClient.addStackToCollection(sc.id, idNum);
    // Wait for server-backed queries to update; no optimistic bump here
    await queryClient.invalidateQueries({ queryKey: ['stacks'] });
    await queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });
    await queryClient.refetchQueries({ queryKey: ['library-counts', datasetId] });
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onClick={handleAddToScratch}>
          <NotebookText className="w-4 h-4 mr-2" />
          Add to Scratch
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
