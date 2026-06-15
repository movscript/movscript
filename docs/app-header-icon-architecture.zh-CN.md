# 程序头 Icon 架构

程序头只承载跨页面的窗口级操作和当前页面最重要的少量操作。新增入口时先判断它属于哪个语义区，再接入 `Header` 对应 prop，避免继续把图标堆在同一个 controls 里。

## 语义区

| Header 区域 | 放置内容 | 位置意图 | 典型 icon |
| --- | --- | --- | --- |
| `navigationControls` | 离开当前界面、回首页、返回上一级 | 左侧最前 | `Home`、`ArrowLeft` |
| `layoutControls` | 改变当前页面布局，不触发业务动作 | 左侧导航后 | `PanelLeftOpen`、`PanelLeftClose` |
| `primaryActions` | 当前页面的主要业务动作 | 右侧靠前 | `Play`、`Save`、Git 同步操作 |
| `contextActions` | 当前上下文的辅助面板或关联页面 | 右侧主要动作后 | 终端、资源、任务、右侧面板 |
| `globalActions` | 全局低频设置、模式切换、App 更新和 edition 扩展入口 | 右侧最后 | `MoreHorizontal` 全局菜单、`RefreshCw` 菜单项 |

状态信息不要伪装成按钮。Canvas 的类型、节点数、运行数等只读状态使用 `.app-window-route-status`。

## 页面放置规则

| 页面/模式 | `navigationControls` | `layoutControls` | `primaryActions` | `contextActions` | `globalActions` |
| --- | --- | --- | --- | --- | --- |
| Global Home | 无 | 无 | 无 | 无 | `AppTopControls`，含 App 更新入口和更新红点 |
| Tool 模式，左侧栏展开 | `Home`，设置页追加“退出设置” | 左侧栏折叠、后退、前进 | 无 | 无 | 由中间头部承载 |
| Tool 模式，左侧栏收起 | `Home`，设置页追加“退出设置” | 左侧栏展开、后退、前进 | 无 | 终端 | 默认 `AppTopControls` |
| Project 模式 | `Home`、项目内后退、项目内前进 | 无 | `ProjectGitHeaderActions` | 终端 | 默认 `AppTopControls` |
| Agent 模式，左侧栏展开 | 左侧头部放 `Home` | Agent 侧栏折叠 | 无 | 中间或右侧头部放 Agent 内容面板、终端 | 右侧头部或中间头部承载 |
| Agent 模式，左侧栏收起 | `Home` | Agent 侧栏展开 | 无 | Agent 内容面板、终端 | 默认 `AppTopControls` |
| Canvas 编辑器 | `Home`、返回 Canvas 来源列表 | 节点库开关、Canvas 只读状态 | 运行、保存 | 右侧工作流面板、资源、任务 | 默认 `AppTopControls` |
| Account Settings | `Home`、退出设置 | 设置侧栏折叠/展开，不放后退/前进 | 无 | 终端按当前 shell 需要放置 | 默认 `AppTopControls` 或隐藏项目选择 |
| Enterprise 运行时页面 | 沿用所在 shell 的导航和布局规则 | 沿用所在 shell 的布局规则 | 页面主动作放页面内部或 `primaryActions` | 关联工具放 `contextActions` | 通过 `runtimeAppTopControls.globalMenuItems` 注入低频入口 |

## 导航和退出规则

- 每个可沉浸或可独立打开的程序头都必须有 `Home`，保证用户随时能回到根界面。
- 项目模式内部存在 `项目 Home -> 剧本`、`项目 Home -> 编排` 这类层级，因此项目模式的程序头需要提供后退和前进。
- Canvas 这类深层编辑器除了 `Home` 还必须有一个返回来源列表的入口，当前使用 `canvasBackPath(search)`。
- 设置页必须保留“退出设置”，返回进入设置前记录的路径。
- 浏览器式后退/前进属于 Tool 侧栏的布局/导航辅助，不替代 `Home`。
- 右上角不放项目切换 icon。项目选择、项目创建、项目管理应回到项目入口页面或页面内部完成。
- 模式切换不是高频动作，收纳在 `MoreHorizontal` 全局菜单中。
- App 更新属于全局 Home 的右上角菜单；有可安装更新时只在 `MoreHorizontal` 上标红点，不放到 Agent 或项目窗口左上角。
- Git 的 commit、pull、push 只属于项目模式，不出现在全局 Home 或其他模式。
- 全局 Home 是模式入口，不继承项目模式的 `primaryActions`。
- 设置页的“退出设置”是唯一的返回上层语义，侧栏头部不放浏览器式后退/前进。

## Enterprise 对接规则

Enterprise 不再 overlay `AppTopControls` 或 `packages/ui/src/components/business/app/navigation`。需要扩展顶部入口时，修改 runtime contract 的实现：

```tsx
export const runtimeAppTopControls: FrontendAppTopControls = {
  settingsAction: 'appSettingsRoute',
  globalMenuItems: [
    { id: 'billing', label: '套餐与充值', icon: CreditCard, to: '/billing' },
  ],
}
```

高频业务动作应优先放在页面自己的内容区或 `primaryActions`，低频全局入口才进入 `globalMenuItems`。
