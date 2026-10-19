import type { CompassItem } from './types.ts';

// Values and goals have independent identities. A missing item in an older
// profile snapshot is not a deletion; only a dated tombstone removes one.
export function mergeCompassItems(...sources: CompassItem[][]): CompassItem[] {
  const items = new Map<string, CompassItem>();
  for (const source of sources) for (const item of source) {
    if (!item || typeof item.id !== 'string' || typeof item.text !== 'string') continue;
    const previous = items.get(item.id);
    const timestamp = item.updatedAt ?? item.deletedAt ?? '';
    const previousTimestamp = previous?.updatedAt ?? previous?.deletedAt ?? '';
    if (!previous || timestamp > previousTimestamp ||
      (timestamp === previousTimestamp && Boolean(item.deletedAt) && !previous.deletedAt)) {
      items.set(item.id, item);
    }
  }
  return [...items.values()];
}

export function activeCompassItems(items: CompassItem[]): CompassItem[] {
  return items.filter(item => !item.deletedAt);
}
