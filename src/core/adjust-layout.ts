import { areNumbersAlmostEqual, compareNumbersWithTolerance } from "./compare.js";
import { resizePane } from "./resize.js";
import type { PaneConstraints, ResizeTrigger } from "./types.js";

/**
 * Credit: https://github.com/bvaughn/react-resizable-panels (MIT)
 * via paneforge port.
 */
export function adjustLayoutByDelta({
  delta,
  layout: prevLayout,
  paneConstraints,
  pivotIndices,
  trigger,
}: {
  delta: number;
  layout: number[];
  paneConstraints: PaneConstraints[];
  pivotIndices: [number, number];
  trigger: ResizeTrigger;
}): number[] {
  if (areNumbersAlmostEqual(delta, 0)) return prevLayout;

  const nextLayout = [...prevLayout];
  const [firstPivotIndex, secondPivotIndex] = pivotIndices;
  let deltaApplied = 0;

  if (trigger === "keyboard") {
    {
      const idx = delta < 0 ? secondPivotIndex : firstPivotIndex;
      const c = paneConstraints[idx];
      if (c?.collapsible) {
        const prev = prevLayout[idx]!;
        const { collapsedSize = 0, minSize = 0 } = c;
        if (areNumbersAlmostEqual(prev, collapsedSize)) {
          const localDelta = minSize - prev;
          if (compareNumbersWithTolerance(localDelta, Math.abs(delta)) > 0) {
            delta = delta < 0 ? -localDelta : localDelta;
          }
        }
      }
    }
    {
      const idx = delta < 0 ? firstPivotIndex : secondPivotIndex;
      const c = paneConstraints[idx];
      if (c?.collapsible) {
        const prev = prevLayout[idx]!;
        const { collapsedSize = 0, minSize = 0 } = c;
        if (areNumbersAlmostEqual(prev, minSize)) {
          const localDelta = prev - collapsedSize;
          if (compareNumbersWithTolerance(localDelta, Math.abs(delta)) > 0) {
            delta = delta < 0 ? -localDelta : localDelta;
          }
        }
      }
    }
  }

  {
    const increment = delta < 0 ? 1 : -1;
    let index = delta < 0 ? secondPivotIndex : firstPivotIndex;
    let maxAvailableDelta = 0;
    while (true) {
      const prev = prevLayout[index]!;
      const maxSafe = resizePane({ paneConstraints, paneIndex: index, initialSize: 100 });
      maxAvailableDelta += maxSafe - prev;
      index += increment;
      if (index < 0 || index >= paneConstraints.length) break;
    }
    const minAbs = Math.min(Math.abs(delta), Math.abs(maxAvailableDelta));
    delta = delta < 0 ? -minAbs : minAbs;
  }

  {
    const pivotIndex = delta < 0 ? firstPivotIndex : secondPivotIndex;
    let index = pivotIndex;
    while (index >= 0 && index < paneConstraints.length) {
      const remaining = Math.abs(delta) - Math.abs(deltaApplied);
      const prev = prevLayout[index]!;
      const safe = resizePane({
        paneConstraints,
        paneIndex: index,
        initialSize: prev - remaining,
      });
      if (!areNumbersAlmostEqual(prev, safe)) {
        deltaApplied += prev - safe;
        nextLayout[index] = safe;
        if (
          deltaApplied
            .toPrecision(3)
            .localeCompare(Math.abs(delta).toPrecision(3), undefined, { numeric: true }) >= 0
        ) {
          break;
        }
      }
      if (delta < 0) index--;
      else index++;
    }
  }

  if (areNumbersAlmostEqual(deltaApplied, 0)) return prevLayout;

  {
    const pivotIndex = delta < 0 ? secondPivotIndex : firstPivotIndex;
    const prev = prevLayout[pivotIndex]!;
    const unsafe = prev + deltaApplied;
    const safe = resizePane({ paneConstraints, paneIndex: pivotIndex, initialSize: unsafe });
    nextLayout[pivotIndex] = safe;

    if (!areNumbersAlmostEqual(safe, unsafe)) {
      let remaining = unsafe - safe;
      let index = delta < 0 ? secondPivotIndex : firstPivotIndex;
      while (index >= 0 && index < paneConstraints.length) {
        const prev2 = nextLayout[index]!;
        const safe2 = resizePane({
          paneConstraints,
          paneIndex: index,
          initialSize: prev2 + remaining,
        });
        if (!areNumbersAlmostEqual(prev2, safe2)) {
          remaining -= safe2 - prev2;
          nextLayout[index] = safe2;
        }
        if (areNumbersAlmostEqual(remaining, 0)) break;
        if (delta > 0) index--;
        else index++;
      }
    }
  }

  const total = nextLayout.reduce((a, b) => a + b, 0);
  if (!areNumbersAlmostEqual(total, 100)) return prevLayout;
  return nextLayout;
}
