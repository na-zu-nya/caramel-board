export function addSetValue<T>(previous: ReadonlySet<T> | null | undefined, value: T): Set<T> {
  const next = new Set(previous);
  next.add(value);
  return next;
}

export function removeSetValue<T>(previous: ReadonlySet<T> | null | undefined, value: T): Set<T> {
  const next = new Set(previous);
  next.delete(value);
  return next;
}
