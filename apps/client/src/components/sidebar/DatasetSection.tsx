import type { SidebarSectionProps } from '@/components/sidebar/types';
import { SideMenuGroup } from '@/components/ui/SideMenu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDatasets } from '@/hooks/useDatasets';
import { useNavigate } from '@tanstack/react-router';

interface DatasetSectionProps extends SidebarSectionProps {
  currentDataset: string | null;
}

export function DatasetSection({ datasetId, isCollapsed = false, onToggle }: DatasetSectionProps) {
  const { data: datasets = [] } = useDatasets();
  const navigate = useNavigate();

  const selectedDataset = datasets.find((d) => String(d.id) === String(datasetId));

  const handleDatasetChange = (value: string) => {
    if (value !== datasetId) {
      void navigate({ to: `/library/${value}` });
    }
  };

  return (
    <SideMenuGroup label="Current Library" collapsed={isCollapsed} onToggle={onToggle}>
      <Select value={datasetId} onValueChange={handleDatasetChange}>
        <SelectTrigger className="w-full h-8 text-sm">
          <SelectValue>
            {selectedDataset ? (
              <span className="flex items-center gap-1.5">
                <span className="text-xs">
                  {selectedDataset.icon || '📁'} {selectedDataset.name}
                </span>
              </span>
            ) : (
              <span className="text-xs">Select a library</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {datasets.map((d) => (
            <SelectItem key={d.id} value={String(d.id)}>
              <span className="flex items-center gap-1.5">
                <span className="text-xs">
                  {d.icon || '📁'} {d.name}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SideMenuGroup>
  );
}
