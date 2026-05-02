# @skammer/split

Resizable split-pane web components, framework-free, with optional Datastar wiring.

```html
<link rel="stylesheet" href="dist/split.css" />
<script type="module" src="dist/split.js"></script>

<split-group direction="horizontal">
  <split-pane default-size="25" min-size="160px" collapsible>sidebar</split-pane>
  <split-resizer></split-resizer>
  <split-pane>main</split-pane>
</split-group>
```

## Status

- [x] **Phase 1** — Investigated `paneforge`, `react-resizable-panels`, `resizable-panels`, `split-panel`. Reports in `reports/`.
- [x] **Phase 2** — Feature matrix + architecture decisions: `reports/_phase2-synthesis.md`.
- [x] **Phase 3** — Three native web components: `<split-group>`, `<split-pane>`, `<split-resizer>`.
- [x] **Phase 4** — Tiny optional Datastar helper (`bindLayoutSignal`). 95% of integration works with stock Datastar attributes — no plugin required.
- [x] **Phase 5** — Two demo pages: pure WC and Datastar.

The core resize/constraint algorithm is ported from [`paneforge`](https://github.com/svecosystem/paneforge) (itself a port of [`react-resizable-panels`](https://github.com/bvaughn/react-resizable-panels)). MIT, attribution preserved in `src/core/adjust-layout.ts`.

## Install

```sh
npm install
```

## Run the demos

```sh
npm run dev
```

Vite opens `http://localhost:5173/demos/wc-only.html` automatically. Open `http://localhost:5173/demos/datastar.html` for the Datastar version.

- **`demos/wc-only.html`** — six sections: horizontal, vertical, nested IDE-style with collapsible sidebar (px min-sizes), persisted layout via `save-id`, controlled mode via imperative API, RTL.
- **`demos/datastar.html`** — same components wired up to Datastar signals via standard `data-on-layout-change`, `data-on-collapse`, `data-effect`, `data-text` attributes.

## Build

```sh
npm run build
```

Outputs to `dist/`:

| File | Size (gz) | Purpose |
|---|---|---|
| `dist/split.js` | ~7.3 KB | Self-contained ESM, all elements + auto-define |
| `dist/datastar.js` | ~0.5 KB | Optional `bindLayoutSignal` helper |
| `dist/split.css` | small | **Required** stylesheet |
| `dist/split.d.ts` | — | TypeScript declarations |

The `split.js` bundle is self-contained for CDN use; the `datastar.js` helper imports from `./split.js`.

## API

### `<split-group>`

| Attribute | Default | Notes |
|---|---|---|
| `direction` | `"horizontal"` | `"horizontal"` or `"vertical"` |
| `save-id` | — | Opt-in localStorage persistence (debounced 100ms) |
| `keyboard-resize-by` | `10` | Percent step per arrow keypress |

Properties: `direction`, `storage` (custom `{ getItem, setItem }` adapter).
Methods: `getLayout(): number[]`, `setLayout(arr)`, `resizePane(p, %)`, `collapsePane(p)`, `expandPane(p, toSize?)`, `getPaneSize(p)`.
Events: `layout-change` (`detail.layout`), `dragging-change` (`detail.dragging`).

### `<split-pane>`

| Attribute | Default | Notes |
|---|---|---|
| `min-size` | `0%` | Accepts `%`, `px`, `em`, `rem`, `vh`, `vw`, or unitless number = % |
| `max-size` | `100%` | Same units |
| `default-size` | even split | Same units |
| `collapsible` | (boolean) | Enables Enter-to-collapse + halfway-snap |
| `collapsed-size` | `0%` | Size while collapsed |
| `order` | DOM order | Numeric; lets you reorder when conditionally rendering |

Methods: `collapse()`, `expand(toSize?)`, `resize(percent)`, `getSize()`, `isCollapsed()`, `isExpanded()`.
Events: `resize` (`detail.size`, `detail.prevSize`), `collapse`, `expand`.
State: `data-collapsed` / `data-expanded` attributes for CSS hooks.

### `<split-resizer>`

| Attribute | Default |
|---|---|
| `disabled` | (boolean) |
| `tabindex` | `0` |

ARIA: `role="separator"`, `aria-orientation`, `aria-controls`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow` (sibling-aware, recomputed on every layout change).
Keyboard: `Arrow*` (configurable step), `Shift+Arrow*` (100%), `Home`/`End`, `Enter` (toggle collapse on leading pane), `F6` / `Shift+F6` (cycle resizers in group).

### Theming

`split.css` exposes:

```css
split-group {
  --split-handle-size: 6px;
  --split-handle-bg: transparent;
  --split-handle-bg-hover: ...;
  --split-handle-color: currentColor;
  --split-pane-bg: transparent;
}
```

Override on any `<split-group>` (or globally on `:root`).

## Datastar

For most cases, stock Datastar attributes are enough:

```html
<split-group data-on-layout-change="$layout = evt.detail.layout">
  <split-pane data-on-collapse="$sidebarOpen = false"
              data-on-expand="$sidebarOpen = true"
              collapsible>...</split-pane>
  <split-resizer></split-resizer>
  <split-pane>...</split-pane>
</split-group>
```

For two-way binding (signal → layout), import the helper:

```js
import { bindLayoutSignal } from "@skammer/split/datastar";
bindLayoutSignal(document.querySelector("split-group"), mySignal);
```

## License

MIT. Includes MIT-licensed code from `paneforge` and `react-resizable-panels`; attribution preserved in source.
