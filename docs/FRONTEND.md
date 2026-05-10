# Frontend Deep Dive

For the high-level diagram, read [`ARCHITECTURE.md`](ARCHITECTURE.md) first.
This doc explains the browser app in `roadmap_builder/`.

---

## Why no bundler?

The app is a research prototype, not a production deploy. To keep the dev loop
trivial (no Node toolchain, no `npm run build`, no source maps to debug), the
HTML loads React + Babel from a CDN and every JSX file via
`<script type="text/babel">`. Babel transpiles on the fly in the browser.

**Pros:** open `index.html` and edit; no build step.
**Cons:** slower first paint (Babel runs in browser), zero type checking,
CDN outage = dead app.

If the project graduates to production, see the "Out of scope (deferred)"
section in `CONTRIBUTING.md` for the migration path to Vite + TypeScript.

---

## Script load order

`index.html` lists these in dependency order. Each later file uses globals
attached by an earlier one (via `Object.assign(window, {...})`).

```
1. tweaks-panel.jsx     → useTweaks, TweaksPanel
2. data.jsx             → PESTLE, PALETTE, TEMPLATES, GLOSSARY, buildFromTemplate
3. primitives.jsx       → Icon, Toast, GlossaryCard, InfoDot
4. start-screen.jsx     → StartScreen, TemplatePicker
5. coach-rail.jsx       → CoachRail
6. roadmap-grid.jsx     → RoadmapGrid (uses Chip internally)
7. modals.jsx           → ItemModal, GlossaryModal, ImportModal, StructureModal
8. impact-advisor.jsx   → ImpactAdvisor
9. app.jsx              → App (mounted into #root)
```

Adding a new file: drop it into the order above where its dependencies
already exist, then add a `<script>` tag in `index.html`.

---

## Component tree

```
<App>                           (app.jsx)
├── <RoadmapList>               (app.jsx — list view)
├── <StartScreen>               (start-screen.jsx — onboarding hero)
│   └── <TemplatePicker>        (start-screen.jsx — template modal)
├── <CoachRail>                 (coach-rail.jsx — left rail, 7-step checklist)
├── <RoadmapGrid>               (roadmap-grid.jsx — main canvas)
│   └── <Chip>                  (roadmap-grid.jsx — single roadmap item card)
├── <ItemModal>                 (modals.jsx — add/edit item)
├── <GlossaryModal>             (modals.jsx)
├── <ImportModal>               (modals.jsx — paste JSON)
├── <StructureModal>            (modals.jsx — edit layers / bands)
├── <ImpactAdvisor>             (impact-advisor.jsx — news impact panel)
├── <Toast>                     (primitives.jsx)
└── <TweaksPanel>               (tweaks-panel.jsx — host-iframe protocol)
```

---

## State shape

### Roadmap record (in `localStorage`)

```ts
{
  id: string,                    // "rm_<timestamp>_<random>"
  title: string,                 // duplicated from state for list-view display
  updatedAt: ISO_string,
  state: RoadmapState
}
```

### `RoadmapState`

```ts
{
  title: string,
  templateId?: string,           // "industrial-digital" | "saas-product" | ...
  categories: Category[],        // rows of the grid (a.k.a. "layers")
  bands: Band[],                 // columns of the grid (a.k.a. "time bands")
  items: Item[]                  // chips that live in cells
}
```

### `Item`

```ts
{
  id: string,                    // "i_<timestamp>_<random>"
  name: string,                  // required
  catId: string,                 // → Category.id  (one layer per item)
  bands: string[],               // → Band.id[]    (item can span multiple)
  pestle: string[],              // ["P","E","S","T","L","En"]  optional
  description?: string,
  notes?: string,                // populated by Impact Advisor "Add advice"
  reviewNeeded?: boolean,        // true after Impact Advisor advice applied
  lastImpactVerdict?: string     // "Maintain" | "Adjust" | "Revise"
}
```

### `Category` (a row, "layer")

```ts
{
  id: string,
  label: string,
  sub?: string,                  // sub-label shown below
  color: string,                 // CSS color (var/oklch/hex all supported)
  help?: string                  // hover-tooltip explanation
}
```

### `Band` (a column, "time band")

```ts
{
  id: string,
  label: string,                 // e.g. "Q1 2026", "Now"
  tag?: string,                  // e.g. "Now", "Short term"
  color: string
}
```

---

## State management

**Single source of truth:** the `App` component owns every piece of state via
`useState`. Children receive props and call back up. There is no Redux,
MobX, Context, or Zustand — and the codebase is small enough that it doesn't
need any.

Useful patterns to know:

### Toast — `useToast()` hook (in `app.jsx`)

```js
const [toast, showToast] = useToast();
// ...
showToast("Item saved");
```

Cleared on unmount and on each new message. Default duration 2200 ms.

### Undo — manual stack via `useRef`

`undoStackRef.current` keeps the last 30 state snapshots. Every state change
pushes a snapshot via an effect. `Ctrl+Z` calls `undo()` which pops the
current frame and applies the previous one (with a guard to avoid pushing the
restored state back onto the stack).

### Persistence — `updateRoadmaps(mutate)` helper

All collection mutations route through this helper so persistence is never
forgotten:

```js
updateRoadmaps(prev => prev.map(record =>
  record.id === route.id
    ? { ...record, title: titleOf(state), updatedAt: ..., state: ... }
    : record
));
```

Internally calls `saveRoadmapCollection(next)` after the React state update.

---

## Routing

Hash-based, parsed by `parseRoute(hash)` (also exported via
`lib/exports.js` for tests):

| Hash | View | id |
|------|------|----|
| `""` or `"#"` | `empty` (redirects on mount) | — |
| `#/roadmaps` | `roadmaps` (list view) | — |
| `#/roadmaps/new` | `new` (start screen) | — |
| `#/roadmaps/<id>` | `builder` | `<id>` |
| `#/roadmaps/<id>/import` | `builder` + import modal | `<id>` |
| anything else | `not-found` | — |

`go(path)` navigates by setting `window.location.hash`. `useHashRoute()`
listens for `hashchange` events and re-parses.

---

## Where to add things

### A new template

Edit `data.jsx`:

```js
const TEMPLATES = [
  // existing entries...
  {
    id: "my-new-template",
    name: "My New Template",
    tagline: "What this template is for",
    layers: 4, bands: 3, items: 0,
    pestle: ["T", "E"],
    bands_data: [ { id: "b1", label: "Now", tag: "0-3 mo", color: "var(--c-blue)" }, ... ],
    categories: [ { id: "l1", label: "Layer 1", sub: "...", color: "var(--c-blue)", help: "..." }, ... ],
    items: []     // optional pre-fill
  }
];
```

`buildFromTemplate(id)` already handles unknown shapes safely.

### A new modal

1. Define the component in `modals.jsx`.
2. Append to the `Object.assign(window, { ItemModal, ..., MyNewModal })` line at
   the bottom.
3. In `app.jsx`, add a `useState` for visibility and render `<MyNewModal>` near
   the other modals.

### A new keyboard shortcut

Edit the `useEffect` in `app.jsx` that registers the `keydown` listener
(search for `// Keyboard shortcuts`). Add an `else if (e.key === "X" && ...)`
branch. Remember to skip when the user is typing in an input
(`if (editing) return`).

### A new chip-level selection action

The bulk-select bar inside `RoadmapGrid` looks at the `selected` `Set` from
`App`. Add a button that calls a new handler defined on `App`, e.g.
`onTagSelected(pestleKey)`, which mutates `state.items` for items in
`selected`.

### A new impact-advisor result widget

Edit `impact-advisor.jsx`. The `result` object structure is documented in
`ARCHITECTURE.md` § Frontend ↔ Backend contract. Add a `<section>` inside
the `{result && (<>...</>)}` block.

### A new field on `Item`

1. Add it to the form in `ItemModal` (`modals.jsx`).
2. Save it through `onSaveItem` in `app.jsx`.
3. Display it on `Chip` in `roadmap-grid.jsx` if user-visible.
4. **Add a localStorage migration** if you can't tolerate `undefined` for
   existing roadmaps (currently no migration framework — see
   `CONTRIBUTING.md` deferred-work section).

---

## Pure helpers tested by Vitest

These all live in `app.jsx` AND have an ESM mirror in `lib/exports.js`:

| Helper | What it does |
|--------|-------------|
| `titleOf(state)` | Trim title, fall back to "Untitled Roadmap" |
| `isValidRoadmapState(state)` | Defensive shape check after `JSON.parse` |
| `parseRoute(hash)` | Hash → `{view, id?, action?}` |
| `csvEscape(value)` | RFC-4180 double-quote escape |
| `buildSelectionJson(state, picked)` | Bulk-export → JSON string |
| `buildSelectionCsv(state, picked)` | Bulk-export → CSV string |
| `buildSelectionText(state, picked)` | Bulk-export → grouped Markdown-ish |
| `formatGuidanceNote(entry, verdict)` | Format multi-expert advice into chip notes |

If you change one of these in `app.jsx`, mirror the change in `lib/exports.js`
or Vitest will silently lock the OLD behaviour.

---

## Common gotchas

- **JSX failures don't show in the UI.** Open the browser console — Babel
  parse errors land there with line numbers.
- **`Object.assign(window, …)` order matters.** A file referencing
  `RoadmapGrid` must be loaded after `roadmap-grid.jsx`.
- **localStorage quotas are small (5–10 MB)**. Saving a 50-MB roadmap will
  silently fail (caught by `try{}catch{}` in `saveRoadmapCollection`). No
  user-visible warning yet.
- **`useEffect` dep arrays read identifiers at hook-call time.** Declare
  `const updateRoadmaps = useCallback(...)` BEFORE any effect that has it in
  its dep array, or you get a TDZ error at startup.
- **`<script type="text/babel">` loads sequentially via Babel, not in
  parallel.** Adding many JSX files will slow first paint.
