import { useEffect, useRef, useState } from 'react';
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DEFAULT_CARAMEL_COLOR, PRESET_COLOR_GROUPS } from '@/components/ui/LibraryCard';
import { Palette, Smile } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LibrarySetupFormProps {
  name: string;
  icon: string;
  color: string;
  description?: string;
  onNameChange: (value: string) => void;
  onIconChange: (emoji: string) => void;
  onColorChange: (color: string) => void;
  onSubmit: () => void;
  submitting?: boolean;
  disabled?: boolean;
  error?: string;
  focusOnMount?: boolean;
}

export function LibrarySetupForm({
  name,
  icon,
  color,
  description,
  onNameChange,
  onIconChange,
  onColorChange,
  onSubmit,
  submitting,
  disabled,
  error,
  focusOnMount,
}: LibrarySetupFormProps) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const interactionsLocked = Boolean(disabled || submitting);

  useEffect(() => {
    if (!focusOnMount || interactionsLocked) return;
    if (nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [focusOnMount, interactionsLocked]);

  const handleEmojiSelect = (emoji: EmojiClickData) => {
    onIconChange(emoji.emoji);
    setEmojiOpen(false);
  };

  const handleColorPick = (selected: string) => {
    onColorChange(selected);
    setColorOpen(false);
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (interactionsLocked) return;
        onSubmit();
      }}
    >
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-900">Library name</label>
        <Input
          ref={nameInputRef}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="My First Library"
          required
          disabled={interactionsLocked}
          autoFocus={focusOnMount}
        />
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-900">Emoji icon</label>
          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50"
                disabled={interactionsLocked}
              >
                <span className="text-3xl leading-none">{icon || '📚'}</span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-900">Choose emoji</span>
                  <span className="text-xs text-muted-foreground">すぐに雰囲気が伝わるアイコンを選びましょう</span>
                </div>
                <Smile className="ml-auto h-4 w-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="p-0" align="start">
              <EmojiPicker
                autoFocusSearch={false}
                lazyLoadEmojis
                onEmojiClick={handleEmojiSelect}
                theme="auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-900">Theme color</label>
          <Popover open={colorOpen} onOpenChange={setColorOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50"
                disabled={interactionsLocked}
              >
                <span
                  className="h-10 w-10 rounded-full border border-black/5"
                  style={{ backgroundColor: color || DEFAULT_CARAMEL_COLOR }}
                />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-900">Choose color</span>
                  <span className="text-xs text-muted-foreground">カラメルカラーが既定値です</span>
                </div>
                <Palette className="ml-auto h-4 w-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="start">
              <div className="flex flex-col gap-4">
                {PRESET_COLOR_GROUPS.map((group) => (
                  <div key={group.label} className="flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {group.label}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {group.colors.map((hex) => {
                        const active = hex.toLowerCase() === (color || DEFAULT_CARAMEL_COLOR).toLowerCase();
                        return (
                          <button
                            key={hex}
                            type="button"
                            className={cn(
                              'h-9 w-9 rounded-full border transition-transform duration-150',
                              active ? 'scale-110 border-gray-900' : 'border-transparent hover:scale-105'
                            )}
                            style={{ backgroundColor: hex }}
                            onClick={() => handleColorPick(hex)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button type="submit" disabled={interactionsLocked} className="self-start">
        {submitting ? 'Creating...' : 'Create library'}
      </Button>
    </form>
  );
}

export default LibrarySetupForm;
