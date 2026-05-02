import { adjustLayoutByDelta } from "./core/adjust-layout.js";
import { calculateAriaValues } from "./core/aria.js";
import { areArraysEqual, areNumbersAlmostEqual } from "./core/compare.js";
import { DEFAULT_KEYBOARD_STEP } from "./core/constants.js";
import { defaultLayout, validateLayout } from "./core/layout.js";
import { resizePane } from "./core/resize.js";
import { clearGlobalCursor, getCursorStyle, setGlobalCursor } from "./core/style.js";
import { defaultStorage, loadPaneGroup, savePaneGroup } from "./core/storage.js";
import type { Direction, PaneConstraints, PaneRecord, PaneGroupStorage } from "./core/types.js";
import { sizeToPercent } from "./core/units.js";
import type { SplitPaneElement } from "./split-pane.js";
import type { SplitResizerElement } from "./split-resizer.js";

interface DragState {
  pointerId: number;
  resizer: SplitResizerElement;
  pivotIndices: [number, number];
  initialCursor: number;
  initialLayout: number[];
  groupSizePx: number;
}

export class SplitGroupElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["direction", "save-id", "keyboard-resize-by"];
  }

  groupId: string = `g-${Math.random().toString(36).slice(2, 9)}`;
  storage: PaneGroupStorage = defaultStorage;

  #panes: SplitPaneElement[] = [];
  #resizers: SplitResizerElement[] = [];
  #layout: number[] = [];
  #expandToSizes = new Map<string, number>();
  #lastNotifiedSizes: Record<string, number> = {};
  #drag: DragState | null = null;
  #ro: ResizeObserver | null = null;
  #scanScheduled = false;
  #suppressSave = false;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      :host{display:flex;flex-direction:row;width:100%;height:100%;overflow:hidden;}
      :host([direction="vertical"]){flex-direction:column;}
      :host([data-dragging]) ::slotted(split-pane){pointer-events:none;}
    </style><slot></slot>`;

    this.addEventListener("split-pane-connect", this.#onChildChange);
    this.addEventListener("split-pane-disconnect", this.#onChildChange);
    this.addEventListener("split-pane-change", this.#onChildChange);
    this.addEventListener("split-resizer-connect", this.#onChildChange);
    this.addEventListener("split-resizer-disconnect", this.#onChildChange);
    this.addEventListener("split-resizer-change", this.#onChildChange);

    // Pointer + keyboard delegated to the group (event.target is the resizer).
    this.addEventListener("pointerdown", this.#onPointerDown);
    this.addEventListener("keydown", this.#onKeyDown);
  }

  connectedCallback(): void {
    this.setAttribute("data-pane-group", "");
    this.setAttribute("data-pane-group-id", this.groupId);
    if (!this.hasAttribute("direction")) this.setAttribute("direction", "horizontal");
    this.#scheduleScan();
    this.#ro = new ResizeObserver(() => this.#onGroupResize());
    this.#ro.observe(this);
  }

  disconnectedCallback(): void {
    this.#ro?.disconnect();
    this.#ro = null;
    this.#endDrag();
  }

  attributeChangedCallback(name: string): void {
    if (!this.isConnected) return;
    if (name === "direction") {
      this.#updateAria();
    }
    if (name === "save-id") {
      this.#scheduleScan();
    }
  }

  // ---------- public API ----------

  get direction(): Direction {
    return this.getAttribute("direction") === "vertical" ? "vertical" : "horizontal";
  }

  getLayout(): number[] {
    return [...this.#layout];
  }

  setLayout(next: number[]): void {
    if (next.length !== this.#panes.length) return;
    const validated = validateLayout({ layout: next, paneConstraints: this.#constraints() });
    this.#applyLayout(validated, "imperative-api");
  }

  getPaneSize(p: SplitPaneElement): number {
    const i = this.#panes.indexOf(p);
    return i < 0 ? 0 : this.#layout[i] ?? 0;
  }

  resizePane(p: SplitPaneElement, percent: number): void {
    const i = this.#panes.indexOf(p);
    if (i < 0) return;
    const isLast = i === this.#panes.length - 1;
    const pivots: [number, number] = isLast ? [i - 1, i] : [i, i + 1];
    const c = this.#constraints();
    const cur = this.#layout[i] ?? 0;
    const target = resizePane({ paneConstraints: c, paneIndex: i, initialSize: percent });
    const delta = isLast ? cur - target : target - cur;
    const next = adjustLayoutByDelta({
      delta,
      layout: this.#layout,
      paneConstraints: c,
      pivotIndices: pivots,
      trigger: "imperative-api",
    });
    this.#applyLayout(next, "imperative-api");
  }

  collapsePane(p: SplitPaneElement): void {
    const i = this.#panes.indexOf(p);
    if (i < 0) return;
    const c = this.#constraints();
    if (!c[i]?.collapsible) return;
    const cur = this.#layout[i] ?? 0;
    const collapsed = c[i]?.collapsedSize ?? 0;
    if (areNumbersAlmostEqual(cur, collapsed)) return;
    this.#expandToSizes.set(p.paneId, cur);
    this.resizePane(p, collapsed);
  }

  expandPane(p: SplitPaneElement, toSize?: number): void {
    const i = this.#panes.indexOf(p);
    if (i < 0) return;
    const c = this.#constraints();
    if (!c[i]?.collapsible) return;
    const cur = this.#layout[i] ?? 0;
    const collapsed = c[i]?.collapsedSize ?? 0;
    if (!areNumbersAlmostEqual(cur, collapsed)) return;
    const stored = this.#expandToSizes.get(p.paneId);
    const min = c[i]?.minSize ?? 0;
    const target = toSize ?? stored ?? min;
    this.resizePane(p, target);
  }

  // ---------- discovery / registration ----------

  #onChildChange = (): void => {
    this.#scheduleScan();
  };

  #scheduleScan(): void {
    if (this.#scanScheduled) return;
    this.#scanScheduled = true;
    queueMicrotask(() => {
      this.#scanScheduled = false;
      this.#scan();
    });
  }

  #scan(): void {
    const panes: SplitPaneElement[] = [];
    const resizers: SplitResizerElement[] = [];
    for (const child of Array.from(this.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "split-pane") panes.push(child as SplitPaneElement);
      else if (tag === "split-resizer") resizers.push(child as SplitResizerElement);
    }
    // Sort by `order` attribute (numeric); keep DOM order for ties.
    panes.sort((a, b) => {
      const oa = a.hasAttribute("order") ? Number(a.getAttribute("order")) : Number.POSITIVE_INFINITY;
      const ob = b.hasAttribute("order") ? Number(b.getAttribute("order")) : Number.POSITIVE_INFINITY;
      if (oa === ob) return 0;
      return oa - ob;
    });

    const panesChanged =
      panes.length !== this.#panes.length || panes.some((p, i) => p !== this.#panes[i]);
    this.#panes = panes;
    this.#resizers = resizers;

    if (panes.length === 0) {
      this.#layout = [];
      this.#updateAria();
      return;
    }

    const constraints = this.#constraints();
    let next: number[];
    const saveId = this.getAttribute("save-id");
    if (panesChanged || this.#layout.length !== panes.length) {
      let initial: number[] | null = null;
      if (saveId) {
        const records = this.#paneRecords();
        const loaded = loadPaneGroup(saveId, records, this.storage);
        if (loaded?.layout?.length === panes.length) {
          initial = loaded.layout;
          if (loaded.expandToSizes) {
            this.#expandToSizes = new Map(Object.entries(loaded.expandToSizes));
          }
        }
      }
      next = validateLayout({
        layout: initial ?? defaultLayout(constraints),
        paneConstraints: constraints,
      });
      this.#suppressSave = true;
    } else {
      next = validateLayout({ layout: this.#layout, paneConstraints: constraints });
    }

    this.#applyLayout(next, "imperative-api");
    this.#suppressSave = false;
  }

  #paneRecords(): PaneRecord[] {
    return this.#panes.map((p) => ({
      id: p.paneId,
      order: p.hasAttribute("order") ? Number(p.getAttribute("order")) : undefined,
      constraints: this.#paneConstraints(p),
      element: p,
    }));
  }

  #constraints(): PaneConstraints[] {
    return this.#panes.map((p) => this.#paneConstraints(p));
  }

  #paneConstraints(p: SplitPaneElement): PaneConstraints {
    const groupPx = this.#groupSize();
    const min = sizeToPercent(p.getAttribute("min-size"), groupPx, this) ?? 0;
    const max = sizeToPercent(p.getAttribute("max-size"), groupPx, this) ?? 100;
    const def = sizeToPercent(p.getAttribute("default-size"), groupPx, this);
    const collapsedSize = sizeToPercent(p.getAttribute("collapsed-size"), groupPx, this) ?? 0;
    const collapsible = p.hasAttribute("collapsible");
    const result: PaneConstraints = {
      minSize: clamp(min, 0, 100),
      maxSize: clamp(max, 0, 100),
      collapsible,
      collapsedSize: clamp(collapsedSize, 0, 100),
    };
    if (def != null) result.defaultSize = clamp(def, 0, 100);
    return result;
  }

  #groupSize(): number {
    const r = this.getBoundingClientRect();
    return this.direction === "horizontal" ? r.width : r.height;
  }

  // ---------- layout application ----------

  #applyLayout(next: number[], trigger: "pointer" | "keyboard" | "imperative-api"): void {
    const changed = !areArraysEqual(this.#layout, next);
    this.#layout = next;

    for (let i = 0; i < this.#panes.length; i++) {
      const p = this.#panes[i]!;
      const size = next[i] ?? 0;
      p.style.flexBasis = "0";
      p.style.flexGrow = String(size);
      p.style.flexShrink = "1";

      // Collapsed/expanded data attrs
      const c = this.#paneConstraints(p);
      const collapsed = c.collapsedSize ?? 0;
      const isCollapsed = c.collapsible && areNumbersAlmostEqual(size, collapsed);
      if (isCollapsed) {
        p.setAttribute("data-collapsed", "");
        p.removeAttribute("data-expanded");
      } else {
        p.removeAttribute("data-collapsed");
        p.setAttribute("data-expanded", "");
      }
    }

    this.#updateAria();

    if (changed) {
      this.#fireResizeEvents(next);
      this.dispatchEvent(
        new CustomEvent("layout-change", {
          detail: { layout: [...next] },
          bubbles: true,
        }),
      );
      const saveId = this.getAttribute("save-id");
      if (saveId && !this.#suppressSave) {
        savePaneGroup({
          autoSaveId: saveId,
          panes: this.#paneRecords(),
          layout: next,
          expandToSizes: this.#expandToSizes,
          storage: this.storage,
        });
      }
    }
  }

  #fireResizeEvents(layout: number[]): void {
    for (let i = 0; i < this.#panes.length; i++) {
      const pane = this.#panes[i]!;
      const size = layout[i]!;
      const last = this.#lastNotifiedSizes[pane.paneId];
      if (last != null && areNumbersAlmostEqual(size, last)) continue;
      const c = this.#paneConstraints(pane);
      const collapsed = c.collapsedSize ?? 0;

      pane.dispatchEvent(
        new CustomEvent("resize", { detail: { size, prevSize: last } }),
      );

      if (c.collapsible) {
        const wasCollapsed = last != null && areNumbersAlmostEqual(last, collapsed);
        const nowCollapsed = areNumbersAlmostEqual(size, collapsed);
        if (!wasCollapsed && nowCollapsed) {
          // Remember previous size so a future expand can restore it.
          if (last != null && !areNumbersAlmostEqual(last, collapsed)) {
            this.#expandToSizes.set(pane.paneId, last);
          }
          pane.dispatchEvent(new CustomEvent("collapse"));
        } else if ((last == null || wasCollapsed) && !nowCollapsed && last != null) {
          pane.dispatchEvent(new CustomEvent("expand"));
        }
      }

      this.#lastNotifiedSizes[pane.paneId] = size;
    }
  }

  #updateAria(): void {
    const orientation = this.direction === "horizontal" ? "vertical" : "horizontal";
    const records = this.#paneRecords();
    for (let i = 0; i < this.#resizers.length; i++) {
      const r = this.#resizers[i]!;
      if (i >= this.#panes.length - 1) {
        r.removeAttribute("aria-controls");
        r.removeAttribute("aria-valuemax");
        r.removeAttribute("aria-valuemin");
        r.removeAttribute("aria-valuenow");
        continue;
      }
      const before = this.#panes[i]!;
      const { valueMax, valueMin, valueNow } = calculateAriaValues({
        layout: this.#layout,
        panes: records,
        pivotIndices: [i, i + 1],
      });
      r.setAttribute("aria-orientation", orientation);
      r.setAttribute("aria-controls", before.paneId);
      r.setAttribute("aria-valuemax", String(Math.round(valueMax)));
      r.setAttribute("aria-valuemin", String(Math.round(valueMin)));
      if (valueNow != null) r.setAttribute("aria-valuenow", String(Math.round(valueNow)));
    }
  }

  #onGroupResize(): void {
    if (this.#panes.length === 0) return;
    if (this.#drag) return; // don't re-validate mid-drag
    const next = validateLayout({
      layout: this.#layout.length === this.#panes.length ? this.#layout : defaultLayout(this.#constraints()),
      paneConstraints: this.#constraints(),
    });
    this.#applyLayout(next, "imperative-api");
  }

  // ---------- pointer drag ----------

  #onPointerDown = (e: PointerEvent): void => {
    const target = e.target as Element | null;
    const resizer = target?.closest("split-resizer") as SplitResizerElement | null;
    if (!resizer || resizer.parentElement !== this) return;
    if (resizer.hasAttribute("disabled")) return;
    const idx = this.#resizers.indexOf(resizer);
    if (idx < 0 || idx >= this.#panes.length - 1) return;

    e.preventDefault();
    resizer.focus();
    resizer.setPointerCapture(e.pointerId);

    const groupRect = this.getBoundingClientRect();
    this.#drag = {
      pointerId: e.pointerId,
      resizer,
      pivotIndices: [idx, idx + 1],
      initialCursor: this.direction === "horizontal" ? e.clientX : e.clientY,
      initialLayout: [...this.#layout],
      groupSizePx: this.direction === "horizontal" ? groupRect.width : groupRect.height,
    };
    this.setAttribute("data-dragging", "");
    resizer.setAttribute("data-active", "pointer");
    setGlobalCursor(getCursorStyle(this.direction, false, false));

    this.dispatchEvent(
      new CustomEvent("dragging-change", { detail: { dragging: true } }),
    );

    resizer.addEventListener("pointermove", this.#onPointerMove);
    resizer.addEventListener("pointerup", this.#onPointerUp);
    resizer.addEventListener("pointercancel", this.#onPointerUp);
    resizer.addEventListener("lostpointercapture", this.#onPointerUp);
  };

  #onPointerMove = (e: PointerEvent): void => {
    if (!this.#drag || e.pointerId !== this.#drag.pointerId) return;
    const cursor = this.direction === "horizontal" ? e.clientX : e.clientY;
    const offsetPx = cursor - this.#drag.initialCursor;
    let deltaPercent =
      this.#drag.groupSizePx > 0 ? (offsetPx / this.#drag.groupSizePx) * 100 : 0;
    if (
      this.direction === "horizontal" &&
      getComputedStyle(this).direction === "rtl"
    ) {
      deltaPercent = -deltaPercent;
    }
    const constraints = this.#constraints();
    const next = adjustLayoutByDelta({
      delta: deltaPercent,
      layout: this.#drag.initialLayout,
      paneConstraints: constraints,
      pivotIndices: this.#drag.pivotIndices,
      trigger: "pointer",
    });

    // Edge cursor feedback when user pushes past constraints.
    const [pi] = this.#drag.pivotIndices;
    const cur = next[pi]!;
    const { valueMin, valueMax } = calculateAriaValues({
      layout: next,
      panes: this.#paneRecords(),
      pivotIndices: this.#drag.pivotIndices,
    });
    const atMin = areNumbersAlmostEqual(cur, valueMin);
    const atMax = areNumbersAlmostEqual(cur, valueMax);
    setGlobalCursor(getCursorStyle(this.direction, atMin, atMax));

    this.#applyLayout(next, "pointer");
  };

  #onPointerUp = (e: PointerEvent): void => {
    if (!this.#drag || e.pointerId !== this.#drag.pointerId) return;
    this.#endDrag();
  };

  #endDrag(): void {
    if (!this.#drag) return;
    const { resizer } = this.#drag;
    try {
      resizer.releasePointerCapture(this.#drag.pointerId);
    } catch {
      // ignore
    }
    resizer.removeEventListener("pointermove", this.#onPointerMove);
    resizer.removeEventListener("pointerup", this.#onPointerUp);
    resizer.removeEventListener("pointercancel", this.#onPointerUp);
    resizer.removeEventListener("lostpointercapture", this.#onPointerUp);
    resizer.removeAttribute("data-active");
    this.removeAttribute("data-dragging");
    clearGlobalCursor();
    this.#drag = null;
    this.dispatchEvent(
      new CustomEvent("dragging-change", { detail: { dragging: false } }),
    );
  }

  // ---------- keyboard ----------

  #onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as Element | null;
    const resizer = target?.closest("split-resizer") as SplitResizerElement | null;
    if (!resizer || resizer.parentElement !== this) return;
    if (resizer.hasAttribute("disabled")) return;
    const idx = this.#resizers.indexOf(resizer);
    if (idx < 0 || idx >= this.#panes.length - 1) return;

    const isHorizontal = this.direction === "horizontal";
    const stepAttr = this.getAttribute("keyboard-resize-by");
    const step = stepAttr != null ? Number(stepAttr) : DEFAULT_KEYBOARD_STEP;
    const big = e.shiftKey ? 100 : step;

    let movement = 0;
    switch (e.key) {
      case "ArrowDown":
        movement = isHorizontal ? 0 : big;
        break;
      case "ArrowUp":
        movement = isHorizontal ? 0 : -big;
        break;
      case "ArrowLeft":
        movement = isHorizontal ? -big : 0;
        break;
      case "ArrowRight":
        movement = isHorizontal ? big : 0;
        break;
      case "Home":
        movement = -100;
        break;
      case "End":
        movement = 100;
        break;
      case "Enter": {
        // Toggle collapse on the leading pane if collapsible.
        const leading = this.#panes[idx]!;
        const c = this.#paneConstraints(leading);
        if (c.collapsible) {
          if (leading.isCollapsed()) this.expandPane(leading);
          else this.collapsePane(leading);
          e.preventDefault();
        }
        return;
      }
      case "F6": {
        e.preventDefault();
        const next = e.shiftKey ? idx - 1 : idx + 1;
        const wrapped = ((next % this.#resizers.length) + this.#resizers.length) %
          this.#resizers.length;
        this.#resizers[wrapped]?.focus();
        return;
      }
      default:
        return;
    }

    if (
      isHorizontal &&
      getComputedStyle(this).direction === "rtl" &&
      (e.key === "ArrowLeft" || e.key === "ArrowRight")
    ) {
      movement = -movement;
    }

    e.preventDefault();
    resizer.setAttribute("data-active", "keyboard");
    const constraints = this.#constraints();
    const next = adjustLayoutByDelta({
      delta: movement,
      layout: this.#layout,
      paneConstraints: constraints,
      pivotIndices: [idx, idx + 1],
      trigger: "keyboard",
    });
    this.#applyLayout(next, "keyboard");
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
