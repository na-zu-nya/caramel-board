export const STACK_GRID_MIN_COLUMNS = 2;
export const STACK_GRID_MAX_COLUMNS = 12;
export const STACK_GRID_DEFAULT_COLUMNS = 5;

const STACK_GRID_COLUMNS_KEY = 'stack-grid.columns';

export function clampStackGridColumns(value: number) {
  if (!Number.isFinite(value)) return STACK_GRID_DEFAULT_COLUMNS;
  return Math.min(STACK_GRID_MAX_COLUMNS, Math.max(STACK_GRID_MIN_COLUMNS, Math.round(value)));
}

export function readStackGridColumns() {
  if (typeof window === 'undefined') return STACK_GRID_DEFAULT_COLUMNS;
  const storedValue = window.localStorage.getItem(STACK_GRID_COLUMNS_KEY);
  if (!storedValue) return STACK_GRID_DEFAULT_COLUMNS;
  return clampStackGridColumns(Number.parseInt(storedValue, 10));
}

export function writeStackGridColumns(value: number) {
  const columns = clampStackGridColumns(value);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STACK_GRID_COLUMNS_KEY, String(columns));
  }
  return columns;
}
