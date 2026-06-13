import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';
import { Check, Edit2, Lock, Palette, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useT } from '@/lib/i18n';
import type { Dataset } from '@/types';

export interface LibraryStats {
  stackCount: number;
  assetCount: number;
}

interface LibraryCardProps {
  dataset: Dataset & {
    itemCount?: number;
    icon?: string;
    themeColor?: string;
    isDefault?: boolean;
    isProtected?: boolean;
  };
  stats?: LibraryStats | null;
  isRefreshing: boolean;
  onUpdate: (updates: { name?: string; icon?: string; themeColor?: string }) => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onStartRefresh: () => void;
  onProtectionClick: () => void;
  disableSetDefault: boolean;
}

export const PRESET_COLOR_GROUPS: Array<{ label: string; colors: string[] }> = [
  {
    label: 'Caramel',
    colors: ['#C7743C', '#9F582C', '#E2A67C'],
  },
  {
    label: 'Modern',
    colors: [
      '#8B5CF6', // Purple
      '#EC4899', // Pink
      '#3B82F6', // Blue
      '#10B981', // Emerald
      '#F59E0B', // Amber
      '#EF4444', // Red
      '#6366F1', // Indigo
      '#14B8A6', // Teal
      '#F97316', // Orange
      '#84CC16', // Lime
      '#A855F7', // Fuchsia
      '#6B7280', // Gray
    ],
  },
  {
    label: 'Neutrals',
    colors: ['#111827', '#374151', '#9CA3AF'],
  },
];

export const DEFAULT_CARAMEL_COLOR = PRESET_COLOR_GROUPS[0].colors[0];

export function LibraryCard({
  dataset,
  stats,
  isRefreshing,
  onUpdate,
  onDelete,
  onSetDefault,
  onStartRefresh,
  onProtectionClick,
  disableSetDefault,
}: LibraryCardProps) {
  const t = useT();
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(dataset.name ?? '');
  const [colorValue, setColorValue] = useState(dataset.themeColor ?? DEFAULT_CARAMEL_COLOR);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNameValue(dataset.name ?? '');
  }, [dataset.name]);

  useEffect(() => {
    setColorValue(dataset.themeColor ?? '');
  }, [dataset.themeColor]);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const swatchColor = useMemo(() => {
    const value = colorValue || dataset.themeColor || DEFAULT_CARAMEL_COLOR;
    return value;
  }, [colorValue, dataset.themeColor]);

  const handleEmojiSelect = (emoji: EmojiClickData) => {
    onUpdate({ icon: emoji.emoji });
    setEmojiOpen(false);
  };

  const handleNameCommit = () => {
    const trimmed = nameValue.trim();
    if (!trimmed) {
      setNameValue(dataset.name ?? '');
      setIsEditingName(false);
      return;
    }
    if (trimmed !== dataset.name) {
      onUpdate({ name: trimmed });
    }
    setIsEditingName(false);
  };

  const handleColorSelect = (hex: string) => {
    setColorValue(hex);
    setColorOpen(false);
    if (hex !== dataset.themeColor) {
      onUpdate({ themeColor: hex });
    }
  };

  const colorGroups = useMemo(() => {
    const flat = new Set<string>(PRESET_COLOR_GROUPS.flatMap((group) => group.colors));
    if (dataset.themeColor && !flat.has(dataset.themeColor)) {
      return [{ label: 'Current', colors: [dataset.themeColor] }, ...PRESET_COLOR_GROUPS];
    }
    return PRESET_COLOR_GROUPS;
  }, [dataset.themeColor]);

  const isLocked = Boolean(dataset.isProtected && dataset.authorized === false);
  const stackCount = stats?.stackCount ?? dataset.itemCount ?? 0;
  const assetCount = stats?.assetCount ?? 0;

  return (
    <div className="border border-gray-200 rounded-xl relative overflow-hidden bg-white shadow-[0_10px_32px_-12px_rgba(0,0,0,0.18)] transition-shadow hover:shadow-[0_14px_40px_-12px_rgba(0,0,0,0.22)]">
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ backgroundColor: dataset.themeColor || '#3b82f6', color: 'white' }}
      >
        <div className="flex items-center gap-4">
          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="w-16 h-16 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 transition-colors"
                aria-label="Change library icon"
              >
                <span className="text-4xl drop-shadow-sm">{dataset.icon || '📂'}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="p-0 border bg-white shadow-lg z-50">
              <EmojiPicker
                autoFocusSearch={false}
                lazyLoadEmojis
                onEmojiClick={handleEmojiSelect}
                theme="auto"
              />
            </PopoverContent>
          </Popover>

          <div>
            <div className="flex items-center gap-2">
              {isEditingName ? (
                <input
                  ref={nameInputRef}
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onBlur={handleNameCommit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleNameCommit();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      setNameValue(dataset.name ?? '');
                      setIsEditingName(false);
                    }
                  }}
                  className="text-xl font-semibold leading-tight px-2 py-1 rounded-md bg-white/90 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-white/70"
                  placeholder={t.library.libraryName}
                />
              ) : (
                <h3 className="text-xl font-semibold leading-tight">{dataset.name}</h3>
              )}
              {Boolean((dataset as any).isDefault) && (
                <span className="px-2 py-0.5 text-[10px] rounded bg-white/25 text-white/95 uppercase tracking-wide">
                  {t.library.default}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => (isEditingName ? handleNameCommit() : setIsEditingName(true))}
            className="p-2 rounded-md transition-colors hover:bg-white/10 text-white"
            aria-label={isEditingName ? 'Save library name' : 'Edit library name'}
          >
            {isEditingName ? <Check size={18} /> : <Edit2 size={18} />}
          </button>
          {Boolean(!(dataset as any).isDefault) && (
            <button
              type="button"
              onClick={onSetDefault}
              className="px-2 py-1 rounded-md text-xs font-medium bg-white/20 hover:bg-white/30 transition-colors"
              aria-label={t.library.setDefault}
              disabled={disableSetDefault}
            >
              {t.library.setDefault}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="p-2 rounded-md transition-colors hover:bg-white/10 text-white"
            aria-label="Delete library"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* ライブラリの統計(スタック数・アイテム数) */}
      {!isLocked && (
        <div className="grid grid-cols-2 divide-x divide-gray-100 border-t bg-gray-50/70">
          <div className="px-6 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
              {t.library.stacks}
            </div>
            <div className="text-xl font-semibold text-gray-900">{stackCount.toLocaleString()}</div>
          </div>
          <div className="px-6 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
              {t.library.items}
            </div>
            <div className="text-xl font-semibold text-gray-900">{assetCount.toLocaleString()}</div>
          </div>
        </div>
      )}

      <div className="border-t px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Palette size={18} className="text-gray-500" />
            <span className="text-sm font-medium">{t.library.themeColor}</span>
          </div>
          <Popover open={colorOpen} onOpenChange={setColorOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="h-10 w-10 rounded-full border shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white"
                style={{ backgroundColor: swatchColor, borderColor: 'rgba(0,0,0,0.1)' }}
                aria-label="Change theme color"
              />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-4 space-y-3">
              {colorGroups.map((group) => (
                <div key={group.label} className="space-y-2">
                  <div className="text-xs font-medium text-gray-600">{group.label}</div>
                  <div className="grid grid-cols-6 gap-2">
                    {group.colors.map((hex) => {
                      const isSelected = swatchColor.toLowerCase() === hex.toLowerCase();
                      return (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => handleColorSelect(hex)}
                          className="relative h-8 w-8 rounded-full border focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white"
                          style={{
                            backgroundColor: hex,
                            borderColor: isSelected ? 'rgba(59, 130, 246, 0.9)' : 'transparent',
                          }}
                          aria-label={`Use color ${hex}`}
                          aria-pressed={isSelected}
                        >
                          {isSelected && (
                            <span className="absolute inset-0 flex items-center justify-center text-white">
                              <Check size={14} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="border-t px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lock size={18} className="text-gray-500" />
            <span className="text-sm font-medium">{t.library.passwordProtection}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">
              {(dataset as any).isProtected ? t.library.enabled : t.library.disabled}
            </span>
            <button
              type="button"
              className="px-3 py-1.5 text-xs rounded-md border hover:bg-gray-100"
              onClick={onProtectionClick}
            >
              {(dataset as any).isProtected ? t.library.disable : t.library.enable}
            </button>
          </div>
        </div>
      </div>

      <div className="border-t px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RefreshCw size={18} className="text-gray-500" />
            <span className="text-sm font-medium">{t.library.fullRefresh}</span>
          </div>
          <button
            type="button"
            onClick={onStartRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-white rounded-md transition-opacity disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
            style={{ backgroundColor: swatchColor }}
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? t.library.processing : t.library.startRefresh}
          </button>
        </div>
      </div>
    </div>
  );
}

export type { LibraryCardProps };
