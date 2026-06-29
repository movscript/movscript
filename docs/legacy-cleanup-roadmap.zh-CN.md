# MovScript Legacy 清理路线图

状态：草案。本文来自 2026-06-29 对当前仓库的静态审计，目标是把分散在代码、脚本和既有设计文档里的 legacy/compatibility 清理项收敛成可执行路线。

## 审计范围

本次重点审计 `movscript/` 仓库本体，排除了 `vendor/`、`node_modules/`、`dist/`、`out/`、打包后的 `bin/*.mjs` 等生成物；仅在判断分发链路时查看 `plugins/movscript` 和 release 脚本。

顶层工作区还存在 `movscript-main-quarantine/`、`mov/`、`new-api/` 等兄弟目录。它们不是本文清理范围，但建议另开一次“工作区归档/隔离”审计，避免后续搜索和人工判断持续被旧项目噪声干扰。

静态扫描口径：

- 显式 `legacy/deprecated/compat/兼容/旧/迁移` 命中文件约 359 个。
- Agent provider-session 兼容调用点约 16 个源文件。
- 模型 registry 中 `route_adapter_hint` 命中约 318 处。
- prompt/resource 旧资源引用格式命中约 64 处。
- `source/command` 万能入口相关源文件约 6 个。
- `resourceView`/`resources/view` 相关源文件约 19 个。

这些数字不能等同于 bug 数量，但足以说明 legacy 是横切系统状态，不是一两个文件的局部清理。

## 总体判断

MovScript 当前的 legacy 主要分成四类：

1. **运行时合同兼容**：旧命名、旧协议字段、旧入口仍被新实现包着使用，例如 `local-node`、`sessionId`、`source/command`。
2. **数据模型迁移中间态**：旧字段仍能推导运行时行为，例如模型 `capabilities` 字符串、`route_adapter_hint`、旧 resource mention。
3. **产品页面 fallback**：read-model 已出现，但旧多 query / `resourceView` 仍作为无能力 host 的 fallback。
4. **分发/构建兼容**：插件分发镜像、pnpm deploy legacy、DMG builder patch 等不是业务 legacy，但需要生命周期和删除条件。

清理原则：

- 先阻止新写入 legacy，再迁移存量，最后移除读取兼容。
- 有用户数据或运行时路由风险的项目必须先有 dry-run audit、诊断输出和回滚路径。
- `plugins/movscript` 当前是 `apps/plugin` 的分发镜像，不应人工双写；清理目标是标清 source-of-truth，不是直接删除分发目录。
- `source/command`、inline candidate、旧 prompt ref 等“方便入口”需要先有 typed endpoint / CLI / MCP 等价能力，再降级为 debug-only。

## Legacy 清单

| 优先级 | 主题 | 主要证据 | 当前作用 | 风险 | 目标状态 |
| --- | --- | --- | --- | --- | --- |
| P0 | 模型路由旧字段与 adapter 边界 | `docs/model-routing-adapter-refactor-plan.zh-CN.md`；`services/data-service/internal/infra/ai/catalog.go`；`services/data-service/internal/infra/ai/model_registry/schema.json`；`services/data-service/internal/infra/persistence/model/ai_model_catalog.go` | `route_adapter_hint`、逗号分隔 `capabilities`、`param_limits_json` 与结构化能力并存；`AdapterYunwuLegacy = "yunwu"` 仍保留为历史识别 | 路由事实源不唯一，Admin/运行时可能继续读旧字段，能力匹配容易回退到猜测 | route binding / route template 是 adapter、endpoint、route capability 唯一事实源；旧字段只允许迁移和诊断 |
| P0 | `source/command` 万能入口 | `packages/project/src/index.ts` 定义 `PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT` 和大量 command name；`services/project-service/src/server.mjs` 中 `executeProjectSourceCommand` switch | 一个 endpoint 承载 query、写入、canvas、候选、interpret 等多类动作 | 权限、schema、审计、缓存和 typed client 都难收敛；容易绕过 typed endpoint | typed endpoint + command manifest 覆盖稳定能力；`source/command` 仅保留 local debug/dev，并标 deprecated |
| P0 | Agent provider-session 兼容层 | `apps/desktop/src/features/agent/infrastructure/agentProviderSessionCompatibility.ts`；`providerSessionThreadQueryCache.ts`；`agentRunTraceService.ts`；`agentSessionStoreTypes.ts` | 多个诊断、trace、plan、health、settings 调用仍通过 compatibility client；`sessionId` 作为 `providerSessionTreeId` mirror | 新旧 ID 和历史 session 概念混在 UI/state/API，后续线程、任务、trace 可能继续双轨 | `providerSessionTreeId` 成为唯一输入/存储字段；compat owner 只保留历史数据读取窗口 |
| P0 | Prompt/resource mention 旧格式 | `packages/workspace/src/resourceMentions.ts` 同时解析 `@[resource:...]`、`[[resource::ID]]`、`{{resource::ID}}`；`packages/prompt/src/index.ts` 支持 `{{asset:id}}` 单冒号；`docs/resource-access-and-typed-resource-refactor-plan.zh-CN.md` | 新 typed resource mention 和 `reference_assets` 已出现，但旧文本格式仍可读可写 | prompt 文本继续成为能力推断事实源，role/media 缺失时会诱发静默推断 | 新写入只产生 typed mention + `reference_assets`；旧格式只读、带 warning，并提供自动迁移 |
| P0 | 页面 read-model fallback 与 `resourceView` 泛接口 | `docs/project-performance-hotspots.zh-CN.md`；`surface/project/src/features/content/application/loadContentCanvasProject.ts`；`surface/project/src/components/resource-view/ProjectResourceViewSurface.tsx` | Content Canvas/Standards 已有 read-model，但旧 `Promise.all` 多 query 和 `resourceView` 仍存在 | 首屏性能和缓存口径不稳定，新页面可能继续复制旧模式 | 页面首屏只用页面 read-model；`resourceView` 只做 debug/compat，并带分页/limit |
| P1 | `local-node` 到 `daemon` 命名兼容 | `apps/plugin/src/agent-mcp.ts`；`install-plugin.sh`；`docs/install.md`；`apps/plugin/README.md` | `daemon` 是新入口，`local-node` 和 `movscript-agent-mcp local-node` 仍是兼容 alias | 用户脚本、安装器和 MCP runtime 文案持续暴露旧概念 | 对外只推荐 `movscript daemon ...`；旧 alias 加 deprecation warning 和删除版本 |
| P1 | CLI 旧 alias/参数 | `apps/cli/src/commands/lang.ts` 中 `--kind`、`production_ref/segment_ref` legacy alias、`expr/cu/panel/create/remove` 等 | 保持已有脚本和手工命令可用 | CLI 文档和 Agent 示例继续传播旧字段 | 新帮助文案只展示 canonical 参数；旧 alias hidden/deprecated，最终移除或保留为明确兼容层 |
| P1 | ContentUnit `production_ref/segment_ref` legacy alias | `packages/domain/src/contentUnits.ts`；`packages/domain/src/types.ts`；`packages/domain/tests/domain.test.mjs` | 老 content unit 类型会映射成 `timeline_assembly_ref` 和 `legacy_alias` edge | 新旧 target 语义并存，图分析和 regeneration impact 需要特殊处理 | 存量 source 迁移到 `timeline_assembly_ref`；domain edge 不再需要 `legacy_alias` 作为正常路径 |
| P1 | inline candidate/source-entity candidate | `plugins/movscript/skills/generation/SKILL.md`；`packages/core/src/mcp/tools/domain/definitions.ts` | inline asset/keyframe candidate 仍是兼容路径，content-unit candidate/decision 是新路径 | 选择、adopt/reject/defer 和 stale impact 双轨 | content-unit candidate + backend decision 为唯一产品路径；inline API debug/迁移专用 |
| P1 | Scripts/Content workspace 全量读取 | `docs/project-performance-hotspots.zh-CN.md`；`surface/project/src/components/scripts/ProjectScriptsSurface.tsx`；`surface/project/src/features/content/application/loadContentCanvasProject.ts` | 列表/首屏仍可能读取全文、候选详情、timeline/edit plan | 大项目性能随数据线性变差 | scripts/content summary read-model 默认不带大字段；详情按需读取 |
| P2 | 插件 source 与分发镜像 | `apps/plugin`；`plugins/movscript`；`scripts/check-plugin-distribution.mjs`；`package-resources.manifest.json` | `apps/plugin` 是源，`plugins/movscript` 是同步后的 provider plugin bundle | 人工编辑分发目录会制造双写和 drift；审计容易重复计数 | 分发目录明确标记 generated/mirrored；所有改动从 `apps/plugin` 进入，CI 校验同步 |
| P2 | 构建链兼容 patch | `scripts/release/release-workflow.mjs` 的 `pnpm deploy --legacy` 和 `patchDmgBuilderAPFSAliasCompatibility`；`scripts/release/package-macos-local-dmg.mjs` | 保持当前 Electron/macOS 打包可用 | 工具升级后 patch 可能失效；legacy deploy 隐含老 pnpm 行为 | 固定删除条件：pnpm/electron-builder 版本升级验证通过后移除 patch/legacy flag |
| P2 | UI 旧 internal index / route alias | `packages/ui/src/components/business/index.ts`；`apps/desktop/src/routes/routeLayoutRegistry.ts` | 保持旧 import 和旧内容入口可用 | 新代码继续 import flattened business index 或走旧 route | lint/quality test 禁止新 import；旧 route redirect 到 canonical surface |
| P2 | Agent conversation 旧 projection | `agentLegacyConversationTabsModel.ts`；`agentSessionPersistenceModel.test.ts` | tab message count 和 persisted envelope 兼容历史 conversation state | state 模型保留旧 transcript 和 session 表达 | 新 state schema 带 migration version；legacy model 只在 migration 层存在 |
| P3 | 文档中已完成但仍写作“兼容”的旧计划 | `docs/TODO.md`、`docs/*refactor*.zh-CN.md` | 记录多个阶段的中间态 | 新成员难判断哪些仍待做 | 每份计划增加状态、owner、最后验证日期；完成项归档 |

## 推进阶段

### 阶段 0：建立清理护栏

目标：让团队知道哪些 legacy 还在被写入，哪些只是历史读取。

建议任务：

1. 新增 `legacy-audit` 脚本或扩展现有质量脚本，排除生成物后输出分类计数。
2. 给 P0 项加 contract tests：禁止新代码写 `[[resource::...]]`、禁止新 UI/Agent 调用 `sourceCommand`、禁止 Admin template 响应暴露 `route_adapter_hint`。
3. 给兼容入口加 owner 注释和删除条件，例如 `remove after v0.x`、`read-only compatibility`、`migration-only`。
4. 在日志或返回诊断中标记兼容读取，但不要立刻打断用户流程。

验收：

- `pnpm run check` 中能跑出 legacy boundary 相关检查。
- 新增 legacy 写入会让测试失败，而不是靠人工 code review 发现。

### 阶段 1：阻止新写入 legacy

目标：所有新数据、新 UI 操作、新 Agent 输出都写 canonical 格式。

优先落点：

1. Prompt/resource：前端 chip、resource detail copy、Agent skills 示例默认写 `@[resource:media:role:id]` 或 `reference_assets`；旧 `{{resource::id}}` 只作为 loose raw-resource 文案。
2. CLI：help 中弱化 `--kind`、`production_ref`、`segment_ref`；canonical 示例改成 `--type`、`timeline_assembly_ref`。
3. Runtime：安装和 README 只展示 `movscript daemon ...`；`local-node` alias 输出 deprecation warning。
4. Project Service：新页面和新功能禁止使用 `sourceCommand`，必须走 typed endpoint。

验收：

- 新生成的 workspace source 不再包含 `production_ref/segment_ref` content unit。
- 新 prompt 保存路径不再产生 `[[resource::...]]` 或无 media/role 的旧格式，除非用户显式输入且被标记为 compat。
- 新 MCP/CLI 示例不再推广旧命令。

### 阶段 2：迁移高风险运行时合同

目标：先清会影响运行时选择和状态一致性的 P0 项。

建议顺序：

1. **模型路由强迁移**
   - 写 dry-run：列出启用 route 是否缺 `adapter_type`、endpoint、route capability。
   - 把历史 `adapter_type=yunwu` 迁移为 `yunwu_unified_video` 或禁用并给诊断。
   - 把 catalog template 的 `route_adapter_hint` 降为导入时 bootstrap 信息，不进入普通 Admin/model API。
   - router 只读 route binding/template 的 adapter 和 route capability。

2. **`source/command` 收敛**
   - 给现有 command 分类：已存在 typed endpoint、缺 typed endpoint、debug-only。
   - 缺口先补 endpoint/client/contract test。
   - Desktop preload 和 local host 改成 typed client。
   - `source/command` 仅接受 allowlisted debug command，并要求 local-only token/diagnostic。

3. **Provider-session 兼容层瘦身**
   - 统计每个 `AgentProviderSessionCompatibilityOwner` 是否仍有 UI 入口。
   - 新接口统一只收 `providerSessionTreeId`。
   - persisted state 加 schema version 和一次性 migration，迁移后删除 `sessionId` mirror。

验收：

- 模型路由运行时不会读取旧 catalog 字段做 adapter 决策。
- `source/command` 不是任何产品页面首选路径。
- provider-session 兼容 owner 数量下降，剩余 owner 都有明确历史读取说明。

### 阶段 3：收缩读取兼容

目标：让 legacy 变成显式迁移工具，而不是永久 runtime 分支。

建议任务：

1. Prompt/resource parser 对旧格式返回 diagnostics，UI 显示“建议更新引用格式”。
2. 提供 workspace migration：把可安全转换的 `[[resource::123]]` / `{{resource::123}}` 转成 typed mention 或 structured `reference_assets`。
3. ContentUnit migration：把 `production_ref/segment_ref` 转成 `timeline_assembly_ref`，保留 git diff 供人工确认。
4. `resourceView` 增加 debug/compat 标签，复杂页面全部迁移到 read-model。
5. inline candidate API 只允许 explicit legacy/migration 参数，普通生成路径拒绝。

验收：

- 旧格式读取仍能给明确提示，但新写入不会回退。
- 存量项目有 dry-run migration 报告。
- 页面首屏性能基准覆盖 Home、Standards、Content Canvas、Scripts。

### 阶段 4：删除兼容入口和清理文档

目标：真正删代码，而不是只隐藏文案。

可删除条件：

- 兼容入口有至少一个版本周期的 warning/telemetry，使用量为 0 或只来自测试 fixture。
- migration 工具已经覆盖存量格式，并有 dry-run 与回滚说明。
- 文档、skills、CLI help、README、Admin UI 都不再推荐旧入口。
- release/package smoke 在 macOS/Linux/Windows 目标环境通过。

候选删除项：

- `local-node` 命令 alias、旧 `runtime_local_node_*` tool alias。
- `sessionId` provider-session mirror。
- `route_adapter_hint` 普通 API 暴露。
- `[[resource::ID]]` 运行时读取分支。
- `production_ref/segment_ref` 写入路径。
- `source/command` 产品路径。
- `pnpm deploy --legacy` 和 DMG alias patch。

## 近期建议的第一批 PR

1. **Legacy 边界测试**
   - 新增或扩展质量脚本，统一排除生成物后扫描 P0/P1 legacy 写入。
   - 把 `apps/plugin/bin/*.mjs`、`plugins/movscript/release/**`、`apps/desktop/out/**` 等从审计中排除。

2. **模型路由 audit**
   - 增加 Data Service dry-run 命令/测试：输出缺 adapter、缺 endpoint、缺 route capability、使用 legacy `yunwu` 的 route。
   - Admin template API contract 明确不暴露 `route_adapter_hint`。

3. **Prompt/resource 写入收敛**
   - 更新 Resource Surface “Copy semantic ref” 默认输出 typed mention 或明确命名为 legacy semantic ref。
   - 对旧格式解析增加 diagnostics，并在 prompt preview 中透出。

4. **Project Service typed endpoint 缺口表**
   - 从 `ProjectSourceCommandName` 生成一张 command -> typed endpoint 对照表。
   - 没有 typed endpoint 的 command 标 `missing`，先补 Content Canvas / Scripts / candidate 相关高频路径。

5. **Provider-session migration plan**
   - 给 `AgentProviderSessionCompatibilityOwner` 增加 owner、入口页面、计划删除版本。
   - 新增测试确保新增业务代码不能直接使用 compatibility client，除非注册 owner。

## 风险和注意事项

- **模型路由不能硬删旧字段**：先迁移 route 和 Admin 诊断，否则会把可用 provider 变成不可用。
- **Prompt 旧格式需要读兼容窗口**：用户项目里可能已经保存旧 prompt，移除读取前必须有 migration。
- **`source/command` 不能只靠隐藏**：只要 endpoint 还存在，Agent/Local/Debug 仍可能继续依赖；必须在调用方和服务端同时收缩。
- **插件分发目录不是普通重复代码**：`plugins/movscript` 是打包源之一，清理时应改同步和生成标识，不要直接删除。
- **构建链兼容 patch 要带工具版本条件**：删除 DMG patch 或 `--legacy` 前先升级并跑 release smoke。

## 关联文档

- `docs/model-routing-adapter-refactor-plan.zh-CN.md`
- `docs/resource-access-and-typed-resource-refactor-plan.zh-CN.md`
- `docs/project-performance-hotspots.zh-CN.md`
- `docs/system-product-maturity-priority-audit.zh-CN.md`
- `docs/skill-mcp-daemon-refactor-target.zh-CN.md`
- `docs/prompt-composer-generation-intent-redesign.zh-CN.md`
- `docs/install.md`
- `docs/TODO.md`
