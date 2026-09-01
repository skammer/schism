import { adjustLayoutByDelta } from "./core/adjust-layout.js";
import { calculateAriaValues } from "./core/aria.js";
import { areArraysEqual, areNumbersAlmostEqual } from "./core/compare.js";
import { DEFAULT_KEYBOARD_STEP } from "./core/constants.js";
import { defaultLayout, validateLayout } from "./core/layout.js";
import { resizePane } from "./core/resize.js";
import { clearGlobalCursor, getCursorStyle, setGlobalCursor } from "./core/style.js";
import { defaultStorage, loadPaneGroup, savePaneGroup } from "./core/storage.js";
import type { Direction, PaneConstraints, PaneRecord, PaneGroupStorage } from "./core/types.js";
import { sizeToPercent, sizeToPixels } from "./core/units.js";
import type { SchismPaneElement } from "./schism-pane.js";
import type { SchismResizerElement } from "./schism-resizer.js";

interface DragState {
  pointerId: number;
  resizer: SchismResizerElement;
  pivotIndices: [number, number];
  initialCursor: number;
  initialLayout: number[];
  groupSizePx: number;
}

type ApplyTrigger = "pointer" | "keyboard" | "imperative-api" | "container-resize";

export class SchismGroupElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["direction", "save-id", "keyboard-resize-by"];
  }

  groupId: string = `g-${Math.random().toString(36).slice(2, 9)}`;
  storage: PaneGroupStorage = defaultStorage;

  #panes: SchismPaneElement[] = [];
  #resizers: SchismResizerElement[] = [];
  #layout: number[] = [];
  #expandToSizes = new Map<string, number>();
  #fixedSizesPx = new Map<string, number>();
  #lastNotifiedSizes: Record<string, number> = {};
  // Last seen value of each pane's `collapsed` attribute, so the attribute is
  // EDGE-triggered: only a change of the attribute collapses/expands. A pane
  // collapsed by dragging (attribute absent throughout) is never re-expanded
  // by an unrelated rescan.
  #seenCollapsedAttr = new Map<string, boolean>();
  #drag: DragState | null = null;
  #ro: ResizeObserver | null = null;
  #scanScheduled = false;
  #suppressSave = false;
  #hasAppliedLayout = false;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      :host{display:flex;flex-direction:row;width:100%;height:100%;overflow:hidden;}
      :host([direction="vertical"]){flex-direction:column;}
      :host([data-dragging]) ::slotted(schism-pane){pointer-events:none;}
    </style><slot></slot>`;

    this.addEventListener("schism-pane-connect", this.#onChildChange);
    this.addEventListener("schism-pane-disconnect", this.#onChildChange);
    this.addEventListener("schism-pane-change", this.#onChildChange);
    this.addEventListener("schism-resizer-connect", this.#onChildChange);
    this.addEventListener("schism-resizer-disconnect", this.#onChildChange);
    this.addEventListener("schism-resizer-change", this.#onChildChange);

    // Pointer + keyboard delegated to the group (event.target is the resizer).
    this.addEventListener("pointerdown", this.#onPointerDown);
    this.addEventListener("dblclick", this.#onDoubleClick);
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

  getPaneSize(p: SchismPaneElement): number {
    const i = this.#panes.indexOf(p);
    return i < 0 ? 0 : this.#layout[i] ?? 0;
  }

  resizePane(p: SchismPaneElement, percent: number): void {
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

  collapsePane(p: SchismPaneElement): void {
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

  expandPane(p: SchismPaneElement, toSize?: number): void {
    const i = this.#panes.indexOf(p);
    if (i < 0) return;
    const c = this.#constraints();
    if (!c[i]?.collapsible) return;
    const cur = this.#layout[i] ?? 0;
    const collapsed = c[i]?.collapsedSize ?? 0;
    if (!areNumbersAlmostEqual(cur, collapsed)) return;
    const stored = this.#expandToSizes.get(p.paneId);
    const min = c[i]?.minSize ?? 0;
    const target = toSize ?? this.#fixedSizePercent(p) ?? stored ?? min;
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
    const panes: SchismPaneElement[] = [];
    const resizers: SchismResizerElement[] = [];
    for (const child of Array.from(this.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "schism-pane") panes.push(child as SchismPaneElement);
      else if (tag === "schism-resizer") resizers.push(child as SchismResizerElement);
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
          if (loaded.fixedSizesPx) {
            this.#fixedSizesPx = new Map(
              Object.entries(loaded.fixedSizesPx).map(([id, px]) => [id, Number(px)]),
            );
          }
        }
      }
      this.#syncFixedSizes(initial ?? undefined);
      next = validateLayout({
        layout: this.#layoutWithFixedSizes(initial ?? defaultLayout(constraints), constraints),
        paneConstraints: constraints,
      });
      this.#suppressSave = true;
    } else {
      this.#syncFixedSizes(this.#layout);
      next = validateLayout({
        layout: this.#layoutWithFixedSizes(this.#layout, constraints),
        paneConstraints: constraints,
      });
    }

    this.#applyLayout(next, "imperative-api");
    this.#suppressSave = false;
    this.#reconcileCollapsedAttrs();
  }

  /**
   * Apply declarative `collapsed` attributes (edge-triggered; see the field
   * comment on #seenCollapsedAttr). Runs after every scan, so both initial
   * mount and later attribute flips (e.g. a Datastar `data-attr:collapsed`
   * binding) are honored without fighting drag-driven state.
   */
  #reconcileCollapsedAttrs(): void {
    const current = new Set(this.#panes.map((p) => p.paneId));
    for (const id of this.#seenCollapsedAttr.keys()) {
      if (!current.has(id)) this.#seenCollapsedAttr.delete(id);
    }
    for (const p of this.#panes) {
      const want = p.hasAttribute("collapsed");
      const last = this.#seenCollapsedAttr.get(p.paneId);
      this.#seenCollapsedAttr.set(p.paneId, want);
      if (last === undefined) {
        // Initial sighting: only force the non-default state. A pane restored
        // collapsed from storage stays collapsed even without the attribute.
        if (want && !p.isCollapsed()) this.collapsePane(p);
        continue;
      }
      if (want === last) continue;
      if (want) this.collapsePane(p);
      else this.expandPane(p);
    }
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

  #paneConstraints(p: SchismPaneElement): PaneConstraints {
    const groupPx = this.#groupSize();
    const min = sizeToPercent(p.getAttribute("min-size"), groupPx, this) ?? 0;
    const max = sizeToPercent(p.getAttribute("max-size"), groupPx, this) ?? 100;
    const def = sizeToPercent(p.getAttribute("default-size"), groupPx, this);
    const collapsedSize = sizeToPercent(p.getAttribute("collapsed-size"), groupPx, this) ?? 0;
    const collapsible = p.hasAttribute("collapsible");
    const sizeMode = p.getAttribute("size-mode") === "fixed" ? "fixed" : "fluid";
    const result: PaneConstraints = {
      minSize: clamp(min, 0, 100),
      maxSize: clamp(max, 0, 100),
      collapsible,
      collapsedSize: clamp(collapsedSize, 0, 100),
      sizeMode,
    };
    if (def != null) result.defaultSize = clamp(def, 0, 100);
    return result;
  }

  #groupSize(): number {
    const r = this.getBoundingClientRect();
    return this.direction === "horizontal" ? r.width : r.height;
  }

  // ---------- layout application ----------

  #applyLayout(next: number[], trigger: ApplyTrigger): void {
    const changed = !areArraysEqual(this.#layout, next);
    this.#layout = next;
    if (trigger !== "container-resize") this.#captureFixedSizes(next);

    // The very first layout must not animate: constraint measurement forces a
    // style flush while panes still have flex-grow 0, so an [animate] group
    // would otherwise tween every pane open from zero on mount.
    const firstApply = !this.#hasAppliedLayout && this.#panes.length > 0;
    const suppressTransitions = firstApply || trigger === "container-resize";
    if (suppressTransitions) {
      if (firstApply) this.#hasAppliedLayout = true;
      for (const p of this.#panes) p.style.transition = "none";
    }

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

    if (suppressTransitions) {
      void this.offsetWidth; // flush styles before re-enabling transitions
      for (const p of this.#panes) p.style.transition = "";
    }

    this.#updateAria();

    if (changed) {
      this.#fireResizeEvents(next);
      this.dispatchEvent(
        new CustomEvent("layout-change", {
          detail: { layout: [...next] },
        }),
      );
      const saveId = this.getAttribute("save-id");
      if (saveId && !this.#suppressSave) {
        savePaneGroup({
          autoSaveId: saveId,
          panes: this.#paneRecords(),
          layout: next,
          expandToSizes: this.#expandToSizes,
          fixedSizesPx: this.#fixedSizesPx,
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
        if (last != null && !wasCollapsed && nowCollapsed) {
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
    const constraints = this.#constraints();
    const layout = this.#layout.length === this.#panes.length ? this.#layout : defaultLayout(constraints);
    this.#syncFixedSizes(layout);
    const next = validateLayout({
      layout: this.#layoutWithFixedSizes(layout, constraints),
      paneConstraints: constraints,
    });
    this.#applyLayout(next, "container-resize");
  }

  // ---------- pointer drag ----------

  #onPointerDown = (e: PointerEvent): void => {
    const target = e.target as Element | null;
    const resizer = target?.closest("schism-resizer") as SchismResizerElement | null;
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

  /** Pointer parity with the Enter key: double-click a resizer to toggle
   * collapse of the adjacent collapsible pane. */
  #onDoubleClick = (e: MouseEvent): void => {
    const target = e.target as Element | null;
    const resizer = target?.closest("schism-resizer") as SchismResizerElement | null;
    if (!resizer || resizer.parentElement !== this) return;
    if (resizer.hasAttribute("disabled")) return;
    const idx = this.#resizers.indexOf(resizer);
    if (idx < 0 || idx >= this.#panes.length - 1) return;
    if (this.#toggleAdjacentCollapse(idx)) e.preventDefault();
  };

  /** Toggle collapse of the pane adjacent to resizer `idx`: the leading pane
   * if collapsible (the Enter key's historical target), else the trailing one
   * (covers end-anchored side panels). Returns whether anything toggled. */
  #toggleAdjacentCollapse(idx: number): boolean {
    for (const pane of [this.#panes[idx], this.#panes[idx + 1]]) {
      if (!pane) continue;
      if (!this.#paneConstraints(pane).collapsible) continue;
      if (pane.isCollapsed()) this.expandPane(pane);
      else this.collapsePane(pane);
      return true;
    }
    return false;
  }

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
    resizer.blur();
    this.#drag = null;
    this.dispatchEvent(
      new CustomEvent("dragging-change", { detail: { dragging: false } }),
    );
  }

  // ---------- keyboard ----------

  #onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as Element | null;
    const resizer = target?.closest("schism-resizer") as SchismResizerElement | null;
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
        // Toggle collapse on the adjacent collapsible pane (leading first;
        // falls back to trailing so end-anchored side panels work too).
        if (this.#toggleAdjacentCollapse(idx)) e.preventDefault();
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

  #isFixedPane(p: SchismPaneElement): boolean {
    return p.getAttribute("size-mode") === "fixed";
  }

  #fixedSizePercent(p: SchismPaneElement): number | null {
    const groupPx = this.#groupSize();
    const px = this.#fixedSizesPx.get(p.paneId);
    return px == null || groupPx <= 0 ? null : (px / groupPx) * 100;
  }

  #syncFixedSizes(layout?: number[]): void {
    const current = new Set(this.#panes.map((p) => p.paneId));
    for (const id of this.#fixedSizesPx.keys()) {
      if (!current.has(id)) this.#fixedSizesPx.delete(id);
    }

    const groupPx = this.#groupSize();
    if (groupPx <= 0) return;

    for (let i = 0; i < this.#panes.length; i++) {
      const pane = this.#panes[i]!;
      if (!this.#isFixedPane(pane) || this.#fixedSizesPx.has(pane.paneId)) continue;
      const fromDefault = sizeToPixels(pane.getAttribute("default-size"), groupPx, this);
      const fromLayout = layout?.[i] != null ? (layout[i]! / 100) * groupPx : null;
      const px = fromLayout ?? fromDefault;
      if (px != null && Number.isFinite(px)) this.#fixedSizesPx.set(pane.paneId, px);
    }
  }

  #captureFixedSizes(layout: number[]): void {
    const groupPx = this.#groupSize();
    if (groupPx <= 0) return;
    for (let i = 0; i < this.#panes.length; i++) {
      const pane = this.#panes[i]!;
      if (!this.#isFixedPane(pane)) continue;
      const constraints = this.#paneConstraints(pane);
      const collapsed = constraints.collapsedSize ?? 0;
      if (constraints.collapsible && areNumbersAlmostEqual(layout[i] ?? 0, collapsed)) continue;
      this.#fixedSizesPx.set(pane.paneId, ((layout[i] ?? 0) / 100) * groupPx);
    }
  }

  #layoutWithFixedSizes(layout: number[], constraints: PaneConstraints[]): number[] {
    if (layout.length !== this.#panes.length) return layout;
    const groupPx = this.#groupSize();
    if (groupPx <= 0) return layout;

    const next = [...layout];
    let fixedTotal = 0;
    let fluidTotal = 0;
    const fluidIndices: number[] = [];

    for (let i = 0; i < this.#panes.length; i++) {
      const pane = this.#panes[i]!;
      const c = constraints[i]!;
      if (!this.#isFixedPane(pane)) {
        fluidIndices.push(i);
        fluidTotal += layout[i] ?? 0;
        continue;
      }

      const collapsed = c.collapsedSize ?? 0;
      if (c.collapsible && areNumbersAlmostEqual(layout[i] ?? 0, collapsed)) {
        next[i] = collapsed;
      } else {
        const px = this.#fixedSizesPx.get(pane.paneId);
        if (px != null) {
          next[i] = resizePane({
            paneConstraints: constraints,
            paneIndex: i,
            initialSize: (px / groupPx) * 100,
          });
        }
      }
      fixedTotal += next[i] ?? 0;
    }

    const remaining = Math.max(0, 100 - fixedTotal);
    for (let offset = 0; offset < fluidIndices.length; offset++) {
      const i = fluidIndices[offset]!;
      next[i] = fluidTotal > 0 ? ((layout[i] ?? 0) / fluidTotal) * remaining : remaining / fluidIndices.length;
    }

    return next;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
