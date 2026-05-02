import { SplitGroupElement } from "./split-group.js";
import { SplitPaneElement } from "./split-pane.js";
import { SplitResizerElement } from "./split-resizer.js";

export { SplitGroupElement } from "./split-group.js";
export { SplitPaneElement } from "./split-pane.js";
export { SplitResizerElement } from "./split-resizer.js";
export type {
  Direction,
  PaneConstraints,
  PaneGroupStorage,
  PaneRecord,
} from "./core/types.js";

export function defineSplitElements(
  registry: CustomElementRegistry = customElements,
): void {
  if (!registry.get("split-group")) registry.define("split-group", SplitGroupElement);
  if (!registry.get("split-pane")) registry.define("split-pane", SplitPaneElement);
  if (!registry.get("split-resizer")) registry.define("split-resizer", SplitResizerElement);
}

// Auto-define on import (browser only).
if (typeof customElements !== "undefined") defineSplitElements();

declare global {
  interface HTMLElementTagNameMap {
    "split-group": SplitGroupElement;
    "split-pane": SplitPaneElement;
    "split-resizer": SplitResizerElement;
  }
}
