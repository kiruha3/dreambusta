import type { NodeEntry, Range } from "slate";
import { Text } from "slate";

export type DiffStatus = "added" | "removed" | "changed" | "moved";

export interface InlineDiffRange {
  start: number;
  end: number;
  status: DiffStatus;
}

/** Ключ — `path.join(',')`, значение — массив диапазонов внутри text-узла. */
export type InlineDiffMap = Map<string, InlineDiffRange[]>;

/** Тип-маркер на decoration-Range, по которому leaves.tsx отличает diff-leaf от обычного. */
export interface DiffRangeMeta {
  isDiffRange: true;
  diffStatus: DiffStatus;
}

export type DecorateFn = (entry: NodeEntry) => Range[];

/**
 * Decorate-функция, читающая активную карту через ленивый getter.
 * Геттер нужен, чтобы менять карту без пересоздания decorate (и пересоздания мемо в SlateEditor).
 */
export function makeDiffDecorator(getMap: () => InlineDiffMap | null): DecorateFn {
  return function diffDecorate([node, path]: NodeEntry): Range[] {
    if (!Text.isText(node)) return [];
    const map = getMap();
    if (!map || map.size === 0) return [];
    const ranges = map.get(path.join(","));
    if (!ranges || ranges.length === 0) return [];
    const out: Range[] = [];
    for (const r of ranges) {
      if (r.start >= r.end) continue;
      out.push({
        anchor: { path, offset: r.start },
        focus: { path, offset: r.end },
        isDiffRange: true,
        diffStatus: r.status,
      } as Range & DiffRangeMeta);
    }
    return out;
  };
}

/** Композиция нескольких decorate-функций — вызывает все, конкатенирует результат. */
export function composeDecorators(...decs: DecorateFn[]): DecorateFn {
  return (entry: NodeEntry) => {
    const out: Range[] = [];
    for (const d of decs) {
      const r = d(entry);
      if (r.length > 0) out.push(...r);
    }
    return out;
  };
}
