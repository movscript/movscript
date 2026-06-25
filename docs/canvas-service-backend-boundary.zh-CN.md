# Canvas Service 后端边界梳理

本文只梳理当前 Canvas Surface 仍然实际使用的后端能力，避免把已经迁到本地的 Canvas 编排能力再次搬回后端。

## 当前调用事实

Canvas Surface 现在的执行编排已经在本地完成：

- 拓扑排序、节点输入收集、引用工作流递归执行：`surface/canvas/src/features/runtime/useCanvasRuntimeExecutor.ts` 和 `canvasRuntimeGraph.ts`。
- 运行历史、任务状态、节点运行 UI 状态：`surface/canvas/src/features/runtime/runHistoryStore.ts`。
- 节点目录和 palette：`surface/canvas/src/features/presentation/nodeCatalog.tsx` 从本地 `CANVAS_NODE_DEFINITIONS` 生成。
- 模型/媒体/资源运行时入口：Canvas 本地编排后统一调用 Canvas Service 的 runtime adapter；adapter 可以桥接通用模型网关、任务队列和资源写入，但 Data Service 不再承接 Canvas 专属 runtime route。

因此，Canvas Service 不应该重新拥有 graph runtime、run/task persistence 或 node catalog；但它应该拥有 Canvas Surface 对外看到的 runtime adapter 边界，避免页面直接触达 Data Service 的通用 `/models`、`/jobs` 或 `/resources/upload`。

## 仍需后端承接的能力

| 能力 | 当前入口 | 真实职责 | 目标归属 |
| --- | --- | --- | --- |
| Canvas 列表/创建/读取/重命名/删除 | `/v1/canvas/canvases` | 保存和读取 Canvas 文档元数据、节点、连线 | Canvas Service，底层可暂用 Data Service 存储 |
| Canvas 图保存 | `/v1/canvas/canvases/:id` `PUT` | 持久化本地编辑后的 nodes/edges | Canvas Service，底层可暂用 Data Service 存储 |
| 引用工作流读取 | `/v1/canvas/canvases/:id` | 本地执行引用工作流前读取被引用 Canvas | Canvas Service，底层可暂用 Data Service 存储 |
| 文本模型调用 | `/v1/canvas/runtime/text` | Canvas Service 本地 runtime adapter 调用显式配置的 OpenAI-compatible Model Gateway | Canvas Service，不再代理 Data Service 的 `/api/v1/canvas-runtime/text`，也不默认回落到 Data Service |
| 模型目录读取 | `/v1/canvas/runtime/models` | Canvas runtime 查询可用模型 | Canvas Service adapter，底层可读通用模型目录 |
| 媒体生成 | `/v1/canvas/runtime/media`、`/v1/canvas/runtime/jobs/:id` | Canvas runtime 创建和轮询生成任务 | Canvas Service adapter，底层可借用通用 Job 能力 |
| 文本资源写入 | `/v1/canvas/runtime/text-resource` | Canvas runtime 把文本结果落为资源 | Canvas Service adapter，底层可借用通用 Resource 能力 |

## 应删除或降级的历史 Canvas 后端能力

- `model-diagnostics`：当前 Canvas Surface 没有调用；后续若需要，应作为调试工具或 Model/Gateway diagnostic，而不是 Canvas 核心 API。
- `plugins/canvas-nodes`：当前 palette 使用本地 node definitions；插件节点若恢复，应走插件/扩展目录，不应让 Canvas Service 维护或代理另一套 node catalog。
- Canvas run/task/output 后端持久化：当前运行历史在本地 store；除非未来明确需要跨设备审计，否则不应恢复为 Canvas Service 运行时职责。

## 迁移结论

短期可接受状态：

```text
Canvas Surface
  -> Canvas Service /v1/canvas/canvases*
    -> Data Service canvas storage compatibility route

Canvas Surface
  -> Canvas Service /v1/canvas/runtime/text
    -> MOVSCRIPT_MODEL_GATEWAY_URL /v1/chat/completions
```

这表示 Canvas 的产品入口和宿主边界已经独立；底层文档存储仍借用 Data Service，但模型调用必须显式走本地/外部模型网关，不再用 Data Service 的 Canvas runtime 兜底。

迁移结论：

1. Canvas Service 对外保留 document storage API、Canvas runtime adapter 和必要的 auth/org/project scope 校验。
2. Data Service 中的 Canvas 能力只保留 storage backing route；存储暂不本地化，runtime 不再由 Data Service 代为处理。
3. Canvas runtime 的模型目录、文本模型调用、媒体生成任务、任务轮询和文本资源写入统一经由 Canvas Service adapter；Canvas Surface 不直接调用 Data Service 的 `/models`、`/jobs` 或 `/resources/upload` 执行 Canvas runtime。
4. `runtime/text` 由 Canvas Service 本地 adapter 调用 `MOVSCRIPT_MODEL_GATEWAY_URL` 指向的模型网关；未配置时返回 `model_gateway_not_configured`，禁止再代理、恢复或默认回落到 Data Service 的 `/api/v1/canvas-runtime/text`。
5. 删除 Canvas Service 对 `plugins/canvas-nodes` 和 `model-diagnostics` 的代理，也删除 Data Service 中旧的 Canvas runtime/diagnostics handler 源码，除非有明确调用方重新出现。
