# MovScript Agent MCP v1

更新时间：2026-04-28

## 决策

- Agent 运行在本机独立进程：`movscript-agent`，定位是 agent server，不是产品 CLI
- MovScript 前端提供 MCP server：Electron main process 监听本机端口
- 第一版只做 read + draft，不做正式写入、不触发生成、不产生计费

## 进程关系

```text
movscript-agent
  exposes local HTTP control API
  <-> JSON-RPC over HTTP
Electron main MCP server
  <-> IPC
React renderer
  <-> MovScript backend API
```

默认 MCP endpoint：

```text
http://127.0.0.1:18765/mcp
```

默认 Agent server endpoint：

```text
http://127.0.0.1:28765
```

Electron main process 是 MCP server 的实际宿主。React renderer 只通过 IPC
同步当前 UI 上下文，例如 route、当前项目、当前用户和选中实体。

`movscript-agent` 可以保留 CLI 作为开发期 smoke test，但产品定位是常驻
agent server。Electron 负责在客户端启用 Local Runtime 时检测并启动该进程，
再通过本地 HTTP API 创建 thread、run、读取状态和接收结果。

## 能力边界

### 允许

- 读取当前 UI 上下文
- 读取当前项目的业务摘要
- 搜索项目实体
- 读取单个实体
- 创建本地 draft artifact
- 请求前端导航到某个实体页面

### 禁止

- 直接修改项目实体
- 删除数据
- 审批终稿
- 发起模型生成任务
- 扣费动作
- 读取文件 bytes 或内部私网资源 URL

## Resources

固定资源：

```text
movscript://ui/current-route
movscript://ui/current-selection
movscript://project/current
```

当前项目存在时提供：

```text
movscript://project/{projectId}/summary
movscript://project/{projectId}/scripts
movscript://project/{projectId}/settings
movscript://project/{projectId}/assets
movscript://project/{projectId}/episodes
movscript://project/{projectId}/scenes
movscript://project/{projectId}/storyboards
movscript://project/{projectId}/shots
movscript://project/{projectId}/pipeline
movscript://project/{projectId}/tasks
movscript://project/{projectId}/drafts
```

Resource 返回 JSON 文本内容。列表类资源必须返回摘要，避免把大文本、文件
bytes、presigned URL 或私网 MinIO URL 暴露给 Agent。

## Tools

### `movscript.get_context_pack`

返回当前 route、project、user、selection、可用 resources、draft 数量。

### `movscript.read_entity`

读取一个项目实体。

```json
{
  "projectId": 1,
  "entityType": "script",
  "entityId": 10
}
```

`projectId` 可省略，省略时使用当前项目。

### `movscript.search_entities`

跨实体搜索项目内容。

```json
{
  "projectId": 1,
  "query": "主角",
  "entityTypes": ["script", "setting", "shot"],
  "limit": 20
}
```

### `movscript.create_draft`

创建本地草稿，不写入项目实体。

```json
{
  "projectId": 1,
  "kind": "shot",
  "title": "第 3 场镜头草稿",
  "content": "镜头描述和 prompt...",
  "source": {
    "entityType": "storyboard",
    "entityId": 12,
    "runId": "run_..."
  }
}
```

支持的 `kind`：

```text
script | setting | storyboard | shot | task | prompt | note
```

### `movscript.list_drafts`

列出当前项目或指定项目的本地草稿。

```json
{
  "projectId": 1
}
```

### `movscript.open_entity`

请求前端导航到对应页面。第一版只导航页面，不自动选中具体行。

```json
{
  "entityType": "shot",
  "entityId": 88
}
```

## 后续演进

已落地的第一层开放边界：

- `movscript-agent` 支持 `movscript.agent.v1` manifest
- runtime 使用工具注册表描述 permission、risk、project scope 和默认审批要求
- tool policy 不再是硬编码白名单，而是检查 manifest 授权、权限、审批和项目上下文
- `POST /runs` 可接收 `agentManifest`
- 未审批的高风险工具会让 run 进入 `requires_action`，并返回 `pendingApprovals`
- `POST /runs/{runId}/approve` 可批准 pending approval 并恢复同一个 run
- `POST /runs/{runId}/reject` 可拒绝 pending approval，run 以 warning 状态结束
- `GET /tools` 可查看本地 runtime 注册工具
- `GET /agent-manifest/default` 可查看默认 agent manifest

第一版稳定后，再考虑：

- 用官方 MCP SDK 替换当前轻量 JSON-RPC transport
- draft 持久化到 IndexedDB 或后端 draft 表
- renderer 上报页面级 selection
- tool call approval UI，对接 `requires_action`、approve 和 reject API
- write tools：先 draft apply，再正式写入
- generation tools：必须带成本提示和用户确认
