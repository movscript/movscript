# `packages/ui` 冗余审查与重构方案

## 背景

用户反馈 `packages/ui` 中存在大量冗余代码。基于当前工作树审查，判断这个问题成立，而且它不是单个组件写得长，而是 UI 包的定位已经从“可复用 UI primitive/layout 包”膨胀成“承载大量业务页面片段的第二个前端应用层”。

当前 `packages/ui/src` 约 82k 行，779 个 TS/TSX/CSS 文件。最大文件集中在 business 组件和样式：

| 文件 | 行数 | 问题 |
| --- | ---: | --- |
| `packages/ui/src/components/business/index.ts` | 2619 | 根 business barrel 暴露数百个业务组件，公共 API 过宽 |
| `packages/ui/src/components/business/resource/page/styles.css` | 2337 | 页面级资源样式进入 UI 包 |
| `packages/ui/src/components/business/agent/page/styles.css` | 1963 | Agent 页面级样式进入 UI 包 |
| `packages/ui/src/components/business/agent/settings/index.tsx` | 1658 | Agent 设置业务组件体量过大 |
| `packages/ui/src/components/business/agent/settings/styles.css` | 1347 | 设置页局部样式过大 |
| `packages/ui/src/components/business/resource/page/index.tsx` | 1325 | 资源页面组件接近应用页面 |
| `packages/ui/src/components/business/content/workbench/unit-track/styles.css` | 1127 | 内容工作台局部样式过大 |
| `packages/ui/src/components/business/canvas/workflow/index.tsx` | 1058 | Canvas workflow 业务组合过大 |

## 核心结论

`packages/ui` 需要重构，但不建议直接删除大组件或大面积改 import。应用侧当前有约 119 处从根入口 `@movscript/ui` 导入，公共 API 改动会产生大范围破坏。正确路线是：

1. 先收缩新代码入口和样式入口。
2. 再把业务大组件迁回 feature 或拆为 feature-owned adapters。
3. 最后清理 legacy barrel 和冗余 CSS。

## 主要问题清单

### 1. 根入口过宽，所有 UI 层被混成一个包

`packages/ui/src/index.ts` 当前直接导出：

- `semantic`
- `style-system`
- `debug`
- `components/primitives`
- `components/layout`
- `components/business`
- `cn`

证据：`packages/ui/src/index.ts:1` 到 `:7`。

影响：

- 使用者无法从 import 路径看出自己依赖的是 primitive、layout 还是 business。
- `debug` 这种开发工具也从根入口暴露，容易进入正常 bundle。
- 新业务组件只要从 business barrel 导出，就会成为稳定公共 API，后续删除成本很高。

### 2. 样式入口一次性导入所有业务 CSS

`packages/ui/src/styles.css` 当前导入：

- base
- primitives
- semantic
- layout
- app business
- agent business
- canvas business
- content business
- detail business
- generation business
- resource business
- scripts/tools/workbench 等所有业务样式

证据：`packages/ui/src/styles.css:1` 到 `:22`。

影响：

- 应用只使用一个 `Button`，也会加载 Agent、Canvas、Resource、Workbench 等业务样式。
- 所有 business CSS 进入同一个全局 cascade，页面之间更容易互相覆盖。
- 样式死代码无法靠 JS tree shaking 移除。

### 3. Business barrel 暴露过细，公共 API 粒度失控

`packages/ui/src/components/business/index.ts` 长 2619 行，从一个入口导出大量业务组件。前 260 行仅 Agent/Console/Debug/Activity 等组件就已经暴露了大量内部结构，如：

- `AgentConsoleHeaderTitleRow`
- `AgentConsoleLogLineStream`
- `AgentDebugWorkspaceDiffRows`
- `AgentDiagnosticToolHeader`
- `AgentActivityFrameLine`

影响：

- 内部 DOM 片段被当成公共 API 使用。
- 组件重构必须保持大量细碎命名，难以删除重复结构。
- 应用层倾向于拼接 UI 包内部零件，而不是使用稳定的业务视图模型。

### 4. 通用 Surface 已存在，但业务层重复封装 frame/header/body/card

`Surface` 已经提供 `kind`、`tone`、`density`、`emphasis`、`interaction` 和 `data-*` 语义（`packages/ui/src/components/primitives/surface.tsx:8` 到 `:31`），对应样式也提供 surface root、header、action、title、description 等基础 class（`surface/styles.css:1` 到 `:155`）。

但业务层仍重复实现类似结构：

- `AgentSurfaceBlock` 再包一层 `Surface`，只映射 `variant` 到 `emphasis`（`agent/surface-block.tsx:7` 到 `:30`）。
- `AppPanel` 自己定义 header/body/action（`app/surface/panel/index.tsx:7` 到 `:37`）。
- `AppSection` 自己定义 eyebrow/header/body/action（`app/surface/section/index.tsx:7` 到 `:46`）。
- `WorkbenchSection` 自己定义 title/description/icon/action/body（`workbench/section/index.tsx:6` 到 `:43`）。
- `EntityListCard` 自己维护 active/expanded/status/meta/childItems/action/footer 等卡片结构（`entity-list-card/index.tsx:14` 到 `:122`）。

当前 business 目录中 `ms-frame__header`、`ms-surface__header`、`ms-surface__body`、`__header`、`__body`、`__action` 等结构相关匹配约 403 处。

影响：

- 同一种 panel/section/card 语义在多个 domain 里重复演化。
- 样式修复需要改多个近似 CSS。
- 组件 Props 命名不一致，调用方难以复用。

### 5. Business CSS 过深且常驻

顶层 business CSS 继续导入子模块 CSS：

- `agent/styles.css` 导入 23 个 Agent 子样式（`agent/styles.css:1` 到 `:23`）。
- `resource/styles.css` 导入 12 个资源子样式（`resource/styles.css:1` 到 `:12`）。
- `app/styles.css` 导入 14 个 app 子样式（`app/styles.css:1` 到 `:14`）。

影响：

- CSS 文件拆得很多，但入口仍是全量常驻，拆分没有换来加载边界。
- 任何业务域样式都可能影响全局 class 命名空间。
- 很难知道某个视觉问题来自 primitive、layout、app business 还是 feature CSS。

### 6. `packages/ui` 中混有本地系统文件

当前存在：

- `packages/ui/src/.DS_Store`
- `packages/ui/src/components/.DS_Store`
- `packages/ui/src/components/business/agent/.DS_Store`

影响：

- 说明源目录缺少基本清理门禁。
- 如果已入库，会造成无意义差异；如果未入库，也说明 `.gitignore` 或清理脚本不足。

### 7. 浏览器副作用边界不够明确

`packages/ui/src/debug.tsx` 使用 `window`、`document`、`localStorage`、`window.dispatchEvent` 和多个全局监听。布局层 `workspace/index.tsx` 也使用 pointer window event 和 localStorage 保存 pane size。

这些副作用在 debug/layout 中可以存在，但它们不应从根入口无差别暴露，也不应和 primitive/business 公共 API 混在一起。

## 重构目标

### 目标一：重新定义包边界

`@movscript/ui` 应拆成明确入口：

```text
@movscript/ui/primitives
  Button, Input, Dialog, Surface, Badge, Tooltip 等稳定原语

@movscript/ui/layout
  WorkspaceShell, AppShell, resize pane, route viewport 等布局能力

@movscript/ui/business/app
@movscript/ui/business/agent
@movscript/ui/business/resource
  暂时保留，但标记为 legacy/business entry，不允许继续从根入口新增

@movscript/ui/styles/base.css
@movscript/ui/styles/primitives.css
@movscript/ui/styles/layout.css
@movscript/ui/styles/business/agent.css
  样式按使用域显式导入

@movscript/ui/debug
  debug inspector 单独入口
```

根入口 `@movscript/ui` 第一阶段保持兼容，但新增 lint 禁止新文件从根入口导入 business 组件。

### 目标二：收敛重复 frame/card/section

在 primitive/layout 之间增加少量 composable primitives：

- `Frame`
- `FrameHeader`
- `FrameBody`
- `FrameActions`
- `ListItem`
- `EntityCard`
- `MetricGroup`
- `StatusSurface`

然后把 `AppPanel`、`AppSection`、`WorkbenchSection`、`AgentSurfaceBlock` 等改为 thin preset：

```text
AppSection = Frame preset(kind="section", density="normal", emphasis="raised")
WorkbenchSection = Frame preset(kind="section", emphasis configurable)
AgentSurfaceBlock = Frame preset(tone/domain="agent")
```

原则：

- 结构只在 Frame 实现一次。
- domain preset 只负责默认 class、tone 和少量 slot。
- 复杂业务数据展示不进入 primitive。

### 目标三：把页面级 business 组件迁回应用 feature

以下文件不适合作为长期 UI 包公共 API：

- `resource/page/index.tsx`
- `resource/page/styles.css`
- `agent/page/styles.css`
- `agent/settings/index.tsx`
- `agent/settings/styles.css`
- `canvas/workflow/index.tsx`
- `content/workbench/unit-track/*`

迁移策略：

1. 先在 `apps/frontend/src/features/*/ui` 建立 feature-owned wrapper。
2. 应用改为导入 wrapper。
3. UI 包内原导出标记 `@deprecated`。
4. 两个版本后删除 UI 包页面级组件。

## 分阶段执行方案

### 第 0 阶段：只加门禁，不破坏现有导入

产出：

- `packages/ui` audit 脚本：
  - 最大文件排行。
  - 根 barrel 导出数量。
  - business CSS 总行数。
  - `window/document/localStorage` 使用点。
  - `.DS_Store` 等非源码文件检查。
- lint/contract test：
  - 新增 UI business 组件不能从 `packages/ui/src/index.ts` 根入口导出。
  - 新增 business CSS 不能进入 `styles.css` 全量入口，必须有 domain style entry。
  - 新增页面级组件不得放进 `packages/ui`。

验收：

- 不修改应用 import 也能通过。
- 新增问题模式被阻止。

### 第 1 阶段：新增分层入口

修改 `packages/ui/package.json` exports：

```json
{
  "./primitives": "...",
  "./layout": "...",
  "./business/agent": "...",
  "./business/resource": "...",
  "./styles/base.css": "...",
  "./styles/primitives.css": "...",
  "./styles/layout.css": "...",
  "./styles/business/agent.css": "...",
  "./debug": "..."
}
```

新增源入口：

- `src/primitives.ts`
- `src/layout.ts`
- `src/business-agent.ts`
- `src/business-resource.ts`
- `src/debug-entry.ts`

验收：

- 旧 `@movscript/ui` 仍可用。
- 新代码可以从窄入口导入。
- build 输出 d.ts 正常。

### 第 2 阶段：应用侧迁移 import

迁移顺序：

1. primitives：`Button`、`Input`、`Dialog`、`Badge`、`Tooltip` 等。
2. layout：`WorkspaceShell`、`useResizablePanel`、`AppRouteViewport` 等。
3. business domain：Agent/Resource/Canvas/Workbench 组件。
4. debug：`UiDebugInspector` 从 `@movscript/ui/debug` 导入。

验收：

- 新增代码禁止从 `@movscript/ui` 根入口导入。
- 老文件分批迁移，每批只改 import，不改行为。

### 第 3 阶段：样式入口拆分

当前应用入口 `apps/frontend/src/index.css` 导入 `@movscript/ui/styles.css`，这会带入全部 UI 包业务样式。

迁移为：

```css
@import "@movscript/ui/styles/base.css";
@import "@movscript/ui/styles/primitives.css";
@import "@movscript/ui/styles/layout.css";
@import "@movscript/ui/styles/business/app.css";
@import "@movscript/ui/styles/business/agent.css";
```

只有当前路由确实使用的 legacy business CSS 才临时导入。长期目标是业务 CSS 随 feature 入口导入，而不是 app 全局导入。

验收：

- `@movscript/ui/styles.css` 标记 legacy。
- 新增 business CSS 不进入 legacy all-in-one。
- CSS bundle 可按 domain 度量。

### 第 4 阶段：抽 Frame/Card primitives

新增：

- `components/primitives/frame.tsx`
- `components/primitives/frame/styles.css`
- `components/primitives/list-item.tsx`
- `components/primitives/entity-card.tsx`

迁移：

- `AppPanel`
- `AppSection`
- `WorkbenchSection`
- `AgentSurfaceBlock`
- `EntityListCard`

验收：

- 这些组件的 DOM 结构由同一套 primitive 驱动。
- 保留旧 class 作为兼容层，但内部结构不再重复。
- snapshot/DOM contract 覆盖主要 class 和 data attributes。

### 第 5 阶段：拆除页面级 business 组件

迁移优先级：

1. `resource/page/*`
2. `agent/settings/*`
3. `agent/page/*`
4. `canvas/workflow/*`
5. `content/workbench/unit-track/*`

原则：

- UI 包保留通用块，页面 orchestration 回到 `apps/frontend/src/features/*`。
- 业务 view model 类型不放在 UI 包，UI 包只接收展示 props。
- feature 可以拥有自己的 CSS，但只能作用于 feature root。

验收：

- `packages/ui` 不再含完整页面级业务组件。
- `business` 目录行数下降到当前的 50% 以下。
- 根 business barrel 缩到只导出稳定 domain presets。

### 第 6 阶段：删除 legacy barrel

当应用侧 import 迁移完成后：

- `@movscript/ui` 根入口只导出 primitives + layout + cn。
- `components/business/index.ts` 不再导出内部碎片，只保留少量稳定 preset 或彻底按 domain 子入口导出。
- `styles.css` 不再导入所有 business CSS。
- `debug` 不再从根入口导出。

验收：

- 从根入口导入 business 组件的代码为 0。
- `@movscript/ui/styles.css` 仅兼容旧版本，应用不再使用。
- source 中无 `.DS_Store`。

## 建议优先处理的冗余点

### P0

- 新增分层 exports，保留旧入口兼容。
- 给 `styles.css` 增加 legacy 注释，并新增窄样式入口。
- 删除或阻止 `.DS_Store` 进入 source。
- 禁止新增 business 组件进入根 barrel。

### P1

- 抽 `Frame` / `FrameHeader` / `FrameBody` / `FrameActions`。
- 迁移 `AppPanel`、`AppSection`、`WorkbenchSection`、`AgentSurfaceBlock`。
- 把 `UiDebugInspector` 移出根入口。

### P2

- Resource page 和 Agent settings 从 UI 包迁回 app feature。
- 拆 Agent/Resource 全量 CSS 入口。
- `business/index.ts` 按 domain 子入口拆分。

### P3

- 清理未使用导出。
- 删除 legacy all-in-one CSS。
- 用视觉回归测试覆盖主要 business preset。

## 完成定义

`packages/ui` 重构完成应满足：

- 应用可以只导入 primitives/layout，而不加载全部 business CSS。
- 新业务页面不进入 UI 包。
- frame/card/section/header/body/action 结构只实现一次。
- 根入口不再暴露 debug 和大批 business 内部组件。
- UI 包源码无系统垃圾文件。
- CSS 全局 cascade 面积可按 domain 控制。
