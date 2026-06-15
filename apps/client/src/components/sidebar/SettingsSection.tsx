import { Link } from '@tanstack/react-router';
import { Database, Pin as PinIcon, Settings2, Tag, Wand2 } from 'lucide-react';
import type { SettingsSectionProps } from '@/components/sidebar/types';
import { SideMenuGroup, SideMenuListItem } from '@/components/ui/SideMenu';
import { useT } from '@/lib/i18n';

export function SettingsSection({
  datasetId,
  isCollapsed = false,
  onToggle,
}: SettingsSectionProps) {
  const t = useT();

  return (
    <SideMenuGroup label={t.sidebar.settings} collapsed={isCollapsed} onToggle={onToggle}>
      <nav className="space-y-0.5">
        <SideMenuListItem asChild icon={Settings2} label={t.sidebar.general}>
          <Link to="/settings/general" activeProps={{ className: 'bg-gray-100 font-medium' }} />
        </SideMenuListItem>
        <SideMenuListItem asChild icon={Database} label={t.sidebar.libraries}>
          <Link to="/settings/libraries" activeProps={{ className: 'bg-gray-100 font-medium' }} />
        </SideMenuListItem>
        <SideMenuListItem asChild icon={Tag} label={t.sidebar.tags}>
          <Link
            to="/library/$datasetId/tags"
            params={() => ({ datasetId })}
            activeProps={{ className: 'bg-gray-100 font-medium' }}
          />
        </SideMenuListItem>
        <SideMenuListItem asChild icon={Wand2} label={t.sidebar.autoTag}>
          <Link
            to="/library/$datasetId/autotag-config"
            params={() => ({ datasetId })}
            activeProps={{ className: 'bg-gray-100 font-medium' }}
          />
        </SideMenuListItem>
        <SideMenuListItem asChild icon={PinIcon} label={t.header.pins}>
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
