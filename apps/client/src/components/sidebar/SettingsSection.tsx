import { SideMenuGroup, SideMenuListItem } from '@/components/ui/SideMenu';
import type { SettingsSectionProps } from '@/components/sidebar/types';
import { Database, Pin as PinIcon, Tag, Wand2 } from 'lucide-react';
import { Link } from '@tanstack/react-router';

export function SettingsSection({
  datasetId,
  isCollapsed = false,
  onToggle,
}: SettingsSectionProps) {
  return (
    <SideMenuGroup label="Settings" collapsed={isCollapsed} onToggle={onToggle}>
      <nav className="space-y-0.5">
        <SideMenuListItem asChild icon={Database} label="Libraries">
          <Link to="/settings/libraries" activeProps={{ className: 'bg-gray-100 font-medium' }} />
        </SideMenuListItem>
        <SideMenuListItem asChild icon={Tag} label="Tags">
          <Link
            to="/library/$datasetId/tags"
            params={() => ({ datasetId })}
            activeProps={{ className: 'bg-gray-100 font-medium' }}
          />
        </SideMenuListItem>
        <SideMenuListItem asChild icon={Wand2} label="Auto-Tag">
          <Link
            to="/library/$datasetId/autotag-config"
            params={() => ({ datasetId })}
            activeProps={{ className: 'bg-gray-100 font-medium' }}
          />
        </SideMenuListItem>
        <SideMenuListItem asChild icon={PinIcon} label="Pins">
          <Link
            to="/library/$datasetId/pins"
            params={() => ({ datasetId })}
            activeProps={{ className: 'bg-gray-100 font-medium' }}
          />
        </SideMenuListItem>
      </nav>
    </SideMenuGroup>
  );
}
