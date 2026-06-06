# MovScript Core Runtime Boundaries

本文定义 `@movscript/core`、Electron、renderer app、backend 和 CLI 之间的运行时边界。目标是让共享业务能力可以复用，同时避免浏览器端 bundle 引入 `node:fs`、`node:path`、`process` 等 Node-only 能力。

## 核心结论

`@movscript/core` 不应该表示“所有核心代码”。它应该表示“所有运行时都能安全使用的共享核心”。

需要拆成两个明确层次：

```text
@movscript/core
  browser-safe shared core

@movscript/core/node
  Node runtime adapter
```

Electron 和 app 都可以依赖 core，但依赖方式不同：

```text
React renderer -> @movscript/core
Electron main  -> @movscript/core + @movscript/core/node
Backend/CLI    -> @movscript/core + @movscript/core/node
```

React renderer 即使运行在 Electron 里，也按浏览器环境处理。renderer 不直接访问本地文件系统，而是通过 Electron preload/IPC 或 HTTP API 请求能力。

## 运行时边界

### React renderer

renderer 是浏览器环境，负责 UI、交互、展示、本地状态和调用能力接口。

允许：

```text
@movscript/core
@movscript/core/workspace-contracts
@movscript/core/plugins
app 内 browser-safe modules
window.api exposed by Electron preload
fetch/http client
```

禁止：

```text
@movscript/core/node
node:fs
node:path
node:crypto
node:child_process
process.cwd()
process.env as runtime dependency
Electron ipcRenderer direct import
```

renderer 需要本地 workspace 能力时，只调用窄接口：

```ts
const file = await window.api.readMovScriptWorkspaceFile?.({ path })
```

### Electron preload

preload 是 renderer 和 Electron main 之间的安全桥。它不承载业务逻辑，只暴露经过挑选的 API。

职责：

```text
contextBridge.exposeInMainWorld
ipcRenderer.invoke wrapper
订阅事件并返回 unsubscribe
限制 renderer 可见能力范围
```

preload API 应该是稳定 contract，不应该把 Node 实现细节暴露给 renderer。

### Electron main

Electron main 是桌面端本地能力执行层。

允许：

```text
@movscript/core/node
node:fs
node:path
child_process
Electron ipcMain
local app server lifecycle
workspace root/config/files
plugin install/uninstall
```

职责：

```text
注册 IPC handler
调用 @movscript/core/node 的本地实现
做路径边界、安全校验和错误归一化
把结果转换成 ElectronAPI contract
```

### Backend 和 CLI

backend 和 CLI 是 Node 环境，可以直接使用 `@movscript/core/node`。

它们和 Electron main 的区别不是能力范围，而是 transport 不同：

```text
Electron main -> IPC
Backend       -> HTTP/RPC
CLI           -> command invocation
```

核心业务模型和协议应尽量复用 `@movscript/core`，本地文件、进程和配置实现放在 `@movscript/core/node`。

## Core 分层

### `@movscript/core`

根入口必须 browser-safe。

适合放入：

```text
domain types
DTO/request/response types
schema id/constants
workspace contracts
pure domain index/query functions
repository interfaces
pure validators
JSON-RPC shape helpers without process/env dependency
plugin manifest types and pure parsing
```

不应放入：

```text
filesystem repository implementation
workspace root creation
home/config file read/write
MCP server listen/start/stop
resource media ffmpeg processing
backend config stored on disk
plugin catalog pack store on disk
anything importing node:* modules
```

根入口示例：

```ts
export * from './workspace/domain/index.js'
export * from './workspace/contracts/index.js'
export * from './workspace/ontology.js'
export * from './workspace/repository/types.js'
export * from './workspace/repository/domainRepository.js'
export * from './workspace/repository/candidates.js'
```

### `@movscript/core/node`

Node 入口承载所有本地运行时实现。

适合放入：

```text
home paths/config
workspace fs repository
workspace root manifest read/write
backend config read/write
MCP server lifecycle
resource media file processing
ffmpeg path resolution
plugin catalog pack store
```

入口示例：

```ts
export * from './index.js'
export * from './home/node.js'
export * from './workspace/node.js'
export * from './backend/index.js'
export * from './mcp/node.js'
export * from './plugins-node.js'
```

`@movscript/core/node` 可以 re-export browser-safe core，但 browser-safe core 不能反向依赖 node 入口。

## Electron Contract

Electron API 类型应该是 renderer-safe contract。

当前 app 已经存在 preload/IPC 层，这个方向是正确的：

```text
electron/preload/api/*
electron/ipc/*
src/shared/contracts/electronApi.ts
```

需要注意的是，`electronApi.ts` 属于 renderer contract，不应该 import `@movscript/core/node`。如果 contract 需要共享类型，应把类型移动到 browser-safe core 入口，例如：

```text
@movscript/core
@movscript/core/workspace-contracts
@movscript/core/electron-contracts
```

推荐方向：

```ts
// renderer-safe
import type { MovScriptWorkspaceConfig } from '@movscript/core'

export type ElectronAPI = {
  getMovScriptWorkspaceConfig?: (
    input?: { workspaceDir?: string; providerProfileKey?: string }
  ) => Promise<MovScriptWorkspaceConfig>
}
```

Electron main 实现：

```ts
import { readMovScriptWorkspaceConfig } from '@movscript/core/node'

ipcMain.handle('movscript:workspace-config-get', (_event, input) => {
  return readMovScriptWorkspaceConfig(input?.workspaceDir)
})
```

## Transport 抽象

业务层不应该关心能力来自 Electron IPC 还是 HTTP。

推荐用 gateway/repository interface 隔离 transport：

```ts
export interface MovScriptWorkspaceFileRepository {
  list(input?: { path?: string }): Promise<MovScriptWorkspaceRepositoryListResult>
  read(input: { path: string }): Promise<MovScriptWorkspaceRepositoryReadResult>
  write(input: MovScriptWorkspaceRepositoryWriteInput): Promise<MovScriptWorkspaceRepositoryReadResult>
  delete(input: { path: string }): Promise<void>
}
```

不同运行时提供不同实现：

```text
Electron renderer -> Electron IPC repository
Web app           -> HTTP repository
Electron main     -> Node fs repository
Backend/CLI       -> Node fs repository
Tests             -> memory repository
```

业务查询和索引构建依赖 interface，而不是依赖 `fs`：

```ts
createMovScriptWorkspaceDomainRepository({
  fileRepository,
})
```

这是正确的抽象方向，应继续保留。

## 当前代码中的主要问题

当前 `packages/core/src/index.ts` 导出了 Node-only 链路：

```ts
export * from './backend/index.js'
export * from './workspace/build.js'
export * from './mcp/index.js'
```

这些模块会间接触达：

```text
node:fs
node:path
node:crypto
node:child_process
process
```

因此 renderer 中只要 import `@movscript/core`，Vite 就可能把 Node-only 模块纳入浏览器分析，出现类似错误：

```text
Module "node:fs" has been externalized for browser compatibility.
Cannot access "node:fs.mkdirSync" in client code.
```

这不是 React 问题，而是 package boundary 问题。

## 推荐迁移步骤

### 1. 收紧根入口

先把 `packages/core/src/index.ts` 改成 browser-safe 入口。

从根入口移出：

```text
backend/index
mcp/index
workspace/build if it imports node:crypto
workspace/projectRepository
home/*
plugins-node
```

保留：

```text
workspace/domain
workspace/contracts
workspace/ontology
workspace/repository/types
workspace/repository/domainRepository
workspace/repository/candidates
browser-safe plugin types
```

### 2. 拆 MCP 入口

`mcp/index.ts` 当前同时包含协议、server、tools、resources 和 workspace apply。建议拆分：

```text
mcp/contracts.ts
mcp/client.ts
mcp/node.ts
```

renderer 只能依赖 contracts/client 中 browser-safe 的部分。server、listen、resource media、workspace apply、ffmpeg 都归入 node。

### 3. 拆 workspace build

`workspace/build.ts` 目前依赖 `node:crypto`。有两种处理方式：

1. 如果 build 只在 Node 执行，把它移动到 `@movscript/core/node`。
2. 如果 build 需要 browser 复用，把 hash 实现注入：

```ts
type HashContent = (content: string) => string | Promise<string>
```

Node 侧用 `node:crypto`，browser 侧用 Web Crypto 或调用后端/Electron。

### 4. 清理 renderer imports

renderer 中避免根入口大而全的 import。

推荐：

```ts
import { createMovScriptWorkspaceDomainRepository } from '@movscript/core'
import { WORKSPACE_CONTENT_SCHEMA_IDS } from '@movscript/core/workspace-contracts'
```

如果根入口仍然容易变宽，则更严格地使用子入口：

```ts
import { createMovScriptWorkspaceDomainRepository } from '@movscript/core/workspace-domain'
```

禁止：

```ts
import type { MovScriptWorkspaceConfig } from '@movscript/core/node'
```

### 5. 加边界测试

建议增加静态边界测试：

```text
apps/frontend/src 禁止 @movscript/core/node
apps/frontend/src 禁止 node:* imports
apps/frontend/src 限制 @movscript/core 根入口使用
packages/core/src/index.ts 禁止导出 node-only module
browser-safe core files 禁止 node:* imports
```

这类测试比靠约定更可靠。

## 允许的依赖方向

```text
apps/frontend/src
  -> @movscript/core
  -> @movscript/core/workspace-contracts
  -> app shared contracts

apps/frontend/electron/preload
  -> renderer-safe ElectronAPI types
  -> electron ipcRenderer

apps/frontend/electron/ipc
  -> @movscript/core/node
  -> Electron ipcMain

apps/backend
  -> @movscript/core/node

apps/cli
  -> @movscript/core/node

packages/core/src/node.ts
  -> packages/core/src/index.ts
  -> node-only modules

packages/core/src/index.ts
  -> browser-safe modules only
```

禁止的依赖方向：

```text
packages/core/src/index.ts -> packages/core/src/node.ts
packages/core/src/index.ts -> home/paths
packages/core/src/index.ts -> backend/config
apps/frontend/src -> @movscript/core/node
apps/frontend/src -> electron
apps/frontend/src -> node:fs
```

## 判断一个模块放在哪里

可以用以下问题判断：

1. 这个模块 import 了 `node:*`、`fs`、`path`、`process`、`child_process` 吗？
   - 是：放 `@movscript/core/node`。
2. 这个模块会读写本地磁盘、启动服务、开端口、调用 ffmpeg 吗？
   - 是：放 `@movscript/core/node`。
3. 这个模块只处理 JSON、类型、schema、纯函数、业务查询吗？
   - 是：可以放 `@movscript/core`。
4. renderer 是否需要直接 import 它？
   - 是：必须 browser-safe。
5. Electron main/backend/CLI 是否是唯一调用者？
   - 是：优先放 node 入口。

## 目标状态

最终应该可以做到：

```text
renderer bundle never includes node:fs
@movscript/core root is browser-safe
Electron main owns local desktop capability
preload exposes narrow API
workspace domain logic is shared through interfaces
Node implementations are replaceable by IPC/HTTP/memory implementations
```

这能同时支持：

```text
Electron desktop app
future web app
backend services
CLI tools
agent/MCP local runtime
```

而不会把 UI、文件系统、本地进程和协议实现混在同一个 import 入口里。
