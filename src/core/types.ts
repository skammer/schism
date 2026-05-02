export type Direction = "horizontal" | "vertical";

export interface PaneConstraints {
  minSize?: number;
  maxSize?: number;
  defaultSize?: number;
  collapsible?: boolean;
  collapsedSize?: number;
}

export type ResizeTrigger = "imperative-api" | "keyboard" | "pointer";

export interface PaneRecord {
  id: string;
  order: number | undefined;
  constraints: PaneConstraints;
  element: HTMLElement;
}

export interface DragState {
  dragHandleId: string;
  initialCursor: number;
  initialLayout: number[];
}

export interface PaneGroupStorage {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
}
