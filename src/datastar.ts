/**
 * Optional Datastar helpers for `<split-group>`.
 *
 * The web component already plays well with Datastar via standard attributes:
 *   <split-group data-on-layout-change="$layout = evt.detail.layout">
 *
 * This file adds a tiny two-way `bindLayoutSignal` helper for cases where the
 * outer code controls the layout via a signal and also wants live updates.
 */

import "./index.js";
import type { SplitGroupElement } from "./split-group.js";
import { areArraysEqual } from "./core/compare.js";

/**
 * Two-way bind a Datastar signal to a split-group's layout.
 *
 * @example
 *   const ds = window.ds; // the global Datastar instance
 *   const group = document.querySelector("split-group");
 *   bindLayoutSignal(group, ds.signals.path("layout"));
 */
export interface SignalLike<T> {
  get: () => T;
  set: (next: T) => void;
  subscribe: (cb: (v: T) => void) => () => void;
}

export function bindLayoutSignal(
  group: SplitGroupElement,
  signal: SignalLike<number[]>,
): () => void {
  let updating = false;

  const initial = signal.get();
  if (Array.isArray(initial) && initial.length > 0) {
    queueMicrotask(() => {
      updating = true;
      group.setLayout(initial);
      updating = false;
    });
  }

  const onLayoutChange = (e: Event): void => {
    if (updating) return;
    const layout = (e as CustomEvent<{ layout: number[] }>).detail.layout;
    const cur = signal.get();
    if (Array.isArray(cur) && areArraysEqual(cur, layout)) return;
    updating = true;
    signal.set([...layout]);
    updating = false;
  };

  group.addEventListener("layout-change", onLayoutChange);

  const unsubscribe = signal.subscribe((next) => {
    if (updating) return;
    if (!Array.isArray(next) || next.length === 0) return;
    if (areArraysEqual(group.getLayout(), next)) return;
    updating = true;
    group.setLayout(next);
    updating = false;
  });

  return () => {
    group.removeEventListener("layout-change", onLayoutChange);
    unsubscribe();
  };
}
