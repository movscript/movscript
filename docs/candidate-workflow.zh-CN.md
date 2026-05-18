# 候选集工作流

English version: [Candidate Workflow](./candidate-workflow.md).

本文记录 AI 生成素材候选的当前产品契约。用户侧动作是**加入候选集**，不是直接绑定。

## 产品契约

- AI 生成媒体在用户或制作项审批前都处于可审核候选状态。
- 一个目标可以拥有多个候选。
- 一个生成任务可以返回多个 `output_resource_id`；每个可用的正整数资源 ID 都应写成一条独立候选。
- 候选写入和采纳 / 锁定应用都会校验引用的 raw resource 真实存在。
- 当前候选目标包括素材需求和 keyframe / 画面锚点。
- 未来类似视觉锚点的目标应复用同一候选模式，不再引入直接绑定语义。

## 目标类型

素材需求候选：

- 通过 `/projects/:projectId/entities/asset-slot-candidates` 写入。
- 保存 `asset_slot_id`、`resource_id`、`status: candidate`、来源和备注。
- 采纳候选时锁定目标素材需求，把选中资源复制到目标，并拒绝兄弟候选。
- 即使旧记录仍带有 `resource_id`，只要对应 raw resource 不存在，就不能锁定候选。
- 后端同样会拦截直接 `PATCH /asset-slot-candidates/:id` 选中候选的请求；前端禁用按钮只是体验层保护。

Keyframe / 画面锚点候选：

- 以 `status: candidate` 且带 `resource_id` 的 `keyframe` 写入。
- 生成候选用 `metadata_json.source = "ai_generated_keyframe_candidate"` 标记。
- `metadata_json.target_keyframe_id` 指向原始 keyframe / 画面锚点。
- 禁止直接创建 `accepted` 候选；采纳必须通过 work item。
- Work item 采纳要求 AI 生成候选标记；历史上只带 `target_keyframe_id` 的记录会从正式上下文中排除，但不会被当作可采纳 AI 候选。
- 采纳时把资源、画布、描述和 prompt 同步到原始目标，把选中候选标为 accepted，并拒绝兄弟候选。
- 生成和历史 keyframe 候选不计入正式 keyframe readiness、源锁判断、预览输出，也不进入制作 / 生成上下文的正式 keyframe 列表。

## UI 行为

- 生成结果卡片显示 `加入候选`。
- 没有 `resourceId` 的结果仍然可见，但不能复制引用或加入候选集。
- 非正数、非整数或非有限资源 ID 按缺失资源 ID 处理。
- 单个结果控件把一个资源加入一个目标候选集。
- 多结果控件可以把所有可用资源加入同一个目标候选集。
- Workbench 从资源库选择或上传关键帧图片时，会加入 keyframe / 画面锚点候选，不会直接 patch 正式关键帧资源。
- Canvas 输出推送会加入素材需求候选，不会直接 patch 或锁定目标素材需求。
- 通用资源绑定不会回填 `asset_slot.resource_id`；正式采纳只由显式候选采纳 / 锁定流程负责。
- 通用语义编辑不再展示素材需求和 keyframe 的直接 `resource_id` 字段。后端 patch API 会拒绝直接采纳素材需求资源 / 锁定和直接采纳 keyframe 资源；候选采纳 / 锁定流程通过内部 repository 路径写入正式资源。
- 批量写入部分成功后，重试只提交失败或尚未写入的附件，避免重复创建已成功候选。
- 写入成功后，任务、Workbench、预制作、概览和制作相关候选消费者都会失效刷新。

## Agent 与 MCP 契约

- `movscript_attach_asset_slot_candidate` 把一个资源加入素材需求候选集。
- `movscript_attach_keyframe_candidate` 把一个资源加入原始 keyframe / 画面锚点候选集。
- Attach tool 的目标 ID 和资源 ID 必须是正整数；非正数 ID 或互相冲突的别名会在写入前被拒绝。
- Agent 必须逐个写入每个可用 `output_resource_id`，并逐项报告成功、失败或阻塞。
- 除非 attach tool 成功，否则 Agent 不得声称资源已加入候选集。
- Agent 不得把已有 generated keyframe candidate 当作 keyframe 目标传入。
- 通用 Agent draft apply 不能写 `asset_slot.resource_id`、`asset_slot.locked_asset_slot_id` 或 `keyframe.resource_id`；资源采纳必须走候选写入加显式采纳 / 锁定流程。

## 验证

覆盖该契约的聚焦检查：

```bash
# 从仓库根目录开始。
cd apps/frontend
node --experimental-strip-types --test \
  electron/mcp/candidateParams.test.ts \
  electron/mcp/generation.test.ts \
  electron/mcp/serverCandidateContract.test.ts \
  src/lib/agentGenerationArtifacts.test.ts \
  src/lib/agentGenerationMedia.test.ts \
  src/lib/agentGenerationTraceFixtures.test.ts \
  src/lib/assetCandidateQueryInvalidation.test.ts \
  src/lib/agentGeneratedResourceBinding.test.ts \
  src/lib/agentGeneratedResultAttachments.test.ts \
  src/lib/tasksCandidateSelectionContract.test.ts \
  src/lib/contentWorkbenchUiContract.test.ts \
  src/lib/agentCatalogCandidateContract.test.ts \
  src/lib/preProductionCandidateLockContract.test.ts
```

```bash
cd ../backend
GOCACHE=/private/tmp/movscript-go-build-cache go test ./internal/app/workflow ./internal/app/semantic ./internal/domain/semantic ./internal/app/preview ./internal/interfaces/http/handler

# 改到 service 或 handler 后，建议追加完整后端回归。
GOCACHE=/private/tmp/movscript-go-build-cache go test ./...

cd ../..
node tests/scripts/agent/candidate-feature-source.test.mjs
pnpm run test:scripts
node --test tests/scripts/agent/verify-compact-contract.test.mjs
node scripts/verify-script-manifest.mjs
```

依赖不完整的 workspace 中仍有已知验证阻塞：

- `pnpm --filter movscript-frontend test:generation-contract` 需要 workspace 安装 `tsx`。
- 完整前端 typecheck 和 TSX 测试需要先安装前端依赖。
- `pnpm install --offline --frozen-lockfile` 可能因本地 store 缺少 `@radix-ui/react-toast` 等包而失败，错误为 `ERR_PNPM_NO_OFFLINE_TARBALL`。
- 网络受限沙箱中运行 `pnpm install --frozen-lockfile` 可能失败在 `ENOTFOUND registry.npmjs.org`。
- 插件 build 命令复用 `apps/movcli` 工具链，因此真实插件打包需要先安装 movcli workspace 依赖。
- Browser / Electron E2E 需要能监听本地端口并启动浏览器运行时的沙箱环境。
