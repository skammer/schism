import { areNumbersAlmostEqual } from "./compare.js";
import { resizePane } from "./resize.js";
import type { PaneConstraints } from "./types.js";

export function defaultLayout(constraints: PaneConstraints[]): number[] {
  const layout = new Array<number>(constraints.length);
  let withSize = 0;
  let remaining = 100;
  for (let i = 0; i < constraints.length; i++) {
    const d = constraints[i]!.defaultSize;
    if (d != null) {
      withSize++;
      layout[i] = d;
      remaining -= d;
    }
  }
  for (let i = 0; i < constraints.length; i++) {
    if (constraints[i]!.defaultSize != null) continue;
    const remainingPanes = constraints.length - withSize;
    const size = remainingPanes > 0 ? remaining / remainingPanes : 0;
    withSize++;
    layout[i] = size;
    remaining -= size;
  }
  return layout;
}

export function validateLayout({
  layout,
  paneConstraints,
}: {
  layout: number[];
  paneConstraints: PaneConstraints[];
}): number[] {
  if (layout.length !== paneConstraints.length) return defaultLayout(paneConstraints);
  const next = [...layout];
  const total = next.reduce((a, b) => a + b, 0);
  if (!areNumbersAlmostEqual(total, 100) && total > 0) {
    for (let i = 0; i < next.length; i++) next[i] = (100 / total) * next[i]!;
  }
  let leftover = 0;
  for (let i = 0; i < paneConstraints.length; i++) {
    const safe = resizePane({ paneConstraints, paneIndex: i, initialSize: next[i]! });
    if (next[i] !== safe) {
      leftover += next[i]! - safe;
      next[i] = safe;
    }
  }
  if (!areNumbersAlmostEqual(leftover, 0)) {
    for (let i = 0; i < paneConstraints.length; i++) {
      const prev = next[i]!;
      const safe = resizePane({ paneConstraints, paneIndex: i, initialSize: prev + leftover });
      if (prev !== safe) {
        leftover -= safe - prev;
        next[i] = safe;
        if (areNumbersAlmostEqual(leftover, 0)) break;
      }
    }
  }
  return next;
}
