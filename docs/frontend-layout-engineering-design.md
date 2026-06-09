# 前端布局工程设计

## 目的

前端需要一套布局架构，让 resize、拖拽、滚动、dock 面板和嵌入式
workbench 视图都具备可预测的行为。

当前布局在很多情况下视觉上能工作，但很难修改。原因是布局职责分散在
route shell、页面组件、业务 UI 组件、局部 CSS selector、inline style 和拖拽
handler 里。本文定义我们应该逐步迁移到的工程设计。

## 问题描述

MovScript 有多个高密度工作界面：

- app shell 导航和 route chrome
- project detail 页面
- canvas editor
- production orchestration
- content unit timeline workbench
- agent dock 和 agent mode
- resource panels 和 tool dialogs

这些界面都需要 sidebar、可调整尺寸的 pane、overlay panel、滚动区域、drop
target 和坐标转换。现在每个区域都在本地各自解决这些问题，因此出现了这些失效模式：

- 一个层级里的 pane resize 改变了另一个层级的可用几何空间，但接收方并不知道。
- drag handler 直接使用 `clientX` / `clientY` 或 `getBoundingClientRect()`，
  没有共享坐标模型。
- scroll ownership 不明确，导致嵌套的 `overflow: auto` 和 `overflow: hidden`
  互相竞争。
- 未建模的视觉 overlap trick 会让 DOM box model 和交互代码的假设不一致。
  例如页面级负 margin、临时 `:has()` selector 或没有 safe area 的层叠卡片。
- 宽度状态存放在多个地方：React local state、Zustand、localStorage、inline style
  和 CSS variable。
- 业务页面虽然 import 了 layout primitive，但当 primitive 不适合下一个用例时，
  仍然会继续添加页面级 CSS escape hatch。

工程目标不只是让 UI 更整洁。真正目标是让布局行为可审计、可测试，并且修改时具备机械安全性。

## 设计原则

### 每个布局职责只有一个 owner

每个 screen 对下面这些职责都应该只有一个 owner：

- viewport sizing
- route-level chrome
- pane geometry
- scroll ownership
- overlays
- resize state
- drag coordinate conversion

如果两个组件需要知道同一份 geometry，这份 geometry 应该通过共享 layout contract 暴露，
而不是让组件从无关 DOM 节点重新计算。

### 先布局，后装饰

layout primitive 应该先描述结构：

```text
Shell
  -> left pane
  -> center viewport
  -> right pane
  -> bottom dock
  -> overlay layer
```

radius、shadow、surface color 这些装饰不应该改变交互几何。
如果视觉设计需要 overlap，overlap 必须进入 layout contract：谁被覆盖、覆盖多少、
被覆盖 pane 是否预留 safe area、resize handle 和 hit testing 使用哪一个 box。

### 明确 scroll ownership

每个主要 surface 都应该声明一个 scroll owner：

```text
route
  页面作为一整张 document 滚动

workspace
  route 固定；内部 pane 拥有滚动

canvas
  route 固定；canvas viewport 拥有 pan/zoom；side panel 拥有滚动

dialog
  dialog frame 固定；dialog body 拥有滚动
```

只有当内部区域本身是一个真正封闭的工具时，才允许嵌套滚动区域，例如 table、timeline、
chat thread 或 file list。

### 坐标是领域数据

拖拽和 pointer interaction 不应该把原始 DOM 计算散落在各个页面。
每个交互 surface 都应该定义 coordinate adapter：

```ts
type ClientPoint = { x: number; y: number }
type SurfacePoint = { x: number; y: number }

interface CoordinateSpace {
  fromClient(point: ClientPoint): SurfacePoint
  toClient(point: SurfacePoint): ClientPoint
}
```

例子：

- canvas: client point -> React Flow point
- timeline: client point -> timeline seconds
- vertical reorder list: client point -> before/after target
- agent panel tabs: client point -> tab insertion position

交互代码应该调用 adapter。它不应该直接依赖 label column、scroll offset、zoom factor、
pane width 或 CSS 实现细节。

### 状态必须有稳定归属

layout state 应该放在最窄且稳定的 ownership boundary：

- App shell pane state 属于 app shell layout store。
- Workbench pane state 属于 workbench layout controller。
- Canvas viewport state 属于 canvas editor controller。
- 临时 drag hover state 属于 interaction controller。
- 持久化用户偏好应该由同一个 owner 负责读写。

避免这种模式：某个组件拥有 local state，同时又把它 mirror 到另一个 global store，
只是为了让父组件能给兄弟组件设置尺寸。

## 建议的布局模型

### Route Shell

route shell 只负责 app-level chrome：

- app window header slots
- global navigation sidebar
- global assistant dock slot
- terminal dock slot
- route viewport

route shell 不应该知道页面内部的 workbench 结构。它应该提供 slot 和 geometry variable：

```text
AppShell
  leftNav
  centerRouteViewport
  rightAssistantDock
  bottomTerminalDock
```

route viewport 应该接收明确的 scroll mode：

```ts
type RouteScrollMode = 'document' | 'workspace' | 'canvas' | 'hidden'
```

关键规则是：shell 选择外层滚动行为，页面只能在自己请求的 mode 内继续决定内部滚动。

### Workbench Layout

所有高密度页面都应该使用共享 workbench layout primitive，而不是从零开始本地拼 flex/grid。

```text
WorkbenchLayout
  topBar?
  leftPane?
  centerPane
  rightPane?
  bottomPane?
  overlayLayer
```

每个 pane 应该用 typed constraints 声明：

```ts
type PaneSpec = {
  id: string
  side: 'left' | 'right' | 'bottom'
  defaultSize: number
  minSize: number
  maxSize: number | ((container: LayoutContainer) => number)
  collapsedSize?: number
  defaultState?: PaneDisplayState
  allowedStates?: PaneDisplayState[]
  collapsible?: boolean
  expandable?: boolean
  persistent?: boolean
}
```

layout primitive 应该处理：

- flex/grid placement
- min/max clamping
- collapsed state
- resize handle placement
- resize 过程中的 body cursor 和 user-select
- persisted size read/write
- 提供给子组件使用的 CSS variables

业务组件不应该重新实现这些机制。

### Pane Display State

pane 的展开、缩略和隐藏必须是 layout controller 拥有的状态机，而不是 CSS class 的临时组合。
状态语义应该稳定：

```ts
type PaneDisplayState = 'default' | 'collapsed' | 'expanded' | 'hidden'
```

- `default`：正常宽度，使用 `defaultSize` 或用户 resize 后的 size。
- `collapsed`：缩略态，保留一个稳定入口，例如 rail、icon button 或 summary strip。
- `expanded`：展开态，pane 占据更大区域，例如 max size、主内容覆盖面或 workbench 近全宽。
- `hidden`：完全不参与布局，通常只给 route/shell 级开关使用。

`collapsed` 不应该默认等同于 `width: 0`。如果用户需要可发现的恢复入口，缩略态应该有
`collapsedSize`。`width: 0` 更接近 hidden，必须由外部 header、global shortcut 或 overlay
reveal button 提供恢复入口。

推荐状态规则：

- button collapse：`default` / `expanded` -> `collapsed`
- button restore：`collapsed` -> `default`
- button expand：`default` / `collapsed` -> `expanded`
- button unexpand：`expanded` -> `default`
- drag below min：只有 `collapseMode: 'after-min'` 才进入 `collapsed`，否则 clamp 到 min。
- drag above max：只有 `expandMode: 'after-max'` 才进入 `expanded`，否则 clamp 到 max。
- responsive temporary collapse 不能覆盖用户显式保存的 pane preference。

状态带来的交互规则也要由 controller 处理：

- `collapsed` 时 pane body 不接收 pointer、drop 和内部滚动。
- `collapsed` 或 `hidden` 时 focus 不能留在 pane body 内。
- `expanded` 时 safe area、resize handle、hit map 和 overlay layer 都要使用展开后的 interaction box。
- 持久化状态只记录用户显式动作；临时 viewport fallback 不写入 storage。

app shell 左侧栏适合 `collapsedSize: 44` 的 rail。assistant pane 如果没有 rail，可以使用
`hidden` 或 `collapsedSize: 0`，但恢复入口必须在 header 或全局控制里。workbench 内的
resource/detail pane 更适合缩略成 reveal button 或 narrow rail，而不是直接消失。

### Stacked Pane / OverlapPane

层叠布局不是一种例外 CSS trick，而是一种需要被建模的 layout primitive。
当前代码里已经有两类实现，应该在设计上明确区分。

#### Offset Stacking

Offset stacking 适合 app shell 这种相邻 pane 看起来像卡片叠放的布局：

```text
left slot       center slot       right slot
stable width    stable width      stable width
     \________ visual overlap ________/
```

当前 `WorkspaceShell` 的 stacked layout 就是这个方向：

- `.app-shell[data-layout="stacked"] .app-shell__slots` 定义 `--app-shell-stack-overlap: 24px`
- 后一个 slot 用负 `margin-left` 往前压住前一个 slot
- 前一个 slot 用同等 `padding-right` 预留内容 safe area
- z-index 决定 left、center、right 的视觉层级
- collapsed/hidden pane 会清掉 overlap padding、margin 和 shadow

这种方式可以保留卡片层叠效果，但它必须满足几个约束：

- overlap 数值来自 primitive token，例如 `--app-shell-stack-overlap`
- 被覆盖 pane 必须显式预留 safe area，不能让内容或 resize handle 被盖住
- collapsed/hidden state 必须清掉 overlap
- 测试要验证 overlap token、safe area、collapsed state 和边框/阴影规则
- 页面组件不能自己写 sibling 负 margin 来复刻效果

Offset stacking 的问题不是负 margin 本身，而是负 margin 没有成为 layout contract。
如果 offset、safe area、z-index 和 collapsed 行为都由 primitive 拥有，它就是受控布局。

#### Base Layout + Overlap Surface

`OverlapPaneGroup` / `OverlapPane` 更适合 workbench 内部的 master-detail、rail-detail、
filter-detail 这类局部布局。它的核心思想是：

```text
OverlapPaneGroup owns geometry and resize bounds
  base content region reserves overlap safe area
  OverlapPane renders the raised surface, shadow, radius, border and resize handle
```

当前实现里的契约包括：

- `OverlapPaneGroup` 输出 `.overlap-pane-layout`
- `OverlapPane` 输出 `.overlap-pane`，并声明 `data-overlap-side`、`data-overlap-state`
  和 `data-overlap-chrome`
- `usePersistentOverlapPaneController` 拥有 pane size、collapsed、expanded、storage key
  和 `--overlap-pane-size`
- `useResizableOverlapPane` 复用 shared `useResizablePanel`
- CSS 用 `--overlap-pane-overlap` / `--overlap-pane-offset` 描述视觉覆盖距离
- 被覆盖区域通过 `--overlap-pane-reserve-inline-start/end` 预留内容空间

这种方式比 shell-level offset stacking 更接近“底层布局 + 上层表面”。
领域坐标和 resize bounds 应该来自 group/controller；阴影、圆角、边框和少量视觉延展
属于 pane surface。业务 workbench 应该优先使用这一套，而不是在页面 CSS 里手写 overlap。

#### 选择规则

- app shell / route shell 级卡片层叠：使用 offset stacking。
- workbench 内部 pane 覆盖主内容：使用 `OverlapPaneGroup` / `OverlapPane`。
- 临时菜单、selection toolbar、drop indicator：使用 overlay layer。
- 需要影响领域坐标的 drag/drop 区域：不要把 overlap 区域当作领域坐标原点。
- 只是 shadow、radius、border 的视觉层次：作为 pane surface 装饰处理。

#### Interaction Geometry

层叠布局里的拖拽不能直接复用“原布局盒 = 交互盒”的假设。
每个参与拖拽或 resize 的 surface 至少要区分三种 box：

```text
layout box
  用于 flex/grid sizing、min/max、collapsed state

visual box
  用于 shadow、radius、offset、overlap surface

interaction box
  用于 hit testing、drop preview、resize handle、coordinate adapter
```

默认规则：

- drag coordinate adapter 使用 interaction box，不使用 visual box。
- visual overlap 区域默认是装饰，不能自动成为 drop target。
- 如果 overlap 区域确实要可交互，必须注册成独立 hit zone。
- resize handle 的 hit area 跟随 pane controller 声明的 edge，不跟随 shadow 或 decorative border。
- pointer drag 一旦开始，后续 pointermove 由 interaction controller 接管，
  不能依赖每一帧的 DOM target 仍然落在同一个元素上。

Offset stacking 下，后一个 pane 视觉上压住前一个 pane。前一个 pane 的内容 safe area
必须把可交互内容让出来，因此被压住的那一条 overlap band 不应该继续承载前一个 pane 的
drop target。交互归属通常是：

```text
covered overlap band -> top pane / resize edge / decoration
reserved content area -> previous pane content and drop targets
```

Base layout + overlap surface 下，`OverlapPaneGroup` 拥有 layout 和 resize bounds，
`OverlapPane` 拥有 raised surface。主内容如果要接收 drag/drop，应该把
`--overlap-pane-reserve-inline-start/end` 排除在可投放区域之外，或者把它注册成
单独的 drop zone，而不是让底层内容在视觉上被覆盖后仍然接收拖拽。

推荐抽象：

```ts
type InteractionBox = {
  id: string
  role: 'content' | 'pane-surface' | 'resize-edge' | 'overlay'
  rect: DOMRectReadOnly
  zIndex: number
  accepts?: (payload: DragPayload) => boolean
}

interface LayoutHitMap {
  boxes(): InteractionBox[]
  boxFromClient(point: ClientPoint, payload?: DragPayload): InteractionBox | null
}
```

drag/drop 流程应该是：

1. drag start 生成 typed payload。
2. pointer 或 native drag event 只提供 `clientX/clientY`。
3. layout hit map 先决定当前 interaction box。
4. 对应 surface 的 coordinate adapter 把 client point 转成领域坐标。
5. preview 和 commit 都使用领域坐标，不读取无关 DOM 几何。

### Overlay Layer

overlay 应该是一等 slot：

```text
WorkbenchLayout
  centerPane
  overlayLayer
    contextMenu
    selectionToolbar
    dropIndicator
    temporaryInspector
```

overlay layer 应该相对 workbench viewport 定位，而不是相对 page body 定位。
这样 app shell、agent dock 或 terminal 打开时，context menu、selection frame 和
drop indicator 仍然稳定。

### Canvas Layout

Canvas 应该被视为一种专门的 workspace mode：

```text
CanvasWorkbench
  palettePane
  flowViewport
  workflowRail
  workflowPane
  overlayLayer
```

规则：

- React Flow 拥有 pan 和 zoom。
- App shell 拥有 route chrome。
- Canvas workbench 拥有 palette 和 workflow pane geometry。
- Canvas drop logic 接收 client point，但必须立即通过 flow coordinate adapter 转换。
- Workflow side panel width 应该是 pane spec，而不是本地临时 state。

### Timeline Layout

Timeline 也应该有明确坐标模型：

```text
TimelineViewport
  labelColumn
  timeCanvas
    ruler
    lanes
    blocks
```

time canvas 应该是唯一用于 timeline coordinate conversion 的元素。
drag logic 不应该把整行或 lane grid 当作时间原点。

```ts
interface TimelineCoordinateSpace {
  secondsFromClientX(clientX: number): number
  clientXFromSeconds(seconds: number): number
  snap(seconds: number, movingItemId?: string): number
}
```

规则：

- label column width 是 layout，不是 timeline time。
- horizontal scroll offset 是 coordinate adapter 的一部分。
- zoom level 是 coordinate adapter 的一部分。
- visible width 和 virtual canvas width 不能在 CSS 中互相冲突。
- block 内部的 drag offset 应该记录为 timeline seconds，而不是先存 DOM/block ratio，
  再在后续 drop 中重新解释。

## Drag And Drop 设计

### Drag Payload

使用 typed payload helper，替代散落的 `dataTransfer.setData()` 字符串。

```ts
type DragPayload =
  | { kind: 'resource'; resourceId: number }
  | { kind: 'canvas-node-template'; nodeType: string }
  | { kind: 'workflow-canvas'; canvasId: number }
  | { kind: 'content-unit-timeline-item'; unitId: number; offsetSec: number }
  | { kind: 'production-segment'; segmentId: number }
  | { kind: 'production-scene-moment'; momentId: number }
```

Helpers：

```ts
writeDragPayload(event.dataTransfer, payload)
readDragPayload(event.dataTransfer)
```

这样可以避免页面之间通过 `application/canvas-resource` 之类字符串 key 形成隐式耦合。

### Drop Target

每个 drop target 都应该定义：

- accepted payload kinds
- coordinate space
- effect: copy, move, link
- validation
- preview state
- commit action

```ts
interface DropTarget<TPayload extends DragPayload> {
  accepts(payload: DragPayload): payload is TPayload
  preview(payload: TPayload, point: ClientPoint): DropPreview
  commit(payload: TPayload, point: ClientPoint): void | Promise<void>
}
```

这会让 drag validation、hover preview 和 mutation behavior 放在同一个地方。

### Pointer Interaction

内部 UI gesture 应该优先使用 pointer events，例如 pane resize、scrubber、timeline
trimming 和自定义拖动。只有当操作需要 OS/browser file transfer 或跨组件 drag data 时，
才使用原生 HTML5 drag/drop。

推荐拆分：

- file drops: native drag/drop
- resource drag between panels: native drag/drop 可以接受
- canvas node movement: React Flow pointer model
- timeline item movement: 更推荐 pointer-driven interaction
- pane resizing: shared pointer-driven `useResizablePanel`
- reorder lists: pointer-driven 或 accessible list reorder commands

## CSS 规则

### Layout CSS 应该足够无聊

优先使用稳定 geometry：

```css
.layout {
  display: grid;
  grid-template-columns: var(--left-pane-width) minmax(0, 1fr) var(--right-pane-width);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
```

避免让核心 layout math 依赖：

- 未被 primitive 建模的结构 overlap
- 页面级 sibling 负 margin
- 用于核心 geometry、但没有 contract/test 覆盖的 `:has()`
- layout sizing 里的 `!important`
- 一个元素既 `overflow: hidden`，又被期望暴露更大的 virtual canvas
- inline style、CSS variable 和 class selector 里重复定义同一份 width

### Controlled Overlap

如果视觉设计需要 stacked panes，优先使用两种受控模型。

Offset stacking：

```text
stable sibling slots
  later slot shifts over previous slot
  previous slot reserves safe area
```

适用：app shell / route shell 级卡片层叠。

Base layout + overlap surface：

```text
stable pane group
  base layout and resize bounds
  overlap pane surface with shadow/radius/offset
```

适用：workbench 内部 master-detail、filter-detail、rail-detail。

通用规则：

- overlap token 必须由 primitive 拥有
- 被覆盖内容必须有 safe area
- collapsed/hidden state 必须清理视觉覆盖
- resize handle 和 hit testing 使用 primitive 声明的稳定 box
- drag coordinate adapter 必须排除 decorative overlap
- 页面级 CSS 不能绕过 primitive 新增结构 overlap

### CSS Variables

CSS variable 很适合把 geometry 发布给子组件：

```css
.workbench-layout {
  --workbench-left-pane-width: 280px;
  --workbench-right-pane-width: 340px;
  --workbench-bottom-pane-height: 220px;
}
```

规则：

- controller 拥有 value
- CSS 消费 value
- 子组件可以在视觉上读取 variable
- 子组件不应该独立 mutate 它

## 可访问性要求

每个 layout interaction 都需要键盘和 screen-reader 行为：

- resize handle 暴露 `role="separator"`、orientation、min/max/current value 和键盘步进
- collapsible pane 使用带明确 label 的 button
- 只支持拖拽的 reorder action 必须有 button 替代操作
- drop target 尽可能声明可接受内容和 invalid state
- focus 不能进入 collapsed 或 hidden pane

## 测试策略

### Unit Tests

测试纯 geometry functions：

- pane size clamping
- persisted size normalization
- timeline seconds/client conversion
- snap behavior
- before/after insertion position
- drag payload encode/decode

### Component Tests

单独测试 layout primitives：

- collapsed panes 没有可交互 body
- resize handles 能更新 geometry
- scroll mode 把 overflow 放在预期元素上
- overlay layer 相对 workbench 定位

### Playwright Tests

用 viewport-based tests 验证真实交互：

- app shell 下 assistant open/closed
- terminal open 且处于 center/right placement
- canvas node drop 落到预期 flow coordinates
- timeline drag 在 zoom 和 horizontal scroll 后落到预期时间
- production reorder 在窄屏和宽屏都可工作
- 主要 workbench 没有不连贯的文字重叠

对于 drag coordinate tests，断言领域结果，而不是只断言视觉移动。
例如拖动 content unit 后，应该断言保存后的 `start_sec`。

## 重构计划

根因不是某几个 CSS selector 写得不够好，而是 layout intent、layout geometry、
visual surface 和 interaction geometry 没有同一个 contract。现在 `packages/ui`
已经承担了大部分 primitive 和样式，但 `apps/frontend` 页面仍然在本地决定 storage key、
pane state、drag 坐标和部分布局逃生口。

这次重构不做兼容层。目标不是让旧布局和新布局长期共存，而是把 layout 从入口到页面、
从视觉到交互重新收敛到同一套 contract。旧的 storage key、旧的 page-level CSS trick、
旧的 drag payload string 和旧的 DOM coordinate 读取都可以在切换时删除。

破坏式收敛规则：

- 不保留 old/new layout 双轨。
- 不新增 compatibility wrapper。
- 不为了旧 selector 保留 class alias。
- 不读取旧 pane width storage key；pane state 使用新 registry key，旧偏好可以重置。
- 不继续维护页面级 overlap/resize/scroll escape hatch。
- 每个页面切换到新 layout spec 的同一个改动里，删除对应旧布局代码和旧 contract test。

目标是把布局拆成四层：

```text
@movscript/ui
  layout primitives, CSS tokens, visual surfaces, resize hooks

apps/frontend layout runtime
  route layout registry, pane controllers, persisted state, shell composition

feature pages
  declare layout intent and domain behavior

interaction controllers
  drag payloads, hit maps, coordinate adapters, commit actions
```

`packages/ui` 不应该知道某个 route 的业务状态；`apps/frontend` 不应该手写视觉层叠
或 resize DOM 细节；feature page 不应该直接解释 shell geometry。

### 当前页面需求校准

这份计划覆盖的不是单一页面，而是当前前端里已经存在的几类页面形态。执行前要先把
“页面需求”落成 repo 内可审计的 route/layout inventory，避免重构时只迁移视觉结构，
没有迁移滚动、拖拽和 pane 状态。

当前页面至少包括这些需求：

- detail shell：普通业务 route 运行在全局 sidebar、assistant dock 和 terminal dock 内。
- agent shell：agent mode 有独立左侧栏、右侧内容 pane、terminal center-right placement。
- canvas route：route 外层固定，React Flow 拥有 pan/zoom 和 drop coordinate conversion。
- project workbench：项目规范、前期准备、剧本工作台、内容编排使用高密度 workspace。
- resource/scripts/tools/dialog：主要需求是 pane width、overlap、scroll owner 和资源 drop。
- content timeline：时间轴 drag 必须考虑 label column、horizontal scroll、zoom 和 snap。

当前 `projectWorkbenchDefinitions` 已经描述了业务 workbench 的 stage、route、owns/reads
和 review query。layout registry 不应该复制这些业务定义，但应该引用同一批 route/workbench
id，补充纯布局信息：

```ts
type WorkbenchLayoutSpec = {
  workbenchId: ProjectWorkbenchId
  routeId: string
  surface: LayoutSurfaceKind
  scrollMode: RouteScrollMode
  shellLayout: 'flush' | 'stacked'
  panes: LayoutPaneSpec[]
  interactions: InteractionSurfaceSpec[]
}
```

命名也要跟当前页面对齐：`/project/production/orchestration` 已经不是主要入口，
当前活跃的 production 需求在“剧本工作台 / orchestration_production”里。文档中提到
`Production orchestration` 时，默认指这个当前剧本工作台和它的 production workspace/review
能力，而不是已下线的旧 route。

破坏式迁移可以重置旧 pane width 偏好，但这必须是明确产品决定。如果某个页面要求保留用户
历史布局偏好，它需要在 Phase 0 inventory 里标记为 `preferenceMigration: required`，
否则默认不读取旧 storage key。

### 当前页面布局清单初稿

这张表是 Phase 0 inventory 的起点。它先按当前静态 route 说明页面布局，不替代后续
typed registry。`目标 scroll owner` 是迁移目标；`待确认` 表示需要在实现前继续读页面 CSS
和交互代码。

#### Shell And Recovery Routes

| Route / 入口 | 当前页面 | 当前 shell | 目标 scroll owner | Pane / overlay | 迁移说明 |
| --- | --- | --- | --- | --- | --- |
| unauth `*` | `AuthPage` | standalone auth surface | document | 无 app shell pane | 保持独立；只声明 auth surface 和 document scroll。 |
| `/onboarding` | `OnboardingPage` | standalone onboarding surface | document | 无 app shell pane | 保持独立；不要引入 workspace shell。 |
| `/invite/:token` | `InvitePage` | standalone route；登录后也可直达 | document | 无 app shell pane | 作为 recovery/document route 进入 registry。 |
| `/app/settings` | 未登录时 `AppSettingsPage`；登录后 `AccountSettingsRoute` | recovery standalone / dialog redirect | document / overlay | account settings dialog | 登录态不渲染页面 body，应登记为 overlay/dialog route action。 |
| `/org/select` | `OrgSelectPage` | detail shell，`requireOrg=false` | document | global left/right/terminal shell slots | 内容用 contained/wide document，不应自管 shell pane。 |
| `/`、`/projects` | `GlobalHomePage` | detail shell | document | global left/right/terminal shell slots | 普通 document page；只管内容宽度。 |
| runtime routes | `runtimeRoutes[*]` | detail shell 或 account dialog | document by default | 由 runtime route 声明 | registry 需要允许 runtime 注入 route layout spec，默认不能新增 page-level layout escape hatch。 |

#### Project Workbench Routes

| Route / 入口 | 当前页面 | 当前 shell | 目标 scroll owner | Pane / overlay | 迁移说明 |
| --- | --- | --- | --- | --- | --- |
| `/project/standards` | `ProjectStandardsPage` | detail shell + `WorkbenchProjectShell` | workspace | workspace review dialog/panel | 绑定 `project_standards` workbench id；review overlay 进入 overlay layer。 |
| `/project/pre-production` | `PreProductionPage` | detail shell + local workbench | workspace | setting/detail/resource overlap panes | 收敛 asset/detail pane specs、storage key、collapse/expand state。 |
| `/project/scripts/workbench` | `ScriptsPage` | detail shell + script workbench | workspace | script list + detail `OverlapPane` | 绑定 `orchestration_production` workbench id；production workspace/review 能力属于这个 route。 |
| `/project/scripts` | redirect | detail shell | hidden | 无 | 删除旧 route 布局，只保留 redirect contract。 |
| `/project/production/orchestration` | redirect to scripts workbench | detail shell | hidden | 无 | 旧 production orchestration route 已下线；文档里的 production 迁移指 scripts workbench。 |
| `/project/content-units/workbench` | redirect to editor | detail shell | hidden | 无 | 保留兼容 redirect；真实布局在 editor route。 |
| `/project/content-units/editor` | `ContentUnitWorkbenchPage` | detail shell + content workbench | workspace | filter/sidebar/detail overlap + timeline | 优先迁移 timeline coordinate adapter、drag payload 和 pane registry。 |
| `/project/tasks` | `TasksPage` | detail shell | document | dialogs + agent panel bridge | 普通 project document page；task dialog 是 overlay，不拥有 route shell。 |
| `/project/overview` | redirect to scripts workbench | detail shell | hidden | 无 | 只保留 redirect contract。 |

#### Agent And Canvas Routes

| Route / 入口 | 当前页面 | 当前 shell | 目标 scroll owner | Pane / overlay | 迁移说明 |
| --- | --- | --- | --- | --- | --- |
| `/project/agent` | `AgentModePage` | agent shell | workspace | agent sidebar、content pane、terminal center-right | app layout runtime 应拥有 sidebar/content pane size、collapsed state 和 terminal placement。 |
| `/project/agent/canvases` | `AgentModeCanvasListPage` | agent shell | document inside agent shell | agent sidebar/content pane | 继承 agent shell spec；页面内容按 document/list 处理。 |
| `/canvases` | `CanvasListPage` | detail shell + contained layout | document | 无 local pane | 普通 list document；打开 editor 时进入 canvas shell。 |
| `/canvases/:id` | `CanvasEditorPage` | dedicated canvas `WorkspaceShell` | canvas | palette pane、flow viewport、workflow pane、runtime dialogs | canvas route 独立 registry spec；drop 坐标必须走 React Flow adapter。 |

#### Tools And Resource Routes

| Route / 入口 | 当前页面 | 当前 shell | 目标 scroll owner | Pane / overlay | 迁移说明 |
| --- | --- | --- | --- | --- | --- |
| `/tools/ref-image-gen` | `RefImageGenPage` | detail shell + tool workspace/dialog | workspace | resource pane + main/output pane | 使用 shared tool layout spec；resource drop 是 registered file/resource target。 |
| `/tools/ref-video-gen` | `RefVideoGenPage` | detail shell + tool workspace/dialog | workspace | resource pane + main/output pane | 同 ref-image；资源 pane width 走 registry。 |
| `/tools/motion-imitation` | `MotionImitationPage` | detail shell + tool workspace/dialog | workspace | resource pane + main/output pane | 同 ref-image；参数区滚动由 main pane 拥有。 |
| `/tools/style-transfer` | `StyleTransferPage` | detail shell + tool workspace/dialog | workspace | resource pane + main/output pane | 同 ref-image。 |
| `/tools/multi-angle` | `MultiAnglePage` | detail shell + tool workspace/dialog | workspace | resource pane + main/output pane | 同 ref-image。 |
| `/tools/plugin/:pluginId` | `PluginToolPage` | detail shell | workspace by plugin spec | plugin-defined panes | plugin 页面必须声明 layout spec；默认不能直接写 shell/layout escape hatch。 |
| `/resources` | `ResourcesPage` | detail shell | document route；resource primitive owns collection scroll | resource grid/list、drag source、context menu | 当前是主要 resource drag source；payload helper 和 context menu overlay 要进入 interaction model。 |
| `/resources/external` | `ExternalResourceSearchPage` | detail shell | document | search/results panels | 普通 document，外部资源选择或导入 overlay 需要登记。 |
| `/shot-library` | `ShotLibraryPage` | detail shell | document | import/review dialog、video workspace editor | dialog 内部是封闭工具；需要独立 dialog scroll owner 和 resize/measurement adapter。 |
| `/jobs` | `JobsPage` | detail shell | document | job cards/list/detail actions | 普通 document；job result preview dialog 走 overlay。 |
| `/plugins` | `ClientPluginsPage` | detail shell | document | plugin list/detail | 普通 document；安装/配置 dialog 走 overlay。 |

#### Agent Management Routes

| Route / 入口 | 当前页面 | 当前 shell | 目标 scroll owner | Pane / overlay | 迁移说明 |
| --- | --- | --- | --- | --- | --- |
| `/agent` | `AgentConsolePage` | detail shell | workspace | main control pane + logs pane | 控制台主列和日志列登记为 workspace panes；页面只组合内容。 |
| `/model-providers` | `ModelProvidersPage` | detail shell | document | settings cards/forms | 普通 document；provider test dialog 走 overlay。 |
| `/agents` | redirect to provider route | detail shell | hidden | 无 | 只保留 redirect contract。 |
| `/agents/:providerRouteKey` | `AgentsPage` | detail shell | document | provider agent tabs/config panels | 当前是 tabbed document；只有引入固定 list/detail pane 时才升级 workspace。 |
| `/workspace/config` | `MovScriptWorkspaceFilesPage` | detail shell | workspace | file tree pane + editor pane | 文件树和编辑器登记为 workspace panes，各自拥有滚动。 |
| `/workspace/review` | `MovScriptWorkspaceReviewPage` | detail shell | workspace | summary/effects pane + raw JSON pane | review summary 和 raw editor 登记为 workspace panes，各自拥有滚动。 |
| `/agent/files` | redirect to workspace config | detail shell | hidden | 无 | 只保留 redirect contract。 |
| `/agent/settings` | `AIAgentSettingsPage` | detail shell | document | settings forms | 普通 document。 |
| `/agent/runs` | `AgentRunsPage` | detail shell | document | run list/cards | 普通 document，run detail route 单独登记。 |
| `/agent/runs/:runId` | `AIAgentRunPage` | detail shell | workspace | run sidebar + trace/debug pane | run sidebar 和 trace/debug main 登记为 workspace panes。 |
| `/agent/model-providers` | redirect to `/model-providers` | detail shell | hidden | 无 | 删除旧 route 布局，只保留 redirect contract。 |
| `/admin/*` | redirect to root | detail shell | hidden | 无 | enterprise/admin overlay 不在 community route shell 内维护。 |

#### Account And Organization Routes

| Route / 入口 | 当前页面 | 当前 shell | 目标 scroll owner | Pane / overlay | 迁移说明 |
| --- | --- | --- | --- | --- | --- |
| `/user` | `AccountSettingsRoute(tab=profile)` | dialog action then redirect | overlay | account settings dialog | 不是 document page；registry 标记 route action。 |
| `/org/settings` | `AccountSettingsRoute(tab=workspace)` | dialog action then redirect | overlay | account settings dialog | 同 `/user`。 |

#### 逐页布局层级表

这张表把当前静态 route 展开到页面内部布局层级，用来指导后续逐页迁移。`Route viewport`
指 `AppRouteViewport` 的目标滚动模式；`页面布局层级` 只描述布局 ownership，不描述视觉装饰。
覆盖口径以 `App.tsx` 里实际挂载的 `<Route>` 为准，`runtimeRoutes[*]` 作为动态扩展单独登记。
`ROUTES.project.production` 当前只是 route constant，没有挂载页面，不列入逐页迁移表。

| Route / 入口 | 页面组件 / 行为 | Shell 层 | Route viewport | 页面布局层级 | Pane / overlay ownership | 迁移判断 |
| --- | --- | --- | --- | --- | --- | --- |
| unauth `*` | `AuthPage` | standalone auth surface | document | auth form document；页面自己只负责内容排版 | 无 app shell pane | registry 声明 standalone document route。 |
| `/onboarding` | `OnboardingPage` | standalone onboarding surface | document | onboarding document flow | 无 app shell pane | 保持 flush shell，不接入 workspace。 |
| `/invite/:token` | `InvitePage` | standalone recovery route；登录态也绕过 `ShellLayout` | document | invite/recovery document flow | 无 app shell pane | 保持 recovery route；不依赖 org/project guard。 |
| `/app/settings` unauth | `AppSettingsPage` | standalone recovery route | document | settings form document | 无 app shell pane | 只在未登录时渲染页面 body。 |
| `/app/settings` auth | `AccountSettingsRoute(tab=settings)` | detail shell action | hidden | 不渲染页面 body；打开 account settings dialog 后 redirect | account settings dialog | registry 标记 `overlay-action`。 |
| `/org/select` | `OrgSelectPage` | detail shell，`requireOrg=false` | document | contained document，宽度 `wide` | app shell sidebar/assistant/terminal | 页面不声明局部 pane。 |
| `/` | `GlobalHomePage` | detail shell | document | max-width document：项目列表 + 快捷入口双栏 | app shell sidebar/assistant/terminal；project required dialog | 普通 document route。 |
| `/projects` | `GlobalHomePage` | detail shell | document | 与 `/` 相同，项目选择/创建 document | app shell sidebar/assistant/terminal；project required dialog | 与 home 共用 layout spec。 |
| runtime routes | `runtimeRoutes[*]` | detail shell 或 account dialog action | document by default | runtime element，可被 `RouteContentShell` 包裹 | 由 runtime route 声明；可能需要 org/project/admin guard | runtime 注入必须产出 layout spec，默认不能新增页面级 escape hatch。 |
| `/project/standards` | `ProjectStandardsPage` | detail shell + `WorkbenchProjectShell` | workspace | workbench shell：标准内容区 + review/summary 区 | workbench review overlay/panel；app shell panes | 绑定 `project_standards` workbench id。 |
| `/project/pre-production` | `PreProductionPage` | detail shell + pre-production workbench | workspace | 主资源/资产区 + 右侧 detail/resource overlap pane | workbench right detail pane；app shell panes | detail pane size/state 归 route layout registry。 |
| `/project/scripts/workbench` | `ScriptsPage` | detail shell + script workbench | workspace | script list/main authoring 区 + 右侧 detail `OverlapPane` | workbench right detail pane；app shell panes | 绑定 `orchestration_production` workbench id。 |
| `/project/scripts` | redirect | detail shell | hidden | 无页面 body | 无 | 只保留 redirect contract。 |
| `/project/production/orchestration` | redirect to scripts workbench | detail shell | hidden | 无页面 body | 无 | 旧 production route 不再拥有布局。 |
| `/project/overview` | redirect to scripts workbench | detail shell | hidden | 无页面 body | 无 | `ProjectOverviewPage` 不作为当前可达页面布局迁移。 |
| `/project/tasks` | `TasksPage` | detail shell | document | task board/list document，详情和操作通过 dialog/bridge 打开 | task dialogs；agent panel bridge；app shell panes | route 自身是 document；task dialog 单独登记 overlay。 |
| `/project/content-units/workbench` | redirect to editor | detail shell | hidden | 无页面 body | 无 | 保留兼容入口；真实布局在 editor route。 |
| `/project/content-units/editor` | `ContentUnitWorkbenchPage` | detail shell + content workbench | workspace | filter/sidebar + candidate/detail overlap + timeline/editor 区 | workbench right detail pane；timeline coordinate adapter；dialogs | 绑定 `content_orchestration` workbench id。 |
| `/project/agent` | `AgentModePage` | agent shell | workspace | agent mode：左 agent sidebar + route content + 右 assistant/content pane + terminal | app shell agent sidebar/content/terminal panes | shell runtime 拥有 agent pane size、collapse 和 terminal placement。 |
| `/project/agent/canvases` | `AgentModeCanvasListPage` | agent shell | document inside agent shell | canvas list document，运行在 agent shell 内容区 | app shell agent panes | 继承 agent shell spec；页面只管列表内容。 |
| `/canvases` | `CanvasListPage` | detail shell + `RouteContentShell(width=normal)` | document | contained canvas list document | app shell panes | 普通 list document；编辑器单独 route。 |
| `/canvases/:id` | `CanvasEditorPage` | dedicated canvas `WorkspaceShell` | canvas | canvas viewport + left palette + right workflow pane + header controls | canvas palette/workflow panes；runtime dialogs | React Flow pan/zoom/drop 坐标归 canvas adapter。 |
| `/tools/ref-image-gen` | `RefImageGenPage` -> `ToolDialog` | detail shell + tool reference workbench | workspace | tool frame：main prompt/output pane + history + resource pane | tool resource pane；app shell panes | 使用 shared tool layout spec；resource pane width 进 registry。 |
| `/tools/ref-video-gen` | `RefVideoGenPage` -> `ToolDialog` | detail shell + tool reference workbench | workspace | 同 ref-image：main/output/history + resource pane | tool resource pane；app shell panes | 与 ref-image 共用 pane spec。 |
| `/tools/motion-imitation` | `MotionImitationPage` -> `ToolDialog` | detail shell + tool reference workbench | workspace | 同 ref-image；参数区滚动由 main pane 拥有 | tool resource pane；app shell panes | 与 ref-image 共用 pane spec。 |
| `/tools/style-transfer` | `StyleTransferPage` -> `ToolDialog` | detail shell + tool reference workbench | workspace | 同 ref-image；风格资源由 resource pane 管理 | tool resource pane；app shell panes | 与 ref-image 共用 pane spec。 |
| `/tools/multi-angle` | `MultiAnglePage` -> `ToolDialog` | detail shell + tool reference workbench | workspace | 同 ref-image；多角度输入在 main pane 内组织 | tool resource pane；app shell panes | 与 ref-image 共用 pane spec。 |
| `/tools/plugin/:pluginId` | `PluginToolPage` | detail shell + plugin workbench | workspace by plugin spec | plugin host 根据 plugin spec 渲染 panes/content | plugin-defined panes；app shell panes | plugin 必须声明 layout spec，不能直接写 shell escape hatch。 |
| `/resources` | `ResourcesPage` | detail shell | document route；resource primitive owns collection scroll | toolbar/filter + grid/list collection + preview/import dialogs | context menu/import dialogs；drag source payload | 主要资源 drag source；先收敛 interaction payload；除非增加固定 detail pane，否则不升级 workspace。 |
| `/resources/external` | `ExternalResourcesPage` | detail shell | document | external search form + results document | import/select overlays | 普通 document route。 |
| `/shot-library` | `ShotLibraryPage` | detail shell | document | shot list/grid document；导入/编辑在 dialog 内完成 | import/review/video workspace dialogs | dialog 内部需要独立 scroll owner 和 measurement adapter。 |
| `/jobs` | `JobsPage` | detail shell | document | toolbar + grid/list job collection + result preview | job preview/action dialogs | 普通 document route。 |
| `/plugins` | `ClientPluginsPage` | detail shell | document | plugin list/detail document | install/config dialogs | 普通 document route。 |
| `/agent` | `AgentConsolePage` | detail shell | workspace target | `AgentPageShell`：metrics 固定区 + main control pane + logs pane | agent console main/log panes；app shell panes | 已登记 workspace panes；控制台列宽/滚动不再扩散到 shell。 |
| `/agent/connections` | `AgentConnectionsPage` | detail shell | workspace target | `AgentPageShell` + `AgentThreePanePageBody`：threads list + event list + raw event 三栏 | agent connections three panes；app shell panes | 已登记 debug workspace panes；窄屏由 shared primitive 降为单列 flow。 |
| `/model-providers` | `ModelProvidersPage` | detail shell | document | provider settings cards/forms document | provider test dialogs | 普通 document route。 |
| `/agents` | redirect to provider route | detail shell | hidden | 无页面 body | 无 | 只保留 redirect contract。 |
| `/agents/:providerRouteKey` | `AgentsPage` | detail shell | document target | provider agent list/config document | provider dialogs/actions | 当前先按 document 登记；若出现固定 list/detail pane 再升 workspace。 |
| `/workspace/config` | `MovScriptWorkspaceFilesPage` | detail shell | workspace target | `AgentPageShell` + `AgentWorkspacesPageBody`：file tree pane + editor pane 双栏 | file tree/editor panes；app shell panes | 已登记 workspace spec；目录和编辑器各自拥有滚动。 |
| `/workspace/review` | `MovScriptWorkspaceReviewPage` | detail shell | workspace target | `AgentPageShell` + `AgentWorkspacesPageBody`：summary/effects pane + raw JSON editor pane 双栏 | review summary/raw panes；app shell panes | 已登记 workspace spec；summary 和 raw textarea 各自滚动。 |
| `/agent/files` | redirect to workspace config | detail shell | hidden | 无页面 body | 无 | 只保留 redirect contract。 |
| `/agent/settings` | `AIAgentSettingsPage` | detail shell | document target | `AgentPageShell`：settings panels + config file browser/editor composite | settings import/test dialogs | 当前可按 document；config file browser/editor 之后可抽成内嵌 workspace primitive。 |
| `/agent/runs` | `AgentRunsPage` | detail shell | document | runs list/cards document | run action dialogs | 普通 document；run detail 单独登记。 |
| `/agent/runs/:runId` | `AIAgentRunPage` | detail shell | workspace target | `AgentPageShell`：run sidebar + trace/debug main pane | run sidebar/main panes；approval/input cards | 已登记 workspace spec；trace panel 独立滚动，sidebar 独立滚动。 |
| `/agent/model-providers` | redirect to `/model-providers` | detail shell | hidden | 无页面 body | 无 | 只保留 redirect contract。 |
| `/admin/*` | redirect to `/` | detail shell | hidden | 无页面 body | 无 | community app 不维护 admin shell。 |
| `/user` | `AccountSettingsRoute(tab=profile)` | detail shell action | hidden | 不渲染页面 body；打开 account settings dialog 后 redirect | account settings dialog | registry 标记 `overlay-action`。 |
| `/org/settings` | `AccountSettingsRoute(tab=workspace)` | detail shell action | hidden | 不渲染页面 body；打开 account settings dialog 后 redirect | account settings dialog | registry 标记 `overlay-action`。 |

### Phase 0: Freeze And Inventory

先停止新增页面级 layout escape hatch。新增布局只能走目标架构，不再扩展旧页面模式。

输出一张 repo 内 inventory：

- route -> scroll mode
- route -> shell surface/chrome/layout
- route -> current route owner：`App.tsx`、`appRouteModel`、project workbench registry 或独立 route
- pane id -> owner、side、default/min/max、storage key
- overlap pane -> offset stacking / `OverlapPane` / overlay layer
- drag surface -> payload kinds、coordinate adapter、drop targets
- `getBoundingClientRect()` usage -> allowed adapter usage / migration target
- page CSS escape hatch -> move to primitive / delete
- current tests -> keep、rewrite、delete with page migration
- old storage key -> reset by default / migrate only with explicit requirement

inventory 只服务于删除和重建，不服务于兼容旧路径。

这张表是后续迁移的控制面，不能只存在于口头认知。

建议 inventory 采用代码旁边的 markdown 或 typed fixture，而不是临时 issue。最小字段：

```ts
type LayoutInventoryItem = {
  routeId: string
  pathnamePattern: string
  currentOwner: string
  targetScrollMode: RouteScrollMode
  targetShellLayout: 'flush' | 'stacked'
  panes: Array<{
    id: string
    currentOwner: string
    targetOwner: 'app-shell' | 'workbench' | 'canvas' | 'dialog'
    storageKey: string
    preferenceMigration: 'reset' | 'required'
  }>
  dragSurfaces: Array<{
    id: string
    payloadKinds: string[]
    coordinateAdapter: 'none' | 'required' | 'existing'
  }>
  escapeHatches: string[]
  tests: Array<{ path: string; action: 'keep' | 'rewrite' | 'delete' }>
}
```

### Phase 1: Define Layout Contracts

先定义最终 typed layout contract。核心类型应该描述 intent，而不是描述 DOM selector：

```ts
type LayoutSurfaceKind = 'route' | 'workspace' | 'canvas' | 'dialog'
type RouteScrollMode = 'document' | 'workspace' | 'canvas' | 'hidden'
type OverlapMode = 'none' | 'offset-stack' | 'pane-surface' | 'overlay'

type LayoutPaneSpec = {
  id: string
  side: 'left' | 'right' | 'bottom'
  defaultSize: number
  minSize: number
  maxSize: number | ((container: LayoutContainer) => number)
  collapsedSize?: number
  defaultState?: PaneDisplayState
  allowedStates?: PaneDisplayState[]
  storageKey?: string
  persistState?: boolean
  collapsible?: boolean
  expandable?: boolean
  collapseMode?: 'button' | 'after-min' | 'none'
  expandMode?: 'button' | 'after-max' | 'none'
  overlapMode?: OverlapMode
}

type RouteLayoutSpec = {
  routeId: string
  surface: LayoutSurfaceKind
  scrollMode: RouteScrollMode
  shellLayout: 'flush' | 'stacked'
  panes: LayoutPaneSpec[]
  interactions?: InteractionSurfaceSpec[]
}
```

这些 spec 应该由 app layout runtime 消费。页面可以选择 route/workbench variant，
但不能重新发明 pane size、collapsed、overlap 和 scroll ownership 的规则。

Route layout spec 要替换当前分散在 `App.tsx`、`appRouteModel` 和页面组件里的判断。
迁移完成后，`getAppRouteSurface(pathname)` 这类 surface-only 判断不能继续决定完整布局；
它最多作为 registry lookup 的兼容输入存在于同一个改动中，然后被删除或降级为纯 helper。

`AppRouteViewport` 现在的 `auto` / `owned` / `hidden` 需要映射到新的
`document` / `workspace` / `canvas` / `hidden`。最终选择规则应该是：

- document：route 自身像普通文档滚动，例如设置页、组织选择、列表页。
- workspace：route 固定，页面内部 pane 各自拥有滚动。
- canvas：route 固定，canvas viewport 拥有 pan/zoom，pane 拥有自己的滚动。
- hidden：全屏工具、modal-like route 或完全自管滚动的 surface。

这一步完成后，旧页面不应该再继续扩展自己的局部布局 API。缺的能力补到 contract，
而不是补到页面 CSS。

### Phase 2: Build App Layout Runtime

在 `apps/frontend` 建立 layout runtime，集中处理 route shell 和持久化 pane 状态：

- `routeLayoutRegistry`
- `useRouteLayoutSpec(routeId)`
- `useLayoutPaneController(spec)`
- `useLayoutShellProps(routeId)`
- `useLayoutCssVariables(routeId)`

`WorkspaceShell`、`OverlapPaneGroup`、`OverlapPane` 继续来自 `packages/ui`。
runtime 负责把 route spec 转成这些 primitive 的 props、data attributes 和 CSS variables。

这一步要把 storage key 从页面散落状态中收回来。页面不应该直接写
`movscript.somePage.detailPaneWidth`，而应该通过 pane id 从 registry 取。
不读取旧 storage key，也不提供 key migration；旧 layout preference 在这次重构中重置。

runtime 建好后，app shell 入口改成只接受 `RouteLayoutSpec` 的结果，不再允许 route
自己拼 `WorkspaceShell` 的 chrome/layout/pane props。

### Phase 3: Normalize Overlap Ownership

把 overlap 分成三个明确入口：

- shell-level stacked card：只允许在 `WorkspaceShell` stacked layout 内实现
- workbench pane overlap：只允许用 `OverlapPaneGroup` / `OverlapPane`
- temporary floating UI：只允许走 overlay layer

迁移动作：

- 把 shell stacked 的 overlap token、safe area、z-index、collapsed 行为保留在
  `packages/ui/src/components/layout/workspace/styles.css`
- 把 business workbench 中的 overlap sizing 收敛到 `OverlapPane` controller props
- 删除页面级 sibling 负 margin
- 把 `:has()` 用法限制在 primitive contract 内，并给 contract test
- 每个 overlap surface 都声明 interaction box 归属

不保留旧 overlap class。页面切到 `OverlapPane` 或 shell stacked 后，旧 CSS 同步删除。

### Phase 4: Interaction Geometry Runtime

从根上解决 drag/drop，需要把 DOM hit testing 变成注册式 interaction model：

```ts
type InteractionSurfaceSpec = {
  id: string
  owner: 'shell' | 'workbench' | 'canvas' | 'timeline' | 'overlay'
  role: 'content' | 'pane-surface' | 'resize-edge' | 'drop-zone'
  payloadKinds?: DragPayload['kind'][]
  coordinateSpace?: CoordinateSpace
}
```

实现顺序：

- 增加 typed drag payload helpers
- 增加 `LayoutHitMap`，由 layout primitive 和 feature surface 注册 interaction boxes
- 为 canvas、timeline、production reorder 增加 coordinate adapters
- drag preview 和 commit 全部使用 adapter 输出的领域坐标
- 禁止业务 drag code 直接读取无关 pane 的 `getBoundingClientRect()`

规则是：DOM event 只提供 client point；layout runtime 决定 hit box；
surface adapter 决定领域坐标；feature action 只接收领域值。
旧 drag/drop 实现不包一层适配器继续跑；迁移到哪个 surface，就同步替换该 surface 的
payload、hit map、preview 和 commit。

例外只限 OS/browser file drop。文件拖入 canvas、composer 或资源区仍然需要读取
`DataTransfer.files`，但文件 drop target 也要注册在 interaction model 中，并且 drop
位置仍通过目标 surface 的 coordinate adapter 转换。应用内部 payload 不再使用裸字符串
key，例如 `application/resource-id`、`application/canvas-resource` 或
`application/x-movscript-content-unit-id`。

### Phase 5: Rewrite Pages By Risk

重写顺序按交互风险，不按目录顺序：

1. Content unit timeline workbench：drag-coordinate 风险最高。
2. Canvas workflow side panel：嵌套 pane、pan/zoom、drop coordinate 都相关。
3. 剧本工作台 / orchestration production：production workspace review、scene moment
   editing、表达条目和 overlap pane 同时存在；如果恢复 reorder，再纳入同一 interaction
   contract。
4. Agent dock / terminal placement：影响全局 shell geometry。
5. Pre-production、resource、scripts、tool dialog：主要收敛 overlap pane state 和 storage key。
6. 剩余普通 document pages：只验证 scroll mode 和 content width contract。

每重写一个页面都要同时完成：

- route layout spec
- pane spec 和 storage key
- scroll owner
- overlap mode
- interaction boxes
- contract tests
- 删除旧 shell composition
- 删除旧 page layout CSS
- 删除旧 local pane state
- 删除旧 drag/drop coordinate code

### Phase 6: Delete Escape Hatches

删除动作不放到最后统一兜底。每个页面重写时删除自己的旧逃生口；Phase 6 只做 repo
级别扫尾：

- 未建模的负 margin 结构 overlap 是否归零
- 页面级 pane resize state 是否归零
- 页面级 storage key 拼接是否归零
- layout controller 已经拥有的重复 CSS variables 是否归零
- drag/drop 里的 ad hoc payload string 是否归零
- 非 adapter 场景下的 `getBoundingClientRect()` 是否归零
- 和 primitive props 冲突的 layout `!important` 是否归零

原则上不保留例外。确实无法删除的，必须有 owner、deadline 和 contract test。

### Phase 7: Enforcement

增加 repo 级守卫，防止问题回流：

- lint/test 禁止页面 CSS 新增 sibling 负 margin overlap
- lint/test 禁止业务 drag code 新增裸 `dataTransfer.setData()` string key
- contract test 覆盖 route layout registry 中每个 workspace route
- contract test 覆盖 `OverlapPane` safe area、collapsed、expanded、resized state
- Playwright 覆盖 desktop 和 narrow viewport 的主要 workbench

现有源码正则类 contract test 可以作为迁移期间的保护，但不能成为最终保障。
最终测试应该分层：

- pure unit：clamp、storage normalization、coordinate conversion、payload encode/decode。
- component contract：registry spec 生成的 shell props、pane props、CSS variables 和
  data attributes。
- integration/Playwright：真实 viewport 下 resize、collapse、drop、timeline move 和
  terminal/assistant placement。

页面迁移时如果删除旧源码正则 test，必须在同一个改动里增加对应 registry 或行为测试。
测试删除不能早于旧逃生口删除。

这不是为了让代码更抽象，而是为了让布局变化有唯一入口。
以后新增页面应该先声明 layout spec，再选择 primitive，最后挂业务内容。

## Review Checklist

layout 或 drag 相关 PR 使用这份 checklist：

- 这个组件是否声明了谁拥有 scroll？
- 这个 pane size 是否来自唯一 controller？
- min/max/collapsed state 是否 typed 且有测试？
- resize handle 是否使用 shared primitive？
- overlap 是否使用 offset stacking 或 `OverlapPane`，而不是页面级 CSS trick？
- 被 overlap 覆盖的 pane 是否预留 safe area？
- collapsed/hidden state 是否清理 overlap margin、padding、shadow 和 hit area？
- drag/drop 是否使用 interaction box 和 coordinate adapter，而不是 visual overlap box？
- drag payload 是否使用 shared helpers？
- client coordinate conversion 是否隔离在 coordinate adapter 中？
- 实现是否考虑了 zoom 和 scroll？
- label column、decorative overlap 和 padding 是否被排除在领域坐标之外？
- drag-only ordering 是否有键盘替代操作？
- 测试是否断言交互后的领域结果？

## Definition Of Done

布局重构完成时应该满足：

- 可以从 component tree 解释 geometry ownership
- 每个 surface 只有一个 scroll owner
- resize 一个 pane 不需要 page-local sibling hacks
- drag/drop code 不读取无关 DOM geometry
- coordinate conversion 有 unit tests 覆盖
- Playwright 验证主要 workbench 的 desktop 和 narrow widths
- 删除 page-specific CSS trick 不会改变领域交互行为

目标架构应该更少“聪明技巧”。好的布局工程应该很无聊：稳定的 box、明确的 ownership、
typed constraints，以及少量负责把像素转换成领域值的 adapter。
