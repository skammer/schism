/**
 * `<schism-pane>` — a single pane within a `<schism-group>`.
 *
 * Attributes:
 *   min-size       e.g. "20%" or "240px" (default 0%)
 *   max-size       e.g. "80%" or "600px" (default 100%)
 *   default-size   initial size; remainder split evenly when omitted
 *   collapsible    boolean
 *   collapsed-size size while collapsed (default 0)
 *   collapsed      declarative collapse/expand for `collapsible` panes.
 *                  EDGE-triggered: adding the attribute collapses, removing it
 *                  expands — but a user drag never fights the attribute (the
 *                  group only reacts when the attribute itself changes). This
 *                  makes panes drivable by reactive frameworks, e.g. Datastar:
 *                  `data-attr:collapsed="$panelHidden"`. Sync drag-driven
 *                  changes back via the `collapse` / `expand` events.
 *   order          integer; influences position when conditionally rendered
 */
export class SchismPaneElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return [
      "min-size",
      "max-size",
      "default-size",
      "collapsible",
      "collapsed-size",
      "collapsed",
      "order",
    ];
  }

  // Internal id used for persistence keying & event detail.
  paneId: string = `p-${Math.random().toString(36).slice(2, 9)}`;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block;overflow:hidden;flex-basis:0;flex-shrink:1;}</style><slot></slot>`;
  }

  connectedCallback(): void {
    if (!this.hasAttribute("role")) this.setAttribute("role", "group");
    if (!this.hasAttribute("data-pane")) this.setAttribute("data-pane", "");
    if (!this.hasAttribute("data-pane-id")) this.setAttribute("data-pane-id", this.paneId);
    this.#notify("connect");
  }

  disconnectedCallback(): void {
    this.#notify("disconnect");
  }

  attributeChangedCallback(): void {
    if (!this.isConnected) return;
    this.#notify("change");
  }

  #notify(kind: "connect" | "disconnect" | "change"): void {
    this.dispatchEvent(
      new CustomEvent("schism-pane-" + kind, { bubbles: true, composed: false }),
    );
  }

  // --- imperative API ---

  collapse(): void {
    this.#callOnGroup((g) => g.collapsePane(this));
  }
  expand(toSize?: number): void {
    this.#callOnGroup((g) => g.expandPane(this, toSize));
  }
  resize(percent: number): void {
    this.#callOnGroup((g) => g.resizePane(this, percent));
  }
  getSize(): number {
    return this.#callOnGroup((g) => g.getPaneSize(this)) ?? 0;
  }
  isCollapsed(): boolean {
    return this.hasAttribute("data-collapsed");
  }
  isExpanded(): boolean {
    return !this.isCollapsed();
  }

  #callOnGroup<T>(fn: (g: GroupAPI) => T): T | undefined {
    const g = this.closest("schism-group") as unknown as GroupAPI | null;
    return g ? fn(g) : undefined;
  }
}

interface GroupAPI {
  collapsePane(p: SchismPaneElement): void;
  expandPane(p: SchismPaneElement, toSize?: number): void;
  resizePane(p: SchismPaneElement, percent: number): void;
  getPaneSize(p: SchismPaneElement): number;
}
