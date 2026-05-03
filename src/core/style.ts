import type { Direction } from "./types.js";

export function getCursorStyle(dir: Direction, atMin: boolean, atMax: boolean): string {
  if (dir === "horizontal") {
    if (atMin) return "e-resize";
    if (atMax) return "w-resize";
    return "ew-resize";
  }
  if (atMin) return "s-resize";
  if (atMax) return "n-resize";
  return "ns-resize";
}

let cursorStyleEl: HTMLStyleElement | null = null;

export function setGlobalCursor(cursor: string): void {
  if (typeof document === "undefined") return;
  if (!cursorStyleEl) {
    cursorStyleEl = document.createElement("style");
    cursorStyleEl.dataset.schism = "cursor";
    document.head.appendChild(cursorStyleEl);
  }
  cursorStyleEl.textContent = `*{cursor:${cursor}!important;user-select:none!important;}`;
}

export function clearGlobalCursor(): void {
  if (cursorStyleEl?.parentNode) cursorStyleEl.parentNode.removeChild(cursorStyleEl);
  cursorStyleEl = null;
}
