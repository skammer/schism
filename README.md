# @skammer/split

Resizable split-pane web components — framework-free, with optional Datastar wiring.

```html
<link rel="stylesheet" href="dist/split.css" />
<script type="module" src="dist/split.js"></script>

<split-group direction="horizontal">
  <split-pane default-size="25" min-size="160px" collapsible>sidebar</split-pane>
  <split-resizer></split-resizer>
  <split-pane>main</split-pane>
</split-group>
```

The resize/constraint algorithm is ported from [`paneforge`](https://github.com/svecosystem/paneforge) (itself a port of [`react-resizable-panels`](https://github.com/bvaughn/react-resizable-panels)). MIT, attribution preserved in `src/core/adjust-layout.ts`.

---

## Install

```sh
npm install @skammer/split
```

```js
// Loads + auto-defines <split-group>, <split-pane>, <split-resizer>.
import "@skammer/split";
```

```css
/* Required — provides hit areas, cursors, theming hooks. */
@import "@skammer/split/split.css";
```

CDN (no build step):

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@skammer/split/dist/split.css" />
<script type="module" src="https://cdn.jsdelivr.net/npm/@skammer/split/dist/split.js"></script>
```

## Run the demos

```sh
npm install
npm run dev
```

Vite opens `http://localhost:5173/demos/wc-only.html`. Open `http://localhost:5173/demos/datastar.html` for the Datastar version.

## Build

```sh
npm run build
```

Outputs to `dist/`:

| File              | Size (gz)  | Purpose                                                 |
| ----------------- | ---------- | ------------------------------------------------------- |
| `dist/split.js`   | ~7.3 KB    | Self-contained ESM, all elements + auto-define          |
| `dist/datastar.js`| ~0.5 KB    | Optional `bindLayoutSignal` helper                       |
| `dist/split.css`  | small      | **Required** stylesheet                                  |
| `dist/split.d.ts` | —          | TypeScript declarations                                  |

---

## Layout model

A `<split-group>` is a flex container; `<split-pane>` and `<split-resizer>` are its direct children. Pane sizes are written as `flex-grow: <percent>` on each pane (the percents always sum to 100). All constraints are stored as percentages internally; px / em / rem / vh / vw values are normalized against the group's measured pixel size.

```
<split-group> (display:flex)
├── <split-pane>      flex-grow: 25
├── <split-resizer>   width: 6px
├── <split-pane>      flex-grow: 50
├── <split-resizer>   width: 6px
└── <split-pane>      flex-grow: 25
```

The group uses a `ResizeObserver` to re-validate constraints when its container shrinks (e.g. a `min-size: 240px` pane stays valid as the viewport shrinks).

---

## `<split-group>`

Container element. Owns the layout, persistence, drag state, ARIA, and keyboard handling.

### Attributes

| Attribute              | Default        | Notes                                                 |
| ---------------------- | -------------- | ----------------------------------------------------- |
| `direction`            | `"horizontal"` | `"horizontal"` or `"vertical"`                        |
| `save-id`              | —              | Opt-in localStorage persistence (debounced 100 ms)    |
| `keyboard-resize-by`   | `10`           | Percent step per arrow keypress                       |

### Properties

| Property    | Type                                | Notes                                       |
| ----------- | ----------------------------------- | ------------------------------------------- |
| `direction` | `"horizontal" \| "vertical"`        | Mirrors the attribute                       |
| `storage`   | `{ getItem, setItem }`              | Custom storage adapter (defaults to `localStorage`) |

### Methods

```ts
group.getLayout(): number[]               // current sizes as percentages
group.setLayout(sizes: number[]): void    // apply layout (validated against constraints)
group.resizePane(pane, percent): void
group.collapsePane(pane): void
group.expandPane(pane, toSize?): void
group.getPaneSize(pane): number
```

### Events

| Event             | Detail                          | Fires when                  |
| ----------------- | ------------------------------- | --------------------------- |
| `layout-change`   | `{ layout: number[] }`          | Layout changes (any source) |
| `dragging-change` | `{ dragging: boolean }`         | Pointer drag start / end    |

`layout-change` bubbles. `resize`, `collapse`, `expand` are dispatched on each `<split-pane>`, see below.

---

## `<split-pane>`

Each region. Light-DOM children render inside it.

### Attributes

| Attribute        | Default       | Notes                                                                             |
| ---------------- | ------------- | --------------------------------------------------------------------------------- |
| `min-size`       | `0%`          | Accepts `%`, `px`, `em`, `rem`, `vh`, `vw`, or unitless number = %               |
| `max-size`       | `100%`        | Same units                                                                        |
| `default-size`   | even split    | Same units. Remaining space split evenly among panes without a `default-size`     |
| `collapsible`    | (boolean)     | Enables Enter-to-collapse + halfway-snap                                          |
| `collapsed-size` | `0%`          | Size while collapsed                                                              |
| `order`          | DOM order     | Numeric; controls position when conditionally rendering panes                     |

### Methods

```ts
pane.collapse(): void
pane.expand(toSize?: number): void   // restores to last known size, falls back to min-size
pane.resize(percent: number): void
pane.getSize(): number
pane.isCollapsed(): boolean
pane.isExpanded(): boolean
```

### Events

| Event      | Detail                                    | Fires when                                                              |
| ---------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| `resize`   | `{ size: number, prevSize?: number }`     | Pane size changes                                                       |
| `collapse` | —                                         | Collapsible pane reaches `collapsed-size`                               |
| `expand`   | —                                         | Collapsible pane leaves `collapsed-size`                                |

### State attributes

The group sets these on each pane, useful as CSS hooks:

```css
split-pane[data-collapsed]   { /* pane is at collapsed-size */ }
split-pane[data-expanded]    { /* pane is not collapsed     */ }
```

---

## `<split-resizer>`

Drag handle / keyboard separator between two panes.

### Attributes

| Attribute  | Default |
| ---------- | ------- |
| `disabled` | (boolean) — drag/keyboard off, pointer-events removed |
| `tabindex` | `0`     |

### ARIA

Each resizer is updated on every layout change with:

- `role="separator"`
- `aria-orientation="vertical"` for horizontal groups (and vice versa)
- `aria-controls="<leading pane id>"`
- `aria-valuemin` / `aria-valuemax` — sibling-aware (accounts for *other* panes' constraints)
- `aria-valuenow` — current size of the leading pane

### Keyboard

When focused:

| Key                          | Action                                                       |
| ---------------------------- | ------------------------------------------------------------ |
| `←` / `→` (horizontal)       | Resize by `keyboard-resize-by` percent (default 10)          |
| `↑` / `↓` (vertical)         | Same                                                          |
| `Shift +` arrow              | Resize by 100% (jumps to the other side)                     |
| `Home`                       | Shrink leading pane to its minimum                           |
| `End`                        | Grow leading pane to its maximum                             |
| `Enter`                      | Toggle collapse on the leading pane (if `collapsible`)       |
| `F6` / `Shift + F6`          | Cycle focus between resizers in the group                    |

---

## Theming

`split.css` exposes CSS custom properties on `split-group`:

```css
split-group {
  --split-handle-size: 6px;
  --split-handle-bg: transparent;
  --split-handle-bg-hover: color-mix(in srgb, currentColor 12%, transparent);
  --split-handle-color: currentColor;
  --split-pane-bg: transparent;
}
```

Override globally on `:root`, per-group via inline style, or per-instance:

```css
my-app split-group {
  --split-handle-size: 10px;
  --split-handle-bg-hover: rgb(99 102 241 / .25);
}
```

---

## Persistence

Add `save-id` to opt in:

```html
<split-group direction="horizontal" save-id="editor">…</split-group>
```

The group debounces writes (100 ms) to `localStorage` under the key `split:editor`. Storage shape includes the layout and a per-pane "expand-to" size (so that collapsing then refreshing then expanding restores the prior size).

To use a custom store (cookie, IndexedDB, server-pushed):

```js
document.querySelector("split-group").storage = {
  getItem: (key) => mySession[key] ?? null,
  setItem: (key, value) => { mySession[key] = value; },
};
```

To clear a saved layout:

```js
localStorage.removeItem("split:editor");
```

---

## Web Component recipes

### Vertical split

```html
<split-group direction="vertical">
  <split-pane>top</split-pane>
  <split-resizer></split-resizer>
  <split-pane>bottom</split-pane>
</split-group>
```

### Nested groups

```html
<split-group direction="horizontal">
  <split-pane default-size="25">files</split-pane>
  <split-resizer></split-resizer>
  <split-pane>
    <split-group direction="vertical">
      <split-pane>editor</split-pane>
      <split-resizer></split-resizer>
      <split-pane default-size="30">terminal</split-pane>
    </split-group>
  </split-pane>
</split-group>
```

### Collapsible sidebar with px constraints

```html
<split-group direction="horizontal">
  <split-pane min-size="160px" max-size="40%" default-size="25" collapsible>
    sidebar
  </split-pane>
  <split-resizer></split-resizer>
  <split-pane>main</split-pane>
</split-group>
```

### Programmatic control

```js
const group = document.querySelector("split-group");
const sidebar = group.querySelector("split-pane");

sidebar.collapse();
sidebar.expand();        // restores to last expanded size
sidebar.resize(35);      // set to 35%
group.setLayout([20, 60, 20]);

group.addEventListener("layout-change", (e) => {
  console.log(e.detail.layout);
});
sidebar.addEventListener("collapse", () => console.log("closed"));
sidebar.addEventListener("expand",   () => console.log("open"));
```

### Conditionally rendered panes (preserve order)

When toggling panes via JS frameworks, set `order` so removed/added panes don't shuffle:

```html
<split-pane order="1">A</split-pane>
<split-resizer></split-resizer>
<split-pane order="2" data-conditional>B</split-pane>
<split-resizer></split-resizer>
<split-pane order="3">C</split-pane>
```

### Disabled handle

```html
<split-resizer disabled></split-resizer>
```

### RTL

`<split-group direction="horizontal">` automatically inverts drag and arrow-key direction when `dir="rtl"` is in effect (on the group, an ancestor, or the document).

---

## Datastar usage

The web components dispatch standard `CustomEvent`s and accept methods on the element — no plugin is needed. Datastar v1 attributes use **colon syntax** (`data-on:click`, not `data-on-click`).

Bootstrap order matters: load split BEFORE Datastar so Datastar can call methods on already-upgraded elements:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@skammer/split/dist/split.css" />
<script type="module" src="https://cdn.jsdelivr.net/npm/@skammer/split/dist/split.js"></script>
<script
  type="module"
  src="https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.0-RC.6/bundles/datastar.js"
></script>
```

### One-way: layout → signal

```html
<body data-signals="{layout: []}">
  <split-group data-on:layout-change="$layout = evt.detail.layout">
    <split-pane>A</split-pane>
    <split-resizer></split-resizer>
    <split-pane>B</split-pane>
  </split-group>

  <pre data-text="JSON.stringify($layout)"></pre>
</body>
```

### Two-way: signal ⇄ layout

`data-effect` runs whenever its signal dependencies change. Inside, `el` is the element with the attribute (the `<split-group>` here):

```html
<body data-signals="{layout: []}">
  <split-group
    data-on:layout-change="$layout = evt.detail.layout"
    data-effect="el.setLayout && $layout.length === 3 && el.setLayout($layout)"
  >
    <split-pane default-size="20">A</split-pane>
    <split-resizer></split-resizer>
    <split-pane default-size="60">B</split-pane>
    <split-resizer></split-resizer>
    <split-pane default-size="20">C</split-pane>
  </split-group>

  <button data-on:click="$layout = [50, 25, 25]">50 / 25 / 25</button>
  <button data-on:click="$layout = [10, 10, 80]">10 / 10 / 80</button>
</body>
```

Initialize `$layout` to `[]` and let the first `layout-change` fire (it always fires on mount). The `length === 3` guard prevents the effect from running before the WC has scanned its panes. Set initial sizes via `default-size` attributes on each pane.

### Collapse/expand events drive a signal

```html
<body data-signals="{sidebarOpen: true}">
  <split-group>
    <split-pane
      min-size="160px"
      collapsible
      default-size="25"
      data-on:collapse="$sidebarOpen = false"
      data-on:expand="$sidebarOpen = true"
    >sidebar</split-pane>
    <split-resizer></split-resizer>
    <split-pane>main</split-pane>
  </split-group>

  <button data-on:click="
    const pane = document.querySelector('split-pane');
    $sidebarOpen ? pane.collapse() : pane.expand();
  " data-text="$sidebarOpen ? 'Hide sidebar' : 'Show sidebar'"></button>
</body>
```

### Server-persisted layout

`data-on:layout-change` can call any Datastar action — including `@post()` to persist to your backend:

```html
<split-group
  data-on:layout-change__debounce.300ms="
    $layout = evt.detail.layout;
    @post('/api/save-layout');
  "
>…</split-group>
```

### Helper for two-way binding (optional)

If you have a signal API outside of Datastar attributes (e.g. JS code), use the helper:

```js
import { bindLayoutSignal } from "@skammer/split/datastar";

const off = bindLayoutSignal(
  document.querySelector("split-group"),
  /* SignalLike<number[]> */ {
    get: () => mySignal.value,
    set: (next) => { mySignal.value = next; },
    subscribe: (cb) => mySignal.subscribe(cb),
  },
);
// later: off();
```

---

## TypeScript

```ts
import type {
  SplitGroupElement,
  SplitPaneElement,
  SplitResizerElement,
  PaneConstraints,
  PaneGroupStorage,
} from "@skammer/split";

const group = document.querySelector<SplitGroupElement>("split-group")!;
group.setLayout([20, 60, 20]);
```

The package augments `HTMLElementTagNameMap`, so `document.querySelector("split-group")` returns the typed element directly.

---

## Browser support

Modern evergreen browsers only. Required APIs: Custom Elements v1, Shadow DOM v1, Pointer Events, `setPointerCapture`, `ResizeObserver`, CSS `:host`, `::part`, `light-dark()` (the last only used in demos).

---

## License

MIT. Includes MIT-licensed code from `paneforge` and `react-resizable-panels`; attribution preserved in source.
