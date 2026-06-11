# Frontend Style Contract Layer Detailed Design

## 背景

MovScript frontend 当前同时使用以下样式机制：

- `apps/frontend/src/index.css` 作为应用全局入口，引入 `@movscript/theme/theme.css`、`@movscript/ui/styles.css`、Tailwind base/components/utilities，并包含页面级业务样式。
- `packages/tokens/src/theme.css` 定义基础设计 token。
- `packages/theme/src/theme.css` 定义 light/dark 主题变量。
- `packages/ui/src/styles.css` 聚合 primitive、layout、business 等所有 UI 包 CSS。
- 部分应用组件直接导入局部 CSS，例如 `AccountSettingsDialog.css`。
- React 组件同时使用全局 BEM class、`ms-*` class、`data-*` 状态属性、CSS variables、Tailwind utility class 和少量 inline style。

这些机制本身都可用，但当前缺少明确的契约层，导致样式修改经常通过覆盖实现，例如：

- 页面样式放入全局入口，难以判断影响范围。
- 父页面选择子组件内部 class，例如 `.account-settings-page__main .app-settings-choice-tile__detail`。
- 应用导入 `@movscript/ui/styles.css` 后，所有业务组件样式进入同一个 cascade。
- UI 包中存在 Tailwind utility class，但应用 Tailwind content 只扫描 `apps/frontend/src`。

契约层的目标是把“哪里可以改、怎么改、什么是稳定 API、什么是内部实现”明确化，减少靠 CSS specificity 和导入顺序解决问题。

## 目标

1. 建立样式公共 API：组件的可定制能力通过 props、slots、data attributes、CSS variables、exported style entry 表达。
2. 明确跨层边界：页面不得依赖子组件内部 DOM/class，UI 包不得依赖应用页面结构。
3. 降低全局 cascade 面积：拆分样式入口，按层导入，避免业务样式全量常驻。
4. 支持渐进迁移：先约束新增代码和高频修改区域，再逐步清理历史覆盖。
5. 可自动化治理：用 contract tests、lint scripts、文档清单防止问题回流。

## 非目标

- 不要求立即替换现有 CSS 技术栈。
- 不要求一次性迁移到 CSS Modules、CSS-in-JS 或 Tailwind-only。
- 不要求重写所有 UI 组件。
- 不要求移除所有全局 CSS。全局 CSS 可以保留，但必须有清晰职责和所有权。

## 分层模型

样式系统分为六层。越底层越稳定，越上层越局部。

| 层级 | 所属位置 | 职责 | 可被谁依赖 |
| --- | --- | --- | --- |
| Token Layer | `packages/tokens` | 字体、字号、间距、圆角、时长等基础变量 | 所有层 |
| Theme Layer | `packages/theme` | light/dark 语义色、surface、shadow、应用背景 | 所有层 |
| Base Layer | `apps/frontend/src/index.css` 或 `@movscript/ui/base.css` | reset、body/root、滚动条、基础可访问性 | 应用入口 |
| Primitive Layer | `packages/ui/src/components/primitives` | Button/Input/Dialog/Card 等原语组件样式 | Layout、Business、App |
| Layout Layer | `packages/ui/src/components/layout` | shell、pane、viewport、resize、scroll ownership | Business、App |
| Feature Layer | `packages/ui/src/components/business` 与 `apps/frontend/src/features` | 业务组件与页面局部样式 | 所属 feature 内部 |

关键原则：

- 下层不能引用上层 class。
- 页面不能引用组件内部 element class。
- 组件对外暴露稳定定制点，而不是要求调用方覆盖内部结构。
- 全局入口只负责装配，不承载页面业务样式。

## 契约对象

样式契约由七类对象组成。

### 1. Design Token Contract

Token 是最底层契约，必须稳定、语义清晰、可主题化。

当前已有示例：

```css
--ms-text-body: 14px;
--ms-leading-body: 20px;
--ms-radius-control: var(--ms-radius-md);
--ms-space-4: 16px;
```

规则：

- `--ms-*` 是跨包公共变量命名空间。
- `--ms-color-*`、`--ms-surface-*`、`--ms-shadow-*` 属于 Theme Layer。
- `--ms-text-*`、`--ms-space-*`、`--ms-radius-*`、`--ms-duration-*` 属于 Token Layer。
- 不允许 feature 自行定义新的全局 `--ms-*`。
- feature 私有变量必须使用 feature 命名空间，例如 `--shot-library-*`、`--agent-console-*`。
- 组件临时调节变量使用 `--ui-*`，但只在组件 root 或局部 subtree 内生效。

稳定性约定：

- 新增 token 是 minor change。
- 删除或语义变更 token 是 breaking change。
- 修改 token 值允许，但必须通过视觉回归或 contract test 覆盖高风险区域。

### 2. Component Prop Contract

组件 props 是首选定制方式。

示例：

```tsx
<Button size="sm" variant="ghost" tone="neutral" />
<WorkspaceShell surface="detail" layout="stacked" />
```

规则：

- 常见视觉差异必须先表达为 props，而不是要求调用方写 CSS 覆盖。
- props 应描述语义，不描述具体 CSS 值。
- 推荐命名：`variant`、`size`、`tone`、`intent`、`density`、`emphasis`、`layout`、`surface`、`chrome`。
- 禁止新增 `styleType`、`customMode`、`isSpecial` 这类不可组合 props。
- 当页面连续两次覆盖同一组件内部 class，应回到组件层补 props。

示例改造：

```tsx
// 不推荐：父页面覆盖 Button 内部 slot
<Button className="account-settings-page__nav-button" />

// 推荐：Button 暴露布局语义
<Button fullWidth align="start" size="sm" variant="ghost" />
```

建议为常用 primitive 补齐的契约：

| 组件 | 建议新增契约 |
| --- | --- |
| `Button` | `fullWidth?: boolean`、`align?: "center" | "start" | "end"`、`contentClassName?: string` |
| `Card` / `Surface` | `density`、`emphasis`、`chrome`、`interactive` |
| `DialogContent` | `size`、`scroll`、`padding` |
| `WorkspaceShell` | `surface`、`chrome`、`layout`、slot width variables |

### 3. Slot Contract

Slot 是组件内部可被调用方组合或定制的位置。

当前 UI 包已经使用 `data-ms-component`、`data-ms-slot`，这是很好的基础。

公共 slot 应满足：

- slot 名稳定。
- slot DOM 层级尽量稳定。
- slot 可以通过 props 或 CSS variables 调整。
- slot 是否 public 必须文档化。

推荐格式：

```tsx
<button
  data-ms-component="Button"
  data-ms-slot="root"
  data-ms-size={size}
>
  <span data-ms-component="Button" data-ms-slot="content" />
</button>
```

契约规则：

- `data-ms-component` 和 `data-ms-slot` 可作为测试和调试标识。
- 默认不允许应用 CSS 直接选择 `[data-ms-slot]` 修改样式。
- 只有被组件文档标记为 public slot 的 slot，才允许调用方通过 `slotClassNames` 或 CSS variable 调整。
- 内部 element class，例如 `.ms-button__content`，默认不是 public contract。

推荐 API：

```tsx
<Button
  slotClassNames={{
    content: "account-settings-page__nav-button-content",
  }}
/>
```

如果不想引入通用 `slotClassNames`，可以为高频组件提供显式 props：

```tsx
<Button contentClassName="account-settings-page__nav-button-content" />
```

### 4. Data Attribute State Contract

状态应通过 data attributes 暴露，而不是通过组合 class 表达。

当前已有模式：

```tsx
data-ms-variant={visualVariant}
data-ms-tone={visualTone}
data-ms-size={size}
data-collapsed={sidebarCollapsed ? "true" : undefined}
```

规则：

- 组件自身状态使用 `data-ms-*`。
- layout 状态使用稳定语义属性，例如 `data-surface`、`data-layout`、`data-collapsed`。
- feature 私有状态使用 feature 前缀，例如 `data-shot-status`、`data-agent-mode`。
- 不允许使用 DOM 结构关系表达业务状态，例如 `.panel > .body:first-child + .footer`。

稳定性约定：

- public data attribute 的枚举值属于契约。
- 新增枚举值必须有默认样式或 fallback。
- 删除枚举值必须有迁移说明。

### 5. CSS Variable Override Contract

CSS variable 是跨层定制的主要逃生口。

推荐方式：

```css
.account-settings-page {
  --ui-button-content-justify: flex-start;
}
```

组件内部：

```css
.ms-button__content {
  justify-content: var(--ui-button-content-justify, center);
}
```

规则：

- 如果调用方需要改变数值型样式，例如宽度、间距、面板尺寸、overlay offset，优先暴露 CSS variable。
- CSS variable 必须定义 fallback。
- CSS variable 的作用域应绑定在组件 root 或 feature root，不应写到 `:root`。
- 公共变量命名使用 `--ui-<component>-<slot>-<property>`。
- 私有变量命名使用 `--_<component>-<property>` 或不文档化的局部变量，但不允许跨文件依赖。

适合 CSS variable 的场景：

- panel width、min/max width
- overlay z-index/offset
- card padding
- component gap
- media aspect ratio
- timeline scale
- resize handle hit area

不适合 CSS variable 的场景：

- 组件是否显示某个区域，应使用 props。
- 业务状态，应使用 data attributes。
- 复杂结构替换，应使用 composition/slots。

### 6. Class Name Contract

class 分为三类。

| 类型 | 示例 | 是否公共 | 说明 |
| --- | --- | --- | --- |
| Component root class | `.ms-button`、`.app-shell` | 有条件公共 | 可用于内部 CSS、调试、低风险 contract test |
| Component element class | `.ms-button__content` | 默认私有 | 应用不得覆盖 |
| Feature/page class | `.shot-library-page` | feature 内公共 | 只允许所属 feature 使用 |

规则：

- `ms-*` class 属于 UI 包。
- `app-*` class 属于 UI app/business/layout 基础组件，应用层不得随意覆盖内部 element。
- feature class 必须带 feature 前缀，例如 `shot-library-*`、`account-settings-*`。
- 页面 CSS 只能选择自己的 root subtree，不能选择不属于自己的组件内部 class。
- 禁止用高 specificity 修复组件问题，例如 `.page .panel .card .ms-button__content`。
- 禁止 `!important`，除非是第三方库兼容层，并且必须有注释和 contract test。

允许：

```css
.account-settings-page__main {
  overflow-y: auto;
}
```

不允许：

```css
.account-settings-page__main .app-settings-choice-tile__detail {
  font-size: var(--ms-text-xs);
}
```

替代方案：

```tsx
<AppSettingsChoiceTile density="compact" />
```

或：

```css
.account-settings-page {
  --ui-choice-tile-detail-font-size: var(--ms-text-xs);
}
```

### 7. Style Entry Contract

CSS 入口也属于契约。

当前只有：

```json
"./styles.css": "./src/styles.css"
```

建议拆分为：

```json
{
  "./base.css": "./src/base.css",
  "./semantic.css": "./src/semantic.css",
  "./primitives.css": "./src/components/primitives/styles.css",
  "./layout.css": "./src/components/layout/styles.css",
  "./business/agent.css": "./src/components/business/agent/styles.css",
  "./business/canvas.css": "./src/components/business/canvas/styles.css",
  "./business/content.css": "./src/components/business/content/styles.css",
  "./styles.css": "./src/styles.css"
}
```

迁移期保留 `./styles.css` 作为兼容聚合入口，但新增代码优先导入更细粒度入口。

应用入口建议演进为：

```css
@import "@movscript/theme/theme.css";
@import "@movscript/ui/base.css";
@import "@movscript/ui/primitives.css";
@import "@movscript/ui/layout.css";

@tailwind base;
@tailwind components;
@tailwind utilities;
```

业务入口由页面或 route chunk 按需引入：

```tsx
import "@movscript/ui/business/agent.css";
```

如果暂时不做按需引入，也应该先将聚合入口拆分，明确哪些 CSS 属于哪一层。

## CSS 所有权规则

### 应用全局入口

`apps/frontend/src/index.css` 只能包含：

- theme/ui style entry import
- Tailwind directives
- root/body/#root
- scrollbar
- focus-visible/global accessibility helper
- 极少数应用级 CSS variables

不得包含：

- 页面 class，例如 `.shot-library-page`
- feature class，例如 `.agent-console-page`
- 组件内部覆盖，例如 `.ms-button__content`
- 第三方组件深层覆盖，除非独立写入 compatibility section

### UI 包 primitive

primitive 组件负责自身结构和视觉变体。

允许：

- `.ms-button`
- `.ms-button--solid`
- `.ms-button[data-ms-size="sm"]`
- `.ms-button__content`

不得：

- 引用 app feature class。
- 引用 business page class。
- 为具体页面写特殊 case。

### UI 包 layout

layout 组件负责空间分配和滚动所有权。

允许：

- `data-surface`
- `data-layout`
- `data-collapsed`
- `data-scroll`
- resize/overlap pane variables

不得：

- 根据业务组件 class 调整布局。
- 在 layout CSS 中写 feature-specific selector。

### UI 包 business

business 组件可以拥有业务样式，但必须保持 feature 边界。

允许：

- `.agent-console-*`
- `.content-workbench-*`
- `.canvas-workflow-*`

不得：

- 覆盖 primitive 内部 element。
- 跨业务域覆盖其他 business class。

### App feature

App feature 层只负责该 feature 页面结构和 composition。

允许：

- feature root class
- feature 私有 CSS variables
- 对自身 subtree 的布局

不得：

- 选择 UI 包内部 element class。
- 选择其他 feature 内部 class。
- 依赖第三方库内部 DOM，除非封装成 adapter。

## Tailwind Contract

当前应用 Tailwind content 只扫描 `./src/**/*.{ts,tsx}`，但 UI 包 TSX 中存在 utility class。需要二选一：

### 方案 A：UI 包不依赖 Tailwind 生成

UI 包 TSX 中不写 Tailwind utility class，只使用 UI 包 CSS。

优点：

- UI 包独立、可发布。
- 不依赖消费方 Tailwind 配置。

缺点：

- 部分布局 class 需要迁回 CSS。

### 方案 B：应用 Tailwind 扫描 UI 包

更新 content：

```js
content: [
  './src/**/*.{ts,tsx}',
  '../../packages/ui/src/**/*.{ts,tsx}',
]
```

优点：

- 改动小。
- 保留现有 utility 写法。

缺点：

- UI 包样式依赖应用构建配置。
- 如果未来多个 app 消费 UI 包，每个 app 都要配置一致。

建议：

- 短期采用方案 B，保证现有 class 不丢失。
- 中期将 `packages/ui` 内的结构性 Tailwind class 逐步迁入 UI CSS，转向方案 A。

## 第三方库样式契约

第三方库样式必须通过 adapter 层隔离。

当前例子：

- `@xyflow/react/dist/style.css`
- `@xterm/xterm/css/xterm.css`

规则：

- 第三方 CSS 只能由使用该库的 feature/component 引入。
- 对第三方 DOM 的覆盖必须集中在 adapter CSS 文件中。
- adapter root 必须有明确 class，例如 `.canvas-flow-adapter`、`.terminal-adapter`。
- 禁止在 app global CSS 中散落第三方覆盖。

示例：

```css
.canvas-flow-adapter :where(.react-flow__handle) {
  width: var(--canvas-flow-handle-size, 8px);
}
```

## 自动化检查设计

新增一个样式契约检查脚本，建议路径：

```text
apps/frontend/scripts/check-style-contracts.mjs
```

并加入：

```json
"check:style-contracts": "node scripts/check-style-contracts.mjs"
```

### 检查 1：禁止 app global feature CSS

目标文件：

```text
apps/frontend/src/index.css
```

规则：

- 允许 `@import`、`@tailwind`、`@layer base`。
- 禁止出现 feature/page class 前缀，例如 `.shot-library-`、`.agent-`、`.content-`。
- 允许少量白名单，例如 `.ms-sr-only` 如果确实在 global 定义。

### 检查 2：禁止跨组件内部 class 覆盖

扫描：

```text
apps/frontend/src/**/*.css
```

规则：

- 禁止选择 `.ms-*__*`。
- 禁止选择 `.app-*__*`，除非文件属于同一组件包。
- 禁止选择其他 feature 前缀。

例外：

- adapter CSS 白名单。
- migration legacy CSS 白名单，必须带 TODO 和 owner。

### 检查 3：禁止 `!important`

扫描：

```text
apps/frontend/src/**/*.css
packages/ui/src/**/*.css
```

规则：

- 默认禁止。
- 例外必须匹配注释：

```css
/* style-contract-exception: third-party-adapter, owner=frontend, remove-by=2026-09-30 */
```

### 检查 4：CSS parser check

使用 PostCSS 或 Lightning CSS 解析所有 CSS，防止多余 brace 这类问题。

当前 `AccountSettingsDialog.css` 里有一个多余 `}`，这类问题应由 parser check 直接拦截。

### 检查 5：style entry export check

检查 `packages/ui/package.json` exports 与实际 CSS entry 一致。

规则：

- 每个 public CSS entry 必须存在。
- `sideEffects` 必须包含 public CSS entry。
- 新增 business styles 时必须挂到对应 entry，而不是只挂到全量 `styles.css`。

### 检查 6：Tailwind content check

如果 UI 包 TSX 继续使用 utility class，检查 `tailwind.config.js` content 是否包含 `../../packages/ui/src/**/*.{ts,tsx}`。

## Contract Test 设计

除了静态脚本，还应保留面向重要布局的 contract tests。

推荐测试类型：

1. Source contract test：读取 CSS/TSX 源码，检查禁止项和关键 contract。
2. Render contract test：渲染组件，检查 public data attributes 和 slot。
3. Visual smoke test：Playwright 截图验证主流程。

示例：Button public contract

```ts
assert.match(buttonSource, /data-ms-component="Button"/);
assert.match(buttonSource, /data-ms-slot="root"/);
assert.match(buttonSource, /data-ms-size=\{size\}/);
```

示例：禁止 app 覆盖 primitive internals

```ts
assert.doesNotMatch(appCss, /\.account-settings-page[\s\S]*\.ms-button__content/);
```

示例：layout state contract

```ts
assert.match(workspaceShellSource, /data-surface=\{surface\}/);
assert.match(workspaceShellStyles, /\.app-shell\[data-surface="detail"\]/);
```

## 迁移计划

### Phase 0：冻结新增风险

目标：不再扩大覆盖问题。

动作：

- 新增本文档。
- 新增 `check:style-contracts`，先以 warning 模式运行。
- 禁止新增 `!important`。
- 禁止 `index.css` 新增 feature/page class。
- PR review 中要求新增组件先说明样式契约。

### Phase 1：清理应用全局入口

目标：让 `index.css` 回归应用入口职责。

动作：

- 将 `shot-library` 样式迁到 `features/shot-library/components/ShotLibraryPage.css`。
- 页面组件显式导入自己的 CSS。
- 保留 `index.css` 中 theme/ui/Tailwind/base。
- 增加 test 防止 feature class 回流。

### Phase 2：拆分 UI CSS entry

目标：降低全局 cascade 面积。

动作：

- 在 `@movscript/ui` exports 中新增 `base.css`、`primitives.css`、`layout.css`、`business/*.css`。
- 保留 `styles.css` 兼容入口。
- 应用入口逐步改用细粒度入口。
- 新增 package export contract test。

### Phase 3：组件公共定制 API

目标：消除父页面覆盖子组件内部 class 的主要原因。

优先组件：

- `Button`
- `WorkspaceShell`
- `AppSettings*`
- `AgentConsole*`
- `ContentWorkbench*`

动作：

- 为高频覆盖点补 props 或 CSS variables。
- 将 `.page .child-component__element` 改为 props/variables。
- 对 public slots 建立文档和 tests。

### Phase 4：UI 包 Tailwind 归一

目标：避免 UI 包 class 依赖消费方构建偶然性。

动作：

- 短期更新 Tailwind content 覆盖 UI 包。
- 中期将 UI 包 TSX 的结构性 utility class 迁入 CSS。
- 保留 app feature 内 Tailwind 使用。

### Phase 5：严格模式

目标：让契约违规成为 CI failure。

动作：

- `check:style-contracts` 从 warning 改为 error。
- legacy exception 必须有 owner 和 remove-by。
- 每次新增 public style contract 必须同步文档或测试。

## 新代码准入清单

新增或修改 UI 样式时，按以下顺序决策：

1. 这是全局语义变化吗？如果是，改 token/theme。
2. 这是组件已有变体吗？如果是，使用 props。
3. 这是组件缺少公共能力吗？如果是，补 props/slot/CSS variable。
4. 这是页面独有布局吗？如果是，写在 feature CSS，并限制在 feature root。
5. 这是第三方库覆盖吗？如果是，写 adapter CSS。
6. 仍然需要覆盖内部 class？先停下，说明为什么现有 contract 不够。

代码 review 问题：

- 这个 selector 的 owner 是谁？
- 这个 selector 会不会选中其他 feature？
- 调用方是否依赖了组件内部 DOM？
- 是否可以用 props 或 CSS variable 表达？
- 是否需要新增 contract test？
- 是否引入了更高 specificity？

## 示例：Account Settings 覆盖治理

当前问题：

```css
.account-settings-page__nav-button .ms-button__content {
  width: 100%;
  justify-content: flex-start;
}

.account-settings-page__main .app-settings-choice-tile__detail {
  font-size: var(--ms-text-xs);
}
```

问题点：

- 页面依赖 `Button` 内部 `.ms-button__content`。
- 页面依赖 `AppSettingsChoiceTile` 内部 class。
- 子组件改 DOM 或 class 会破坏页面。

目标设计：

```tsx
<Button fullWidth align="start" size="sm" variant="ghost" />
<AppSettingsChoiceTile density="compact" />
```

或通过 CSS variable：

```css
.account-settings-page {
  --ui-button-content-justify: flex-start;
  --ui-choice-tile-detail-font-size: var(--ms-text-xs);
}
```

组件内部：

```css
.ms-button__content {
  justify-content: var(--ui-button-content-justify, center);
}

.app-settings-choice-tile__detail {
  font-size: var(--ui-choice-tile-detail-font-size, var(--ms-text-sm));
}
```

这样页面只设置公开变量，不绑定子组件 DOM 结构。

## 示例：Shot Library 样式迁移

当前问题：

```css
/* apps/frontend/src/index.css */
@layer components {
  .shot-library-page {
    ...
  }
}
```

目标：

```text
apps/frontend/src/features/shot-library/components/ShotLibraryPage.css
```

```tsx
import "./ShotLibraryPage.css";
```

迁移规则：

- 保留 `.shot-library-*` 前缀。
- 不改变组件 markup。
- 不调整视觉，只移动所有权。
- 增加 source contract test，禁止 `.shot-library-` 回到 `index.css`。

## 风险与取舍

### 风险 1：入口拆分增加导入复杂度

缓解：

- 保留 `@movscript/ui/styles.css` 兼容入口。
- 新入口先文档化，逐步迁移高频页面。

### 风险 2：props 过多导致组件 API 膨胀

缓解：

- 只把重复出现的覆盖点升级为 props。
- 单次页面特例优先使用局部 CSS variable。
- props 必须是语义化枚举，不暴露裸 CSS 值。

### 风险 3：历史覆盖太多，短期无法全部清除

缓解：

- 使用 legacy exception 清单。
- 新代码严格，旧代码分批迁移。
- 每个迁移 PR 只处理一个 feature 或一个组件族。

### 风险 4：CSS variable 也可能变成隐式 API

缓解：

- public CSS variables 必须文档化。
- 私有变量不允许跨文件引用。
- 删除 public variable 走 breaking change 流程。

## 推荐落地顺序

1. 新增 `check:style-contracts` warning 模式。
2. 修复明显 CSS parser 错误。
3. 将 `index.css` 中页面样式迁出。
4. 拆分 `@movscript/ui` CSS exports。
5. 为 `Button`、`WorkspaceShell`、`AppSettings*` 补 public style contract。
6. 扩展 contract tests。
7. 将检查切到 CI error。

## 最终状态

完成后，样式修改路径应变成：

- 改品牌/主题：改 `tokens/theme`。
- 改组件标准外观：改 UI 组件 CSS 和 props contract。
- 改页面排布：改 feature CSS。
- 改 layout 行为：改 layout component contract。
- 改第三方库显示：改 adapter CSS。

不再通过“父页面选择子组件内部 class”或“在全局入口追加覆盖”解决常规样式问题。
