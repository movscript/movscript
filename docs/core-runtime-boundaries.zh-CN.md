# MovScript Core Runtime Boundaries

本文定义 `@movscript/core` 的最终运行时边界。目标是让业务能力按领域正交拆分，同时让 browser-safe 代码和 Node runtime adapter 在 import 路径上可见、可检查、可维护。

## 核心结论

`@movscript/core/node` 这种大桶入口不是最终形态。最终形态按两个维度拆分：

```text
领域能力：workspace / mcp / backend / plugins
运行时：shared / node
```

最终 public imports：

```text
@movscript/core
@movscript/core/workspace
@movscript/core/workspace/node
@movscript/core/mcp
@movscript/core/mcp/node
@movscript/core/backend
@movscript/core/backend/node
@movscript/core/plugins
@movscript/core/plugins/node
```

禁止新增：

```text
@movscript/core/node
@movscript/core/workspace-contracts
```

根入口 `@movscript/core` 只聚合 shared/browser-safe 能力，不能导出任何 `/node` adapter。

## 运行时边界

### React Renderer

renderer 按浏览器环境处理，即使运行在 Electron 中也不能直接访问 Node 能力。

允许：

```text
@movscript/core
@movscript/core/workspace
@movscript/core/mcp
@movscript/core/backend
@movscript/core/plugins
window.api exposed by Electron preload
fetch/http client
```

禁止：

```text
@movscript/core/*/node
node:fs
node:path
node:crypto
node:child_process
process.cwd()
process.env as runtime dependency
Electron ipcRenderer direct import
```

renderer 需要本地 workspace 能力时，通过 preload/IPC：

```ts
const file = await window.api.readMovScriptWorkspaceFile?.({ path })
```

### Electron Preload

preload 只暴露安全、窄口径 API：

```text
contextBridge.exposeInMainWorld
ipcRenderer.invoke wrapper
event subscribe/unsubscribe wrapper
```

preload 不承载业务实现，也不把 Node 实现细节暴露给 renderer。

### Electron Main

Electron main 是桌面端本地能力执行层。

允许：

```text
@movscript/core/workspace/node
@movscript/core/mcp/node
@movscript/core/backend/node
@movscript/core/plugins/node
node:fs
node:path
child_process
Electron ipcMain
```

职责：

```text
注册 IPC handler
调用具体领域的 Node adapter
做路径边界、安全校验和错误归一化
把结果转换成 ElectronAPI contract
```

### Backend 和 CLI

backend/CLI 是 Node 环境，但也应导入具体领域入口，而不是大桶入口：

```text
@movscript/core/backend/node
@movscript/core/workspace/node
@movscript/core/mcp/node
@movscript/core/plugins/node
```

## Core 入口职责

### `@movscript/core/workspace`

browser-safe workspace domain：

```text
workspace ontology
workspace contracts/schema ids
workspace config types
domain index/query pure functions
repository interfaces
repository implementations that depend only on injected interfaces
candidate record pure builders/writers through repository interface
```

### `@movscript/core/workspace/node`

Node workspace adapter：

```text
workspace fs repository
workspace review/build implementation when it uses Node crypto
workspace root/config path resolution and file read/write
provider workspace context paths
```

### `@movscript/core/mcp`

browser-safe MCP contract：

```text
JSON-RPC/MCP types
MCP response content formatting
tool schemas/definitions
model contract pure helpers
```

### `@movscript/core/mcp/node`

Node MCP runtime：

```text
HTTP server
JSON-RPC handler bound to server registries
tool actions
resource readers
resource media/ffmpeg helpers
MCP context persistence
```

### `@movscript/core/backend`

browser-safe backend contract:

```text
backend error types
error normalization
request/response types when needed
```

### `@movscript/core/backend/node`

Node backend adapter:

```text
backend config/auth files
runtime default workspace/env handling
backend client that reads workspace auth
```

### `@movscript/core/plugins`

browser-safe plugin contract:

```text
provider plugin manifest
archive contribution parsing
catalog file mapping
pure validation
```

### `@movscript/core/plugins/node`

Node plugin adapter:

```text
plugin catalog pack install/uninstall/list
plugin store directory resolution
filesystem writes/removal
```

## Dependency Rules

允许方向：

```text
@movscript/core -> shared entries only
@movscript/core/*/node -> corresponding shared entry
Electron main -> @movscript/core/*/node
renderer -> @movscript/core/* shared entries
```

禁止方向：

```text
shared entry -> any /node entry
shared entry -> node:* / fs / path / process / NodeJS runtime types
renderer -> @movscript/core/*/node
renderer -> @movscript/core/node
```

## Transport 抽象

业务层不关心能力来自 Electron IPC 还是 HTTP。用 gateway/repository interface 隔离 transport：

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

## 当前强制检查

边界检查应覆盖：

```text
apps/frontend/src 禁止 @movscript/core/*/node
apps/frontend/src 禁止 @movscript/core/node
apps/frontend/src 禁止 node built-in runtime imports
shared core entry graph 禁止 Node-only imports
```

`@movscript/core` package exports 不应包含：

```text
./node
./workspace-contracts
```

如需 workspace schema/contract，使用：

```ts
import { WORKSPACE_CONTENT_SCHEMA_IDS } from '@movscript/core/workspace'
```

如需 Node workspace 能力，使用：

```ts
import { createNodeMovScriptWorkspaceFileRepository } from '@movscript/core/workspace/node'
```
