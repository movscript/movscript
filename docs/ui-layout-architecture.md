# UI layout architecture

MovScript uses layout chrome to decide which layer owns visible borders, radii, shadows, and split lines. A component should not draw an outer card boundary just because it needs spacing. The host layout decides the boundary; children default to a flatter chrome.

## Layout chrome

The shared contract lives in `packages/ui/src/components/layout/chrome.ts`.

Chrome is a visual ownership contract, not the top-level business mode. Pick the route surface first, then map that surface to chrome.

| Chrome | Owner | Boundary rule | Child default |
| --- | --- | --- | --- |
| `workspace` | Page workspace | No app-level card border. Page sections may use section chrome. | `section` |
| `immersive` | Fullscreen workflow | Panes use split lines only. No rounded outer frame. | `flush` |
| `canvas` | Editor/canvas | Full-bleed surface. Toolbars and inspectors own their own chrome. | `flush` |
| `split` | Master/detail layout | One divider between list and detail. Children are flush by default. | `flush` |
| `dock` | Docked side panel | One edge divider owned by the dock panel. Panel children are flush. | `flush` |
| `floating` | Overlay panel | Floating panel owns border, radius, and shadow. First-level children are flush. | `flush` |

## Route surfaces

MovScript has three top-level business surfaces. These surfaces should drive layout decisions before individual page or component styling.

| Surface | Business shape | App shell | Page behavior | Default chrome |
| --- | --- | --- | --- | --- |
| `agent` | Conversation-first workspace. The project context supports an AI-led workflow. | Agent navigation/sidebar is primary. Detail sidebar and docked assistant are not the main structure. | Immersive, flush panes, bottom composer, conversation/history/context areas. | `immersive` |
| `detail` | Traditional project/detail workspace. Users browse entities, edit records, review resources, jobs, settings, and production work. | Detail sidebar is primary, assistant may dock or float on the side. | Page shell or workbench shell owns header, scroll, and section spacing. | `workspace` |
| `canvas` | Node/editor workflow. Spatial editing owns the full route. | App chrome is minimal; canvas header controls replace normal page header. | Full-bleed editor; canvas, toolbar, node library, inspectors, and overlays own their own chrome. | `canvas` |

Surface rules:

1. `agent` and `detail` should not share page assumptions by accident. If a component appears in both, pass an explicit `host`, `chrome`, or layout prop.
2. `canvas` is independent. Do not force normal page padding, max-width, or page-card treatment into canvas routes.
3. `detail` can use contained pages or workbench layouts, but route-level wrappers should not add anonymous padding or scroll outside the page shell.
4. `agent` should prefer pane dividers and flush children over nested cards, except for repeated conversation/project items.

## App shell slot policy

The app shell can keep a stable physical skeleton across `agent` and `detail`: header plus left, center, and optional right slots. The difference is not the existence of left-center-right structure; the difference is what each slot means and who owns the right side.

| Surface | Left slot | Center slot | Right slot | Assistant behavior |
| --- | --- | --- | --- | --- |
| `detail` | Project/detail navigation | Routed page or workbench | Assistant dock or floating assistant | Assistant is secondary to the page. |
| `agent` | Agent/project conversation navigation | Conversation-first workflow | Agent-owned context/history/detail pane when needed | Assistant is the primary workflow, not a separate docked add-on. |
| `canvas` | Canvas-owned node library if present | Full-bleed canvas editor | Canvas-owned inspector/resource shelf/overlays | Normal assistant/page slots do not define the route. |

This means `agent` and `detail` may both look like three columns, but their slot ownership is different. Do not reuse a detail-mode right dock as an agent-mode content pane unless the component accepts an explicit `host` or `surface` prop.

## Nested layout responsibilities

Layout should be discussed by nesting level first, then by visual treatment. Each level owns a different kind of boundary. When a lower level needs spacing or grouping, it should normally use the child chrome allowed by its parent instead of drawing another large outer frame.

| Level | Owns | Should not own | Current examples | Child default |
| --- | --- | --- | --- | --- |
| App shell | Window frame, top header, primary sidebar, assistant dock, route surface selection | Page header, page scroll, feature cards | `WorkspaceShell`, `Header`, `Sidebar`, `AIAgentPanel` | Route surface |
| Route surface | Whether the route behaves as `agent`, `detail`, or `canvas`; maps business mode to chrome | Business pane internals | `getAppRouteSurface`, `WorkspaceShell surface` | Page shell |
| Page shell | Page header/body split, page scroll mode, page padding, max width | App sidebar, assistant panel, feature-specific pane borders | `AppContentLayout`, `AgentPageShell`, `AppPageShell` | Workbench or section |
| Workbench layout | Business structure: master/detail, grid, editor/inspector, upstream/downstream, timeline, pane overlap | App-level rounded frame, duplicated page padding | `ContentWorkspaceLayout`, `ProductionPageLayout`, `ResourcePageLayout`, `JobsPageShell`, `WorkbenchProjectShell`, `OverlapPane` | Pane |
| Pane / panel | Local scroll, local header, one edge divider, toolbars, inspector boundaries | Another full-page card boundary | `MasterDetail`, `AgentPanelShell`, resource panels, canvas inspectors | `flush` section |
| Section | A named content block inside a page or pane | Route-level scroll or app chrome | `AppSection`, `AppSurfaceItem`, feature summary blocks | Item/card |
| Item / card | Repeated list items, selectable records, metrics, media tiles, small result cards | Page or pane structure | `Card`, `Surface kind="item"`, job cards, asset cards | N/A |

Use this question order before changing a layout:

1. Which business surface is this route: `agent`, `detail`, or `canvas`?
2. Which nesting level is this node?
3. Does this level own a visible boundary, or is it a flush child?
4. Who owns scrolling: page shell, workbench, pane, or item list?
5. Who owns padding: page shell, workbench, pane, or section?
6. Is the visible line a structural divider or an item card border?
7. If a component moves between hosts, does it receive an explicit `chrome`, `host`, or layout prop?

## Current owners

- `WorkspaceShell` owns the application content host and accepts `surface="agent" | "detail" | "canvas"`, deriving default chrome from the surface.
- `AppRouteViewport` wraps routed shell content and provides the route-level scroll fallback. Default routes use `scroll="auto"` so naked content can still move; full-screen editors and other self-managed layouts use `scroll="owned"` or a hidden body with explicit internal pane scroll.
- `AppContentLayout` carries contained detail pages; `AgentPageShell` carries agent management pages and fixes their chrome to `immersive`.
- `AppPageShell` is the lower-level page primitive used by business-specific shells, not a route-level choice in app code. Page title, route-level status, and primary actions belong in `AppPageShellHeader` or the corresponding workbench/header component; `AppPageShellBody` is the default scrolling content region.
- `WorkbenchProjectShell` owns the project workbench header; `WorkbenchProjectBody` owns the workbench body scroll, padding, and background tone; `WorkbenchProjectViewport` and `WorkbenchProjectPane` own the first internal full-height split/flex layer.
- `ContentWorkspaceLayout` owns content-style workbench overview, filter, list/detail, preview, and related-section column behavior.
- `OverlapPane` owns workbench-internal overlap chrome and pane padding when a main pane visually slides over a neighboring rail or inspector; business components should set semantic class names and sizing parameters, not duplicate or override the overlap shadow, radius, border, padding, or state attributes. The global overlap pane border is always the top, left, and bottom edge, and the default pane inset is `--overlap-pane-padding`; consumers must not add or remove overlap pane borders or override `--overlap-pane-border-*` / `--overlap-pane-radius` in page CSS. Use `usePersistentOverlapPaneController` for page-level overlap panes so collapse/expand/drag state and the user's last resized width share one contract; pass its `groupProps` to `OverlapPaneGroup` and its `overlapState` to `OverlapPane` for full-pane/expanded geometry instead of clearing `margin`, `width`, `border-radius`, or `box-shadow` in page CSS.
- Non-overlapping resizable workbench panels should use `useResizablePanel` with `PanelResizeHandle` or a domain wrapper around it, rather than hand-rolling pointer listeners, cursor management, keyboard resize, and after-min collapse behavior. App sidebar resizing, detail-mode AI dock resizing, and canvas workflow side-panel resizing follow this shared controller contract.
- Resource preparation uses `WorkbenchProjectBody` for route-level body behavior and keeps only its resource-specific responsive grid in `ResourcePrepWorkspaceGrid`.
- `MasterDetail` owns list/detail split lines and accepts `chrome="split" | "flush"`.
- `AgentPanelShell` owns AI side-panel chrome and accepts `chrome="dock" | "floating"`.
- `AgentBuiltinChatShell` maps runtime placement to `host="dock-panel" | "floating-panel" | "immersive"`.
- `AgentComposerSection` accepts `chrome="card" | "bottom-bar" | "flush"` so the same composer can sit inside page, dock, or floating hosts without creating a second large card boundary.

## Overlap pane standard

Use the reference image-generation workbench as the baseline for new overlap-pane pages. The standard shape is a page-specific workbench wrapper around `OverlapPaneGroup`, a normal list/editor pane, and an `OverlapPane` detail/resource pane. The group owns grid/flex columns and state data attributes; `OverlapPane` owns chrome, overlap geometry, resize handle placement, and the global top/left/bottom border.

Drag and resize:

1. Use `usePersistentOverlapPaneController` for every page-level overlap pane. Use `useOverlapPaneController` only for non-persistent internal adapters. Do not combine `useOverlapPaneDisclosure` and `useResizableOverlapPane` in page code.
2. Pass `controller.resizeHandleProps` into `OverlapPane` or a typed business wrapper such as `ToolDialogResourcePane` / `ResourcePrepWorkbenchMain`.
3. Pass `controller.groupProps` to `OverlapPaneGroup` and `controller.overlapState` to the pane instead of duplicating collapsed/expanded state, resized state, local width variables, or clearing geometry in CSS.
4. Use `collapseMode: "after-min"` for panes that can collapse by dragging past the minimum. Use `expandMode: "after-max"` only when dragging past the maximum should become a full-pane state.
5. Non-overlap horizontal panes use `useResizablePanel` plus `PanelResizeHandle`; overlap pages should not hand-roll pointer listeners, body cursor changes, or keyboard resize handling.

Page layout:

1. `controller.groupProps` puts the persisted width on the workbench group as `--overlap-pane-size` and exposes `data-overlap-pane-collapsed`, `data-overlap-pane-expanded`, and `data-overlap-pane-resized`.
2. The group CSS owns `grid-template-columns`, collapse columns, expanded columns, and sibling hiding. `OverlapPane` owns the outer pane padding; pane CSS owns internal scroll and content density only.
3. Consumers may set semantic class names and sizing parameters, but must not target `.overlap-pane` or override `--overlap-pane-border-*` / `--overlap-pane-radius`.
4. For a right-side detail pane that visually overlaps toward the main area, use `side="left"` and `resizeHandleSide="left"`, matching the reference image-generation workbench.
5. Use `OverlapPaneRevealButton` for collapsed and expanded affordances instead of hand-written reveal buttons.

List and editor inset:

1. Follow the reference image-generation workbench pattern: define one local base inset on the workbench or pane, then apply it to both inline sides.
2. When a neighboring `OverlapPane` contributes `--overlap-pane-reserve-inline-end` or `--overlap-pane-reserve-inline-start`, add the reserve only to the affected inline side: `calc(var(--local-inset) + var(--overlap-pane-reserve-inline-end, 0px))`.
3. Do not hard-code a larger right or left list gutter such as `32px + reserve` when the opposite side uses a different base value. The reserve is a visual overlap compensation, not the list's normal gutter.
4. For centered editor/history surfaces, use the same base inset on the scroll container and center the content with `margin-inline: auto`, `width: 100%`, and a local `max-width`, matching `ToolDialogMain`, `ToolDialogPanel`, and `ToolDialogHistoryShell`.
5. Item-level indentation for markers, timelines, or thumbnails must stay inside the item component. The scroll container owns outer list gutters.

Nesting:

1. Nested overlap panes are allowed only when the nested content is itself a workbench-like split, such as resource preparation setting assets.
2. Each nested split gets its own `OverlapPaneGroup`, `groupProps`, storage key, and `usePersistentOverlapPaneController`.
3. The outer pane remains responsible for the outer page boundary. The nested pane should not add another page-level frame or override overlap chrome.
4. If a pane body needs a different density or scroll policy, add a semantic body class or component prop. Do not patch the overlap pane selector from nested CSS.

## Rules for new UI work

1. Pick the layout chrome first, then choose child component chrome from the contract.
2. A parent pane with `dock`, `floating`, `immersive`, `canvas`, or `split` chrome should not contain another large rounded container as its first child.
3. Use dividers for structural pane boundaries and cards for repeated content items, not both for the same boundary.
4. Avoid parent-selector patching such as `.some-page .some-card { border: 0 }` for new work. Add a variant or chrome prop instead.
5. When moving a component between page and panel hosts, pass an explicit host/chrome prop rather than relying on CSS inheritance.

## Refactor order

1. Stabilize `WorkspaceShell`, `AppContentLayout`, and business-specific page shells such as `AgentPageShell` so app, route, and page responsibilities are not duplicated.
2. Replace ad hoc wrappers such as route-level `Padded` with explicit page shell choices.
3. Map business page layouts to a small set of workbench presets instead of giving each page its own outer chrome rules.
4. Move large rounded frames downward only when they represent repeated items, modal overlays, or genuinely isolated tools.
5. Remove parent-selector visual patches after the corresponding component exposes a real `chrome`, `host`, `variant`, or `density` prop.
