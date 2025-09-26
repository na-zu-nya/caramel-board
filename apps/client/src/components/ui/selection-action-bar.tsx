import { selectionModeAtom } from '@/stores/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useState, type ReactNode } from 'react';
import { useAtom } from 'jotai';
import { ChevronDown, Trash2, X } from 'lucide-react';

interface SelectionActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onExitSelectionMode: () => void;
  onRemoveFromCollection?: () => void;
  showRemoveFromCollection?: boolean;
  actions?: SelectionAction[];
}

export interface SelectionAction {
  label: string;
  value: string;
  onSelect: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  confirmMessage?: string;
  destructive?: boolean;
  group?: 'primary' | 'secondary';
}

export function SelectionActionBar({
  selectedCount,
  onClearSelection,
  onExitSelectionMode,
  onRemoveFromCollection,
  showRemoveFromCollection = false,
  actions,
}: SelectionActionBarProps) {
  const [selectionMode] = useAtom(selectionModeAtom);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!selectionMode || selectedCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 flex items-center gap-4 min-w-64">
        {/* Selected count */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full" />
          <span className="text-sm font-medium text-gray-900">{selectedCount} selected</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {actions && actions.length > 0 && (
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors flex items-center gap-1"
                  aria-haspopup="menu"
                >
                  Action
                  <ChevronDown size={12} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {(() => {
                  const primaryActions = actions.filter((action) => action.group === 'primary');
                  const secondaryActions = actions.filter(
                    (action) => action.group !== 'primary' && !action.destructive
                  );
                  const destructiveActions = actions.filter((action) => action.destructive);

                  const renderAction = (action: SelectionAction) => (
                    <DropdownMenuItem
                      key={action.value}
                      onSelect={(event) => {
                        event.preventDefault();
                        if (action.disabled) return;
                        if (action.confirmMessage && !window.confirm(action.confirmMessage)) {
                          return;
                        }
                        action.onSelect();
                        setMenuOpen(false);
                      }}
                      disabled={action.disabled}
                      className={`text-xs flex items-center gap-2 ${
                        action.destructive ? 'text-red-600 focus:text-red-600' : ''
                      }`}
                    >
                      {action.icon && (
                        <span className={action.destructive ? 'text-red-500' : 'text-gray-500'}>
                          {action.icon}
                        </span>
                      )}
                      <span>{action.label}</span>
                    </DropdownMenuItem>
                  );

                  return (
                    <>
                      {primaryActions.map(renderAction)}
                      {primaryActions.length > 0 &&
                        (secondaryActions.length > 0 || destructiveActions.length > 0) && (
                          <DropdownMenuSeparator />
                        )}
                      {secondaryActions.map(renderAction)}
                      {secondaryActions.length > 0 && destructiveActions.length > 0 && (
                        <DropdownMenuSeparator />
                      )}
                      {destructiveActions.map(renderAction)}
                    </>
                  );
                })()}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {/* Remove from collection button (only in collection view) */}
          {showRemoveFromCollection && (
            <button
              type="button"
              onClick={onRemoveFromCollection}
              className="px-3 py-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors flex items-center gap-1"
            >
              <Trash2 size={12} />
              Remove
            </button>
          )}

          {/* Clear selection button */}
          <button
            type="button"
            onClick={onClearSelection}
            className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
          >
            Clear
          </button>

          {/* Exit selection mode button */}
          <button
            type="button"
            onClick={onExitSelectionMode}
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
            aria-label="Exit selection mode"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
