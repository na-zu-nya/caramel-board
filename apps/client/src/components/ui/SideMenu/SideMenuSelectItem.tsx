import type { HTMLAttributes } from 'react';
import type { ReactNode } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../select';

export interface SideMenuSelectItemProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value?: string;
  onValueChange?: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
}

export function SideMenuSelectItem({
  label,
  value,
  onValueChange,
  options,
  placeholder,
  ...divProps
}: SideMenuSelectItemProps) {
  return (
    <div className="flex items-center gap-2" {...divProps}>
      <span className="text-sm text-gray-700 flex-1">{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
