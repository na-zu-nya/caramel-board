import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface LibrarySetupFormProps {
  name: string;
  icon: string;
  color: string;
  description?: string;
  onNameChange: (name: string) => void;
  onIconChange: (icon: string) => void;
  onColorChange: (color: string) => void;
  onSubmit: () => void;
  submitting?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
}

// 実用的な絵文字（上段）
const PRACTICAL_EMOJIS = ['📚', '🎨', '📷', '🎮', '🎬', '💼'];
// お菓子系絵文字（下段） - 5個にして+ボタン用のスペースを確保
const SWEET_EMOJIS = ['🍰', '🧁', '🍪', '🍭', '🍫'];
// Caramelを先頭に配置して、Modernカラーを続ける
const COLOR_OPTIONS = [
  '#C7743C', // Caramel (default)
  '#9F582C', // Dark Caramel
  '#E2A67C', // Light Caramel
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
];

export function LibrarySetupForm({
  name,
  icon,
  color,
  description,
  onNameChange,
  onIconChange,
  onColorChange,
  onSubmit,
  submitting = false,
  disabled = false,
  error,
  className,
}: LibrarySetupFormProps) {
  const [hoveredEmoji, setHoveredEmoji] = useState<string | null>(null);
  const [hoveredColor, setHoveredColor] = useState<string | null>(null);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Preview Card */}
      <div
        className="mb-8 overflow-hidden rounded-2xl shadow-xl transition-all duration-300 hover:scale-[1.02]"
        style={{
          background: `linear-gradient(135deg, ${color}20 0%, ${color}10 100%)`,
          borderColor: color,
          borderWidth: '2px',
          borderStyle: 'solid',
        }}
      >
        <div className="p-8 text-center">
          <div
            className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-2xl bg-white shadow-lg transition-transform duration-200 hover:scale-105"
            style={{ boxShadow: `0 8px 32px ${color}40` }}
          >
            <span className="text-5xl">{icon}</span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900" style={{ color: color }}>
            {name || '新しいライブラリ'}
          </h3>
          {description && <p className="mt-2 text-sm text-gray-600">{description}</p>}
        </div>
      </div>

      {/* Form Fields */}
      <div className="space-y-6">
        {/* Library Name */}
        <div>
          <Label htmlFor="library-name" className="mb-2 text-base font-medium">
            ライブラリ名
          </Label>
          <Input
            id="library-name"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="例: イラスト資料集"
            disabled={disabled || submitting}
            className="h-12 text-base"
          />
        </div>

        {/* Emoji Picker */}
        <div>
          <Label className="mb-2 text-base font-medium">アイコン</Label>
          <div className="space-y-2">
            {/* 実用的な絵文字 */}
            <div className="grid grid-cols-6 gap-2">
              {PRACTICAL_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onIconChange(emoji)}
                  onMouseEnter={() => setHoveredEmoji(emoji)}
                  onMouseLeave={() => setHoveredEmoji(null)}
                  disabled={disabled || submitting}
                  className={cn(
                    'h-12 w-12 rounded-xl border-2 text-2xl transition-all duration-200 transform hover:scale-105 active:scale-95',
                    icon === emoji
                      ? 'bg-amber-50 shadow-md'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2'
                  )}
                  style={
                    {
                      borderColor: icon === emoji ? '#C7743C' : undefined,
                      '--tw-ring-color': '#C7743C',
                    } as React.CSSProperties
                  }
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* お菓子系絵文字 + 拡張ボタン */}
            <div className="grid grid-cols-6 gap-2">
              {SWEET_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onIconChange(emoji)}
                  onMouseEnter={() => setHoveredEmoji(emoji)}
                  onMouseLeave={() => setHoveredEmoji(null)}
                  disabled={disabled || submitting}
                  className={cn(
                    'h-12 w-12 rounded-xl border-2 text-2xl transition-all duration-200 transform hover:scale-105 active:scale-95',
                    icon === emoji
                      ? 'bg-amber-50 shadow-md'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2'
                  )}
                  style={
                    {
                      borderColor: icon === emoji ? '#C7743C' : undefined,
                      '--tw-ring-color': '#C7743C',
                    } as React.CSSProperties
                  }
                >
                  {emoji}
                </button>
              ))}

              {/* 絵文字拡張ボタン */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={disabled || submitting}
                    className="h-12 w-12 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 text-gray-400 transition-all duration-200 transform hover:scale-105 hover:border-gray-400 hover:bg-gray-100 active:scale-95 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                  >
                    <Plus className="h-6 w-6 mx-auto" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="p-0 border bg-white shadow-lg z-50">
                  <EmojiPicker
                    autoFocusSearch={false}
                    lazyLoadEmojis
                    onEmojiClick={(emojiData: EmojiClickData) => {
                      onIconChange(emojiData.emoji);
                    }}
                    theme="auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        {/* Color Picker */}
        <div>
          <Label className="mb-2 text-base font-medium">テーマカラー</Label>
          <div className="space-y-3">
            {/* Caramel Colors - Featured */}
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">キャラメル（デフォルト）</p>
              <div className="flex gap-3">
                {COLOR_OPTIONS.slice(0, 3).map((colorOption) => (
                  <button
                    key={colorOption}
                    type="button"
                    onClick={() => onColorChange(colorOption)}
                    onMouseEnter={() => setHoveredColor(colorOption)}
                    onMouseLeave={() => setHoveredColor(null)}
                    disabled={disabled || submitting}
                    className={cn(
                      'h-12 w-12 rounded-full border-2 transition-all duration-200 transform',
                      color === colorOption
                        ? 'scale-110 shadow-lg'
                        : 'hover:scale-105 hover:shadow-md',
                      'focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-95'
                    )}
                    style={{
                      backgroundColor: colorOption,
                      borderColor: color === colorOption ? 'white' : 'transparent',
                      boxShadow: color === colorOption ? `0 0 0 3px ${colorOption}40` : 'none',
                      focusRingColor: colorOption,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Modern Colors */}
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">モダン</p>
              <div className="flex gap-3">
                {COLOR_OPTIONS.slice(3).map((colorOption) => (
                  <button
                    key={colorOption}
                    type="button"
                    onClick={() => onColorChange(colorOption)}
                    onMouseEnter={() => setHoveredColor(colorOption)}
                    onMouseLeave={() => setHoveredColor(null)}
                    disabled={disabled || submitting}
                    className={cn(
                      'h-12 w-12 rounded-full border-2 transition-all duration-200 transform',
                      color === colorOption
                        ? 'scale-110 shadow-lg'
                        : 'hover:scale-105 hover:shadow-md',
                      'focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-95'
                    )}
                    style={{
                      backgroundColor: colorOption,
                      borderColor: color === colorOption ? 'white' : 'transparent',
                      boxShadow: color === colorOption ? `0 0 0 3px ${colorOption}40` : 'none',
                      focusRingColor: colorOption,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300 rounded-lg bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="button"
          size="lg"
          onClick={onSubmit}
          disabled={disabled || submitting || !name.trim()}
          className="w-full h-12 text-base text-white shadow-lg hover:shadow-xl transition-all duration-200"
          style={{
            backgroundColor: '#C7743C',
          }}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              作成中...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              ライブラリを作成
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
