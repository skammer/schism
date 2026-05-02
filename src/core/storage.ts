import { STORAGE_DEBOUNCE_MS, STORAGE_KEY_PREFIX } from "./constants.js";
import type { PaneGroupStorage, PaneRecord } from "./types.js";

export interface PaneConfigState {
  layout: number[];
  expandToSizes: { [paneId: string]: number };
}
export type SerializedPaneGroupState = { [paneKey: string]: PaneConfigState };

export const defaultStorage: PaneGroupStorage = {
  getItem(name) {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem(name, value) {
    try {
      localStorage.setItem(name, value);
    } catch {
      // ignore
    }
  },
};

function groupKey(autoSaveId: string): string {
  return `${STORAGE_KEY_PREFIX}${autoSaveId}`;
}

function paneKey(panes: PaneRecord[]): string {
  return panes
    .map((p) =>
      p.order != null
        ? `${p.order}:${JSON.stringify(p.constraints)}`
        : JSON.stringify(p.constraints),
    )
    .sort()
    .join(",");
}

function loadState(autoSaveId: string, storage: PaneGroupStorage): SerializedPaneGroupState {
  try {
    const raw = storage.getItem(groupKey(autoSaveId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as SerializedPaneGroupState;
  } catch {
    // ignore
  }
  return {};
}

export function loadPaneGroup(
  autoSaveId: string,
  panes: PaneRecord[],
  storage: PaneGroupStorage,
): PaneConfigState | null {
  const state = loadState(autoSaveId, storage);
  return state[paneKey(panes)] ?? null;
}

const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export function savePaneGroup({
  autoSaveId,
  panes,
  layout,
  expandToSizes,
  storage,
}: {
  autoSaveId: string;
  panes: PaneRecord[];
  layout: number[];
  expandToSizes: Map<string, number>;
  storage: PaneGroupStorage;
}): void {
  if (layout.length === 0 || layout.length !== panes.length) return;
  const snapPanes = [...panes];
  const snapMap = new Map(expandToSizes);
  const snapLayout = [...layout];

  const existing = debounceTimers[autoSaveId];
  if (existing) clearTimeout(existing);

  debounceTimers[autoSaveId] = setTimeout(() => {
    delete debounceTimers[autoSaveId];
    const state = loadState(autoSaveId, storage);
    state[paneKey(snapPanes)] = {
      layout: snapLayout,
      expandToSizes: Object.fromEntries(snapMap),
    };
    try {
      storage.setItem(groupKey(autoSaveId), JSON.stringify(state));
    } catch {
      // ignore
    }
  }, STORAGE_DEBOUNCE_MS);
}
