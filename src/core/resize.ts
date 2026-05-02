import { PRECISION } from "./constants.js";
import { compareNumbersWithTolerance } from "./compare.js";
import type { PaneConstraints } from "./types.js";

function adjustForCollapsible(
  size: number,
  collapsible: boolean | undefined,
  collapsedSize: number,
  minSize: number,
): number {
  if (!collapsible) return minSize;
  const halfway = (collapsedSize + minSize) / 2;
  return compareNumbersWithTolerance(size, halfway) < 0 ? collapsedSize : minSize;
}

export function resizePane({
  paneConstraints,
  paneIndex,
  initialSize,
}: {
  paneConstraints: PaneConstraints[];
  paneIndex: number;
  initialSize: number;
}): number {
  const c = paneConstraints[paneIndex];
  if (!c) throw new Error("pane constraints missing");
  const { collapsedSize = 0, collapsible, maxSize = 100, minSize = 0 } = c;

  let s = initialSize;
  if (compareNumbersWithTolerance(s, minSize) < 0) {
    s = adjustForCollapsible(s, collapsible, collapsedSize, minSize);
  }
  s = Math.min(maxSize, s);
  return Number.parseFloat(s.toFixed(PRECISION));
}
