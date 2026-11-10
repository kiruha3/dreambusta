import { createContext, useContext } from "react";
import type { DiffStatus } from "./withDiffDecorations";

/**
 * Side-channel для блочной diff-подсветки.
 *
 * Ключ карты — `element.uid` (стабильный, проставляется withUids).
 * Значение — статус: added / removed / changed / moved.
 *
 * Не мутирует Slate-дерево: подсветка живёт в React Context,
 * её можно убрать одной заменой value у Provider.
 *
 * Lookup в каждом блочном компоненте: O(1) (Map.get).
 * findPath НЕ требуется — используем uid из самого element.
 */
export type BlockDiffMap = Map<string, DiffStatus>;

export const DiffBlockContext = createContext<BlockDiffMap | null>(null);

export function useDiffStatusForUid(uid: string | undefined): DiffStatus | undefined {
  const map = useContext(DiffBlockContext);
  if (!uid || !map) return undefined;
  return map.get(uid);
}
