import type { PaneRecord } from "./types.js";

export function calculateAriaValues({
  layout,
  panes,
  pivotIndices,
}: {
  layout: number[];
  panes: PaneRecord[];
  pivotIndices: [number, number];
}): { valueMin: number; valueMax: number; valueNow: number | undefined } {
  const firstIndex = pivotIndices[0];
  let curMin = 0;
  let curMax = 100;
  let totalMin = 0;
  let totalMax = 0;
  for (let i = 0; i < panes.length; i++) {
    const { maxSize = 100, minSize = 0 } = panes[i]!.constraints;
    if (i === firstIndex) {
      curMin = minSize;
      curMax = maxSize;
    } else {
      totalMin += minSize;
      totalMax += maxSize;
    }
  }
  return {
    valueMax: Math.min(curMax, 100 - totalMin),
    valueMin: Math.max(curMin, 100 - totalMax),
    valueNow: layout[firstIndex],
  };
}
