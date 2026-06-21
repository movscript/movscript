# 程序头 Icon 架构

本文定义 MovScript 各页面程序头的 icon 语义区域，避免把导航、布局、主操作、上下文工具和全局动作混在一起。

## 语义区域

| 区域 | 放置内容 | 典型 icon |
| --- | --- | --- |
| `navigationControls` | 回到上层、进入 Home、项目内后退/前进等导航行为 | `Home`、`ArrowLeft`、`ArrowRight` |
| `layoutControls` | 当前程序自己的布局折叠、展开、只读状态和面板显示 | `PanelLeftOpen`、`PanelLeftClose` |
| `primaryActions` | 当前程序最高频的保存、播放、运行等主操作 | `Play`、`Save` |
| `contextActions` | 当前页面上下文工具入口，例如终端、资源、任务和工作流面板 | 终端、资源、任务 |
| `globalActions` | 全局菜单和全局状态入口 | `MoreHorizontal` 全局菜单、`RefreshCw` 菜单项 |

## 页面映射

| 页面 | `navigationControls` | `layoutControls` | `primaryActions` | `contextActions` | `globalActions` |
| --- | --- | --- | --- | --- | --- |
| Global Home | 无 | 无 | 无 | 无 | `AppTopControls`，含 App 更新入口和更新红点 |
| Project 模式 | `Home`、项目内后退、项目内前进 | 无 | `ProjectGitHeaderActions` | 终端 | 默认 `AppTopControls` |
| Account Settings | `Home`、退出设置 | 设置侧栏折叠/展开，不放后退/前进 | 无 | 终端按当前 shell 需要放置 | 默认 `AppTopControls` 或隐藏项目选择 |
| Canvas 编辑器 | `Home`、返回 Canvas 来源列表 | 节点库开关、Canvas 只读状态 | 运行、保存 | 右侧工作流面板、资源、任务 | 默认 `AppTopControls` |

## 规则

App 更新属于全局 Home 的右上角菜单，不进入项目、Canvas 或设置页的 `primaryActions`。

每个可沉浸或可独立打开的程序头都必须有 `Home`，否则用户无法稳定回到全局入口。项目模式内部存在项目内路由历史，所以项目模式的程序头需要提供后退和前进。

Canvas 返回路径由 `canvasBackPath(search)` 决定。Canvas 的返回是“回到来源列表或来源上下文”，不是浏览器历史的通用后退。

右上角不放项目切换 icon。项目切换属于当前模式的上下文选择，不是全局动作。

模式切换不是高频动作，收纳在 `MoreHorizontal` 全局菜单中。全局菜单由 runtime contract 注入，不由社区版和企业版分别叠加。

Git 的 commit、pull、push 只属于项目模式。全局 Home 是模式入口，不继承项目模式的 `primaryActions`。

设置页的“退出设置”是唯一的返回上层语义。设置侧栏折叠/展开是布局控制，不应伪装成导航。

Enterprise 不再 overlay `AppTopControls`。企业版如需增加全局菜单项，应通过 `runtimeAppTopControls: FrontendAppTopControls` 的 `globalMenuItems` 注入。
