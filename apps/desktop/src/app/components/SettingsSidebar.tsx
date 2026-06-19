import type { NavJumpItem } from '../types';

interface SettingsSidebarProps {
  label: string;
  items: NavJumpItem[];
  onJump: (id: string) => void;
}

export function SettingsSidebar({ label, items, onJump }: SettingsSidebarProps) {
  return (
    <aside className="settings-sidebar">
      <nav className="settings-nav" aria-label={label}>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className="nav-item"
              onClick={() => onJump(item.id)}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
