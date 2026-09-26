// Pure snapshot logic, kept free of API imports so node:test can load it.

export interface SnapshotPhase {
  id?: string;
  fix?: string;
  phase?: 'before' | 'after';
}

export interface SnapshotData {
  data?: Record<string, unknown>;
}

/** Newest "after" snapshot and the "before" snapshot of the same fix, if they are the two latest. */
export function latestFixPair<T extends SnapshotPhase>(snaps: T[]): [T, T] | null {
  const [after, before] = snaps;
  return after?.phase === 'after' && before?.phase === 'before' && after.fix === before.fix ? [before, after] : null;
}

/** Structural diff: returns lines like `users + {"Name":"x"}` / `roles - {...}` / `tasks ~ ...` */
export function diffConfigs(a: SnapshotData, b: SnapshotData) {
  const lines: { section: string; kind: '+' | '-' | '~'; text: string }[] = [];
  const itemKey = (v: unknown) => {
    const r = v as Record<string, unknown>;
    return String(r?.Name ?? r?.Id ?? r?.name ?? JSON.stringify(v));
  };
  const da = a.data ?? {};
  const db = b.data ?? {};
  for (const section of new Set([...Object.keys(da), ...Object.keys(db)])) {
    const va = da[section];
    const vb = db[section];
    if (Array.isArray(va) && Array.isArray(vb)) {
      const ma = new Map(va.map((x) => [itemKey(x), x]));
      const mb = new Map(vb.map((x) => [itemKey(x), x]));
      for (const [k, v] of mb) {
        if (!ma.has(k)) lines.push({ section, kind: '+', text: `${k}: ${JSON.stringify(v).slice(0, 140)}` });
        else if (JSON.stringify(ma.get(k)) !== JSON.stringify(v)) lines.push({ section, kind: '~', text: `${k} changed` });
      }
      for (const [k, v] of ma) {
        if (!mb.has(k)) lines.push({ section, kind: '-', text: `${k}: ${JSON.stringify(v).slice(0, 140)}` });
      }
    } else if (JSON.stringify(va) !== JSON.stringify(vb)) {
      lines.push({ section, kind: '~', text: 'configuration changed' });
    }
  }
  return lines;
}
