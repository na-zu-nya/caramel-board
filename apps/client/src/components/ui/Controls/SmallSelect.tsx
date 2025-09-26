import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ReactNode } from 'react';

export interface SmallSelectProps<T extends string = string> {
  value?: T;
  onValueChange?: (value: T) => void;
  placeholder?: string;
  children?: ReactNode; // usually a list of <SelectItem/>
}

export function SmallSelect<T extends string = string>({ value, onValueChange, placeholder, children }: SmallSelectProps<T>) {
  return (
    <Select value={value} onValueChange={onValueChange as any}>
      <SelectTrigger className="h-8 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

