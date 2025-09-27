import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import * as React from 'react';

type ColorKey =
  | 'light-gray'
  | 'bright-red'
  | 'bright-orange'
  | 'bright-yellow'
  | 'bright-green'
  | 'bright-cyan'
  | 'bright-blue'
  | 'bright-violet';

const COLOR_PALETTE: { key: ColorKey; hex: string; label: string }[] = [
  { key: 'light-gray', hex: '#E5E7EB', label: 'Light Gray' },
  { key: 'bright-red', hex: '#EF4444', label: 'Bright Red' },
  { key: 'bright-orange', hex: '#F97316', label: 'Bright Orange' },
  { key: 'bright-yellow', hex: '#EAB308', label: 'Bright Yellow' },
  { key: 'bright-green', hex: '#22C55E', label: 'Bright Green' },
  { key: 'bright-cyan', hex: '#06B6D4', label: 'Bright Cyan' },
  { key: 'bright-blue', hex: '#3B82F6', label: 'Bright Blue' },
  { key: 'bright-violet', hex: '#8B5CF6', label: 'Bright Violet' },
];

export interface MarkerEditorDialogProps {
  open: boolean;
  time: number;
  color: string; // stores key
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  onSave: (values: { time: number; color: ColorKey }) => void;
}

export default function MarkerEditorDialog({
  open,
  time,
  color,
  onOpenChange,
  onDelete,
  onSave,
}: MarkerEditorDialogProps) {
  const [localTimeStr, setLocalTimeStr] = React.useState<string>(String(time ?? 0));
  const [localColor, setLocalColor] = React.useState<string>(color);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setLocalTimeStr(String(time ?? 0)), [time]);
  React.useEffect(() => setLocalColor(color), [color]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(localTimeStr.replace(/,/g, '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('Please enter a valid non-negative number.');
      return;
    }
    onSave({ time: parsed, color: (localColor as ColorKey) || 'bright-blue' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Marker Settings</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2">
          {/* Time input */}
          <div className="space-y-2">
            <label className="text-sm text-gray-700">Time (sec)</label>
            <input
              type="text"
              inputMode="decimal"
              value={localTimeStr}
              onChange={(e) => {
                setLocalTimeStr(e.target.value);
                setError(null);
              }}
              className={cn(
                'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
              )}
              autoFocus
              placeholder="e.g. 12.34"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          {/* Color palette */}
          <div className="space-y-2 mt-4">
            <label className="text-sm text-gray-700">Color</label>
            <div className="grid grid-cols-8 gap-2">
              {COLOR_PALETTE.map(({ key, hex, label }) => (
                <button
                  key={key}
                  type="button"
                  title={label}
                  onClick={() => setLocalColor(key)}
                  className={cn(
                    'relative h-8 w-8 rounded-md border transition-transform',
                    localColor === key
                      ? 'ring-2 ring-offset-2 ring-primary scale-105'
                      : 'hover:scale-105'
                  )}
                  style={{ backgroundColor: hex, borderColor: '#e5e7eb' }}
                  aria-pressed={localColor === key}
                />
              ))}
            </div>
          </div>

          {/* Footer: 左下=削除 / 右下=保存 */}
          <div className="mt-6 flex items-center justify-between">
            <Button type="button" variant="outline" onClick={onDelete}>
              Delete
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
