import { SchismGroupElement } from "./schism-group.js";
import { SchismPaneElement } from "./schism-pane.js";
import { SchismResizerElement } from "./schism-resizer.js";

export { SchismGroupElement } from "./schism-group.js";
export { SchismPaneElement } from "./schism-pane.js";
export { SchismResizerElement } from "./schism-resizer.js";
export type {
  Direction,
  PaneConstraints,
  PaneGroupStorage,
  PaneRecord,
} from "./core/types.js";

export function defineSchismElements(
  registry: CustomElementRegistry = customElements,
): void {
  if (!registry.get("schism-group")) registry.define("schism-group", SchismGroupElement);
  if (!registry.get("schism-pane")) registry.define("schism-pane", SchismPaneElement);
  if (!registry.get("schism-resizer")) registry.define("schism-resizer", SchismResizerElement);
}

// Auto-define on import (browser only).
if (typeof customElements !== "undefined") defineSchismElements();

declare global {
  interface HTMLElementTagNameMap {
    "schism-group": SchismGroupElement;
    "schism-pane": SchismPaneElement;
    "schism-resizer": SchismResizerElement;
  }
}
