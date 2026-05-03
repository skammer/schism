/**
 * `<schism-resizer>` — drag handle / keyboard separator between two panes.
 *
 * Attributes:
 *   disabled   boolean — drag/keyboard disabled
 *   tabindex   defaults to 0; set manually to skip
 */
export class SchismResizerElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["disabled"];
  }

  resizerId: string = `r-${Math.random().toString(36).slice(2, 9)}`;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      :host{display:block;flex:0 0 auto;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}
      :host([disabled]){pointer-events:none;}
    </style><slot></slot>`;
  }

  connectedCallback(): void {
    this.setAttribute("role", "separator");
    if (!this.hasAttribute("tabindex") && !this.hasAttribute("disabled")) {
      this.setAttribute("tabindex", "0");
    }
    if (!this.hasAttribute("data-resizer")) this.setAttribute("data-resizer", "");
    if (!this.hasAttribute("data-resizer-id"))
      this.setAttribute("data-resizer-id", this.resizerId);
    this.#notify("connect");
  }

  disconnectedCallback(): void {
    this.#notify("disconnect");
  }

  attributeChangedCallback(name: string): void {
    if (!this.isConnected) return;
    if (name === "disabled") {
      if (this.hasAttribute("disabled")) {
        this.removeAttribute("tabindex");
      } else if (!this.hasAttribute("tabindex")) {
        this.setAttribute("tabindex", "0");
      }
      this.#notify("change");
    }
  }

  #notify(kind: "connect" | "disconnect" | "change"): void {
    this.dispatchEvent(
      new CustomEvent("schism-resizer-" + kind, { bubbles: true, composed: false }),
    );
  }
}
