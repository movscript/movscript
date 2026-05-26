# Frontend 架构方案（前端重构阶段）

## 目标

在 `packages/ui` 持续承接展示组件的同时，`apps/frontend` 逐步收敛为：

1. Page：路由级装配、布局入口、路由参数解析。
2. Feature：按领域组织业务规则、状态编排、接口适配、页面控制器。
3. Shared/App：跨领域基础设施、应用启动、Provider、Electron 运行时边界。

核心原则：

- 页面尽量薄，不直接承载领域规则。
- 业务行为放进 `features/<domain>`，优先迁移纯逻辑和 controller，再迁展示绑定。
- `packages/ui` 只承接展示组件、布局组件、设计 token 和纯交互组件，不持有业务副作用。
- 迁移后的旧入口直接删除，不保留兼容 re-export。

---

## 当前落地策略

本轮重构采用低冲突迁移：

- 不修改 `packages/ui/**`。
- 不主动修改正在迁移的 `apps/frontend/src/components/**` 和大页面文件。
- 优先迁移未被修改的纯逻辑、selector、contract、controller。
- 迁移文件到新位置后，旧 `src/lib` 文件直接删除。
- 测试随源文件迁移到对应 feature 目录。

已建立领域：

- `features/agent`：Agent 会话、运行、计划、草稿、消息呈现、活动流、运行时状态、生成结果等领域规则。
- `features/canvas`：画布图、节点工厂、运行集成、插件节点、画布文档等领域规则。
- `features/content`：内容工作台、内容单元、情节/镜头/片段、时间线、审核流等领域规则。
- `features/project`：项目路由、项目工作台定义、项目级 proposal/review、项目查询与契约。
- `features/production`：制作编排、脚本绑定、场景写作、生产 proposal、生产实体模型。
- `features/resources`：资源库、媒体类型、资源附件、预览、上传、缓存等领域规则。
- `features/plugins`：客户端插件、插件桥接、插件运行与市场能力。
- `features/settings`：认证、组织、用户、引导、应用设置、工作模式。
- `shared`：跨领域基础设施和纯工具，例如 config、apiError、backendBoot、adminConsole、modelDisplay、jsonValue。

---

## 建议目录结构（`apps/frontend/src`）

```text
src/
  app/                 # 入口、Provider、路由、ErrorBoundary、i18n、主题、toast、鉴权守卫
  pages/               # route shell，只做路由参数、顶层布局和 feature controller 装配
  features/
    <domain>/
      domain/          # 纯类型、规则、selector、状态机；禁止 React/Zustand/React Query/toast
      application/     # use case、controller、业务编排；可依赖 domain 和 infra 端口
      infrastructure/  # api、storage、Electron bridge、plugin/runtime adapter
      presentation/    # React hooks、view model adapter；可连接 UI 与 application
      ui/              # 暂存领域 UI；成熟后再判断是否下沉 packages/ui
  shared/              # 与具体业务无关的工具、通用类型、通用 hooks
  contracts/           # 后端 DTO、Electron IPC contract、schema
  store/               # 仅保留真正全局状态，例如 auth/session/theme/app settings
```

---

## 领域划分

当前优先维护这些一级领域：

- `agent`：Agent chat、run、plan、draft、runtime thread、MCP readiness、agent session、settings snapshot。
- `canvas`：画布图、节点、端口、运行、canvas document、插件节点、工作流引用。
- `content`：scripts、segments、scene moments、content units、内容工作台纯规则。
- `project`：project shell、overview、standards、project routes/surfaces、project proposal review。
- `production`：制作编排、script binding、scene moments、writing expressions、production proposal。
- `settings`：auth、org、user、onboarding、app settings、work mode。

不建议再新增 `workbench` 作为一级领域。`delivery`、`pre-production`、`workbench` 这类跨阶段页面名应保留在路由或页面层，不作为领域边界名；业务逻辑应归入上述稳定领域，再通过 page/controller 组装。

---

## Page 层规则

Page 层只负责：

- 读取 route params / search params。
- 渲染顶层 layout。
- 调用 feature 暴露的 controller/hook。
- 把 view model 和 handlers 传给 `@movscript/ui` 或领域 UI。

Page 层禁止：

- 直接调用 `api`。
- 实现审批、运行、生成、状态流转等核心决策。
- 直接维护跨组件业务状态机。

---

## Feature 层规则

每个 `features/<domain>` 按实际复杂度逐步建立子层，不要求一次性补齐：

- `domain`：可测试、无副作用。不能 import React、Zustand、React Query、toast、页面组件。
- `application`：业务流程编排，可以组合 domain、store、repository、runtime port。
- `infrastructure`：后端 API、IndexedDB/localStorage、Electron/preload、plugin runtime、MCP adapter。
- `presentation`：React hook、view model adapter、UI callback adapter。
- `ui`：只保留还没有下沉到 `packages/ui` 的领域展示组件。

跨领域调用必须走稳定入口，例如 `features/plugins` 暴露 plugin runtime API，其他领域不要读它的内部文件。

---

## 与 `packages/ui` 的接口规则

- `packages/ui` 不 import `apps/frontend/src/*`。
- `packages/ui` 不依赖 `api`、Zustand、React Query、Electron、toastStore。
- `packages/ui` 可以有业务命名组件，但只能接收 `viewModel + handlers + state`。
- 业务含义和异步状态由 feature 层决定，UI 只渲染和回调。
- 如果组件迁移到 `packages/ui` 时需要业务逻辑，先在 `apps/frontend` 侧保留 adapter/controller，不把副作用带入 UI 包。

## Electron 运行时边界

`apps/frontend/electron` 是桌面端 main-process 运行时，不属于 renderer feature 层。它的目录职责和 MCP 边界见 [`apps/frontend/electron/README.md`](../apps/frontend/electron/README.md)。

核心约束：

- `electron/ipc` 只做 IPC handler wiring，业务能力委托给 `electron/services` 或 `electron/mcp`。
- `electron/services` 放 Electron 拥有的本地进程能力，顶层文件作为稳定 facade。
- `electron/mcp` 放桌面端本地 MCP server、JSON-RPC、tools/resources 和 agent-facing adapters。
- renderer 侧如果需要同步 MCP 上下文，应放在能表达真实职责的位置，例如 `src/electron/ElectronMCPContextBridge.tsx`；不要再建立 renderer `src/mcp` server 树。
- preload/renderer/Electron 共用类型放 `src/shared/contracts`，跨运行时纯规则放 `src/shared/domain`。

自动化检查：

- `pnpm --filter @movscript/desktop check:electron-boundaries` 检查 Electron 顶层入口、MCP/shared 命名边界、禁止的 `src/mcp` 路径，以及 Electron 到 renderer/internal implementation 的违规 import。

---

## 迁移顺序

1. 迁移纯逻辑和测试到 `features/<domain>/domain`。
2. 迁移 controller/use case 到 `features/<domain>/application` 或 `presentation`。
3. 页面改为只装配 feature controller。
4. 展示组件稳定后，再从 `components/**` 下沉到 `packages/ui`。
5. 旧 `@/lib/*` 入口替换为 `@/features/<domain>` 或 `@/shared/*`，替换完成后直接删除旧文件。
6. 加 ESLint import boundaries 和 CI 检查。

---

## 可自动化边界（后续）

建议逐步加入 import 限制：

- `features/*/domain/**` 禁止 import React、`@tanstack/react-query`、Zustand store、toast、页面组件。
- `pages/**` 禁止直接 import infrastructure API；需要通过 feature controller 或明确 shared port。
- `packages/ui/**` 禁止 import `@/`、`apps/frontend`、Electron、store。
- `features/<domain>` 内部实现不允许被其他领域深路径依赖，跨域只能依赖 `features/<domain>/index.ts` 或明确 public API。

---

## 成熟度指标

- 新业务逻辑不再新增到 `src/lib`。
- `src/lib` 不保留源码入口；领域逻辑归入 `features/<domain>`，跨领域能力归入 `shared`。
- 页面平均行数下降，页面不直接调用 API。
- 关键 domain/application 逻辑有节点测试。
- `packages/ui` 无业务副作用依赖。
