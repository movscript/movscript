# Electron 运行时边界

`apps/frontend/electron` 是桌面端的 Electron main-process 运行时。它需要和 `apps/frontend/src` 下面的 renderer feature 代码保持边界清晰。

## 目录职责

- `main.ts`：Electron app lifecycle 入口，负责启动、关闭、窗口创建和 IPC 注册。
- `appWindow.ts`：BrowserWindow 创建的稳定入口；窗口路径、titlebar、renderer loading 和 devtools shortcut 放在 `appWindow/`。
- `managedServices.ts`：长生命周期本地服务的稳定入口；实现细节在 `managedServices/`，包括 backend status broadcast、MCP readiness、bootstrap 和 shutdown。
- `ipc/`：只做 IPC handler registration，把 preload 调用翻译成 service 调用，不承载 feature 业务规则。
- `services/`：Electron 拥有的本地进程能力；顶层文件是稳定 facade，实现细节放进同名子目录。
- `managedServices/mcp.ts`：启动 core 提供的本地 MCP server。MCP 协议、工具、resources、backend client 和 provider-facing response formatting 归属 `@movscript/core`。
- `preload.ts`：暴露给 renderer 的 preload 入口；API 组装放在 `preload/`，按 IPC 能力分组，共享契约放在 `src/shared/contracts`。

## Renderer 边界

`apps/frontend/src` 下可以有 UI 侧 bridge，例如 `src/electron/ElectronMCPContextBridge.tsx`，用于收集 route/session context 并通过 preload API 同步给 Electron。

这个 bridge 不是 MCP server，而是 renderer-side context synchronization。MCP server、tool execution、resources、auth token storage、backend calls 和 JSON-RPC handling 都属于 `@movscript/core`。

Renderer 侧其他 MCP 命名应放在真实所属 feature 下：

- agent 的 MCP ready/error UI helper 放在 `src/features/agent/presentation`。
- plugin runtime 暴露给 client plugin 的 `mcp.*` adapter 放在 `src/features/plugins/infrastructure`。
- preload/Electron 共用的 MCP context contract 放在 `src/shared/contracts`。

## 放置规则

- Electron main-process 能力放进 `electron/services/<capability>/`，并通过 `electron/services/<capability>.ts` 暴露。
- Electron 不再拥有 `electron/mcp` 实现目录。需要 MCP 能力时直接 import `@movscript/core`；Electron 只负责同步 UI context、workspace dir、backend base URL，并启动/停止 core MCP server。
- IPC wiring 放进 `electron/ipc/`；保持轻量，具体工作委托给 services 或 MCP modules。
- preload、renderer、Electron 共用的 type contracts 放进 `src/shared/contracts`。
- `electron/**` 不直接 import renderer feature internals。如果 Electron 需要共享类型或纯规则，提取到 `src/shared/contracts` 或 `src/shared/domain`。
- 不再建立 renderer `src/mcp` server tree。renderer 侧 MCP 相关代码应按真实职责命名，例如 context bridge、UI status 或 feature infrastructure adapter。

## 当前 MCP 形态

MCP 归属 `packages/core/src/mcp`：

- protocol/lifecycle：HTTP、JSON-RPC、server status/probes
- backend access：backend client、backend errors、auth/session lookup
- tool domains：workspace handoff、domain model、generation、resources、project tools
- runtime context：renderer 通过 IPC 推送 focus/context，core 保存 MCP context
- response and value helpers：MCP content、markdown、JSON value、tool schema

新增不依赖 Electron 的 MCP 能力必须进入 core；只有真实 Electron 本地能力才留在 `electron/services`，并通过 core 的配置或注入点接入。
