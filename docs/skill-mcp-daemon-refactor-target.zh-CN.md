# MovScript Skill + MCP + Daemon 重构目标

## 目标

这份文档用于梳理 MovScript 第二版设计之后，Agent Skill、MCP 工具和本地/云运行时的最终重构目标。

核心结论：

1. Skill 是 Agent 使用 MovScript 的工作流说明和权限边界，不拥有业务状态。
2. MCP 是 Agent 能力接口，不应该成为业务 sidecar 的生命周期所有者。
3. Daemon 是运行时所有者。Project、Generation、Resource、Timeline、Backend Execution 相关 MCP 能力都应通过 daemon 统一发现、注册、执行和诊断。
4. Runtime 是独立的底层能力类目。它至少要能发现、启动、停止、重启和配置 daemon，否则更高层 MCP 没有稳定入口。
5. Agent Plugin、Desktop、CLI、Codex MCP session 都应该连接同一个 daemon/runtime gateway，而不是各自启动一套业务服务。
6. System MCP 应以 CLI-first 方式重构：先保证同等能力可通过 `movscript ... --json` 独立调试，再让 MCP 作为 CLI/command runner 的外层协议适配器。`movcli` 只作为历史兼容 shim。

目标形态：

```text
Agent Provider / Codex / Desktop
  -> thin MCP adapter (stdio/http compatibility)
  -> movscript CLI command runner / CLI contract
  -> movscript.local-node daemon / cloud runtime gateway
      -> Data Service
      -> Project Service
      -> Timeline / Compile Service
      -> Editing Backend
      -> Remotion Backend
      -> HyperFrames Backend
      -> External NLE Adapter
      -> Canvas Service
      -> Local/Web Surface Host
      -> Media Pipeline
      -> MCP tool registry + tool executor

Human / CI / Debug shell
  -> movscript ... --json
  -> same command runner / daemon gateway
```

其中 `thin MCP adapter` 只处理协议适配、bootstrap 和兼容，不直接拥有 Project Service、Timeline/Compile、backend adapter、Media Pipeline 等业务 sidecar。

## CLI-first Product Contract

新增一条横切原则：CLI 是独立产品入口，不是前端或 MCP 的调试脚本。即使没有 Desktop / Project Surface 前端，`movscript` CLI 也必须能独立完成 runtime 启动诊断、系统配置、项目 source 检查、生成准备、资源管理、TimelineAssembly 编译、backend 选择和导出诊断。MCP 位于 CLI / daemon 能力的外层，而不是和 CLI 并行实现另一套逻辑。

凡是稳定的 `system_*`、`admin_*` 或 `timeline_*` MCP 能力，必须先有等价 CLI 命令或共享 command runner。没有 CLI/shared runner 的 MCP-only 工具只能标记为临时 fallback，不能成为成熟产品能力。

成熟产品形态中只应该有一个主入口：

```text
bin/movscript
  -> movscript.mjs
      -> mcp stdio        # Agent/MCP 入口
      -> daemon run       # daemon 进程入口
      -> daemon start/... # daemon 控制入口
      -> runtime ...      # runtime 诊断入口
      -> admin ...        # 系统管理入口
      -> system ...       # 系统能力入口
      -> timeline ...     # TimelineAssembly / CompileManifest / backend selection
      -> workspace ...    # 无前端项目 source review/interpret
```

`bin/movcli` 只是历史 CLI 名称，应该转发到同一个 `movscript.mjs`。`bin/movscript-agent-mcp` 只是历史 MCP 名称，应该转发到 `bin/movscript mcp stdio`。Agent Plugin 的 `bin/movscript` 是产品入口包装层：它优先处理 `mcp stdio`、`daemon run` 和 daemon lifecycle/control 命令，普通 CLI 命令再动态嵌入 `@movscript/cli` 的 command runner。独立 `@movscript/cli` 的顶层 `movscript daemon run` 也必须能直接启动同一个 daemon service plane，不能要求先存在前端或插件包装层。旧的 `local-node` / `__movscript_local_node` 只作为 daemon 命名迁移期 alias，不再出现在新文档、manifest 或示例命令的主路径中。

目标链路：

```text
system_* / admin_* / timeline_* MCP tool
  -> MCP argument/schema adapter
  -> movscript command runner
      -> daemon/runtime gateway
      -> Data/Project/Resource/Media service client
  -> structured JSON result

movscript system ... --json
movscript admin ... --json
movscript timeline ... --json
  -> same command runner
  -> same structured JSON result
```

这样形成一个可调试性不变量：

> 如果某个稳定 MCP 能力可用，则对应 `movscript ... --json` 必须可用；如果 CLI/shared runner 不可用，MCP 不应绕过 CLI 产品合约直接成功。

### 设计规则

1. CLI 是系统能力的调试入口和稳定合约；MCP 是 Agent 协议适配层。
2. CLI 不拥有业务状态，仍然通过 daemon/cloud runtime gateway 或服务 client 执行。
3. MCP 默认可以 in-process 调用 command runner，避免跨平台 shell quoting 问题；但必须能输出等价 `movscript ... --json` 命令，必要时可用 subprocess 模式复现。
4. 每个 CLI 命令必须支持 `--json`，非交互、结构化输出；需要 destructive/admin 写操作时必须有 `--yes`/`--confirm` 或明确 payload。
5. 每个 MCP 响应应包含可脱敏的 debug metadata，例如 `debug.cli_argv`、`debug.cwd`、`debug.runtime_endpoint`、`debug.exit_code`，方便复制到终端复现。
6. CLI stdout 只输出机器可读 JSON；人类说明、progress、warning 进入 stderr 或 JSON 的 `diagnostics`。
7. CLI/MCP 共享同一套 command manifest：command id、MCP tool name、输入 schema、输出 schema、owner service、所需 runtime、权限、示例。
8. MCP schema 不再手写复制 CLI schema；长期应从 command manifest 生成或至少由 parity test 校验。
9. system CLI 命令不写 project/domain 语义 source，除 project bootstrap 和 RawResource 登记外不制造 candidate/selection。
10. CLI 命令失败时必须返回稳定 exit code 和 JSON error code；MCP 将其映射为 MCP error，但保留 debug metadata。
11. 无前端模式下，CLI 可以返回 review URL 或 blocker，但不能把“需要人工审核”伪装成已完成；人工审核完成仍必须通过用户动作或 decision/selection 命令证明。

### 第一批 CLI 命令族

Runtime bootstrap 和 System 能力先迁：

```text
movscript runtime daemon discover --json
movscript runtime daemon ensure --json
movscript runtime daemon start --json
movscript runtime daemon status --json
movscript runtime daemon stop --json --yes
movscript runtime daemon restart --json --yes
movscript runtime descriptor get --json
movscript runtime preflight check --json
movscript runtime status --json
movscript runtime configure --backend-base-url http://127.0.0.1:8766 --json
movscript daemon discover/status/ensure/start/stop/restart/configure --json
movscript context current get --json

movscript system model list --capability image_generation --operation text_to_image --json
movscript system generation prepare --capability audio_music --json
movscript system generation submit --capability audio_music --prompt "quiet tension bed" --json
movscript system generation job get --job-id 701 --verbosity summary --json
movscript system generation job get-batch --job-ids '[701,702]' --json
movscript system generation result register --content-unit-id scene_01 --resource-id 880 --output-kind image --json
movscript system project create/init/open/fetch --json
movscript system artifact get-stream --stream-id 41 --json
movscript system artifact upload-export --output-path ./final.mp4 --json
movscript system artifact upload-hls-stream --manifest-path ./index.m3u8 --segment-paths '["./seg0.ts"]' --json
movscript system resource library query --json
movscript system resource library open --json
movscript system resource upload --local-path ./a.png --json
movscript system resource image read --resource-id 1 --json
movscript system resource image annotate --local-path ./a.png --annotations '[{"type":"rect","x":10,"y":10,"width":100,"height":80}]' --json
movscript system resource video probe --resource-id 2 --json
movscript system external-resource source list --json
movscript system external-resource search --query "city street" --json
movscript system shot library query --query "slow push in" --json
movscript system shot group create/get/add-shots --json
movscript system video shot-cuts analyze --resource-id 2 --json

movscript editing runtime capabilities get --json
movscript editing timeline validate --editing-project '{"version":1,"id":"edit","projectId":"project"}' --json
movscript editing project create --project-id project --title "Draft Cut" --json
movscript editing project create-from-edit-plan --edit-plan '{"tracks":[]}' --json
movscript editing project create-from-edit-decisions --edit-decisions '{"cuts":[]}' --asset-manifest '{"assets":[]}' --json
movscript editing project get --project-id project --editing-project-id edit --json
movscript editing project save --editing-project '{"version":1,"id":"edit","projectId":"project","settings":{},"assets":{"assets":[]},"timeline":{"version":1,"tracks":[]}}' --json
movscript editing project update-settings --editing-project '{"version":1,"id":"edit","projectId":"project","settings":{},"assets":{"assets":[]},"timeline":{"version":1,"tracks":[]}}' --title "Draft Cut v2" --json
movscript editing project add-asset --editing-project '{"version":1,"id":"edit","projectId":"project","settings":{},"assets":{"assets":[]},"timeline":{"version":1,"tracks":[]}}' --asset '{"id":"clip","type":"video"}' --json
movscript editing project remove-asset --editing-project '{"version":1,"id":"edit","projectId":"project","settings":{},"assets":{"assets":[]},"timeline":{"version":1,"tracks":[]}}' --asset-id clip --json
movscript editing timeline add-track --editing-project '{"version":1,"id":"edit","projectId":"project","settings":{},"assets":{"assets":[]},"timeline":{"version":1,"tracks":[]}}' --track-id video_main --track-type video --json
movscript editing timeline add-clip --editing-project '{"version":1,"id":"edit","projectId":"project","settings":{},"assets":{"assets":[]},"timeline":{"version":1,"tracks":[]}}' --track-id video_main --clip '{"id":"clip","assetId":"asset","timelineStartMs":0,"durationMs":3000}' --json
movscript editing timeline update-clip --editing-project '{"version":1,"id":"edit","projectId":"project","settings":{},"assets":{"assets":[]},"timeline":{"version":1,"tracks":[]}}' --clip-id clip --patch '{"durationMs":2500}' --json
movscript editing timeline split-clip --editing-project '{"version":1,"id":"edit","projectId":"project","settings":{},"assets":{"assets":[]},"timeline":{"version":1,"tracks":[]}}' --clip-id clip --split-time-ms 1200 --json
movscript editing timeline move-clip --editing-project '{"version":1,"id":"edit","projectId":"project","settings":{},"assets":{"assets":[]},"timeline":{"version":1,"tracks":[]}}' --clip-id clip --timeline-start-ms 500 --json
movscript editing timeline delete-clip --editing-project '{"version":1,"id":"edit","projectId":"project","settings":{},"assets":{"assets":[]},"timeline":{"version":1,"tracks":[]}}' --clip-id clip --json
movscript editing timeline remove-track --editing-project '{"version":1,"id":"edit","projectId":"project","settings":{},"assets":{"assets":[]},"timeline":{"version":1,"tracks":[]}}' --track-id video_main --json
movscript editing timeline apply-commands --editing-project '{"version":1,"id":"edit","projectId":"project","settings":{},"assets":{"assets":[]},"timeline":{"version":1,"tracks":[]}}' --commands '[{"type":"move_clip","clipId":"clip","timelineStartMs":500}]' --json
movscript editing task get --project-id project --task-id task --json
movscript editing task cancel --project-id project --task-id task --json
movscript editing task logs get --project-id project --task-id task --json

movscript timeline backend capability list --json
movscript timeline assembly get --timeline-assembly '{"id":"assembly"}' --json
movscript timeline assembly validate --edit-decisions '{"cuts":[]}' --json
movscript timeline compile manifest create --backend media_editing_project --edit-decisions '{"cuts":[]}' --json
movscript timeline backend select --preferred-backend remotion --json
movscript timeline backend project create --backend hyperframes --edit-decisions '{"cuts":[]}' --json
movscript timeline assembly compile --backend media_editing_project --edit-decisions '{"cuts":[]}' --json
movscript timeline backend conformance report --backend external_nle --edit-decisions '{"cuts":[]}' --json

movscript workspace get-model project --json
movscript workspace review --workspace ./my-project --json
movscript workspace interpret --workspace ./my-project --json
```

Admin 能力第二批迁移，但仍遵守同一原则：

```text
movscript admin provider list/create --json
movscript admin provider credential create/update/set-primary --json
movscript admin model catalog list/create/update/delete --json
movscript admin model route binding create/update/delete --json
movscript admin model gateway key list/create/update/delete --json
movscript admin resource-access settings get/update --json
movscript admin public-tunnel config get/update --json
movscript admin resource-access resolve-test --resource-id 880 --profile-id public-tunnel --json
movscript admin resource-access check-test --resource-id 880 --profile-id public-tunnel --json
```

暂不把 `admin_cloud_file_config_*` 和 `admin_usage_policy_*` 迁入 CLI/MCP 第一批；它们仍等待明确产品流程。

### 命令层实现建议

不要让 MCP 直接 shell out 到 `movscript` 作为唯一实现。推荐三层：

1. `packages/cli-contracts` 或 `apps/cli/src/commands/registry.ts`: command manifest、输入输出 schema、exit code、MCP mapping。
2. `apps/cli/src/commands/system/*.ts`: command runner handler，可被 CLI 和 MCP in-process 调用。
3. `packages/local-daemon/src/mcp.ts`: daemon MCP executor，把 MCP arguments 转成 command runner input，并把结果包装成 MCP result；`packages/mcp-host` 只保留 stdio/http 协议桥接和 bootstrap fallback。

Runtime bootstrap 是唯一允许短期例外的层：daemon 未启动时还没有 daemon MCP endpoint，因此 `movscript runtime daemon ensure/start/status` 和 stdio MCP fallback 可以复用同一组 shared runtime command runner。当前这组能力已经收敛到 `packages/cli-commands` 的 `runtimeCommandSpecs` / `runMovScriptRuntimeCommand`；CLI 直接调用 shared runner，daemon MCP executor 也调用同一 runner，MCP host 只作为外层协议适配器代理 daemon 或委托 daemon executor 做 bootstrap fallback。这个例外不能扩散到稳定业务工具：`system_*` / `admin_*` / `timeline_*` / `workspace` 都必须继续走共享 command runner 或 daemon gateway，不能在 `mcp-host` 内重新形成 direct-core fallback。

当 Agent Plugin 需要透传普通 CLI 命令时，应动态导入 `@movscript/cli`，并设置嵌入标记避免 CLI 模块按 `process.argv` 自启动。这样插件 `.mjs` 脚本和 CLI 不需要维护两套业务命令，但 daemon/plugin 包装层仍能在 MCP/daemon 命令上保持产品入口语义。

`daemon run` 的持久进程生命周期不应留在 Agent Plugin 入口内。当前已把 signal handling、idle timeout、data-plane 解析、restart loop 和 runtime app record 写入抽到 `@movscript/local-runtime` 的 `runPersistentLocalRuntimeDaemon`；local-node service adapters、gateway routes、daemon MCP HTTP endpoint、runtime descriptor/configure、static surface/data-service path resolver 已抽到 `@movscript/local-daemon`。Agent Plugin 和独立 CLI 都只传入 entrypoint/repoRoot/bundleRoot/identity 等包装层上下文，并调用同一个 `runLocalDaemonServicePlane`。

可选调试模式：

- `MOVSCRIPT_MCP_CLI_SUBPROCESS=1`: MCP 调用真实 `movscript` 子进程，用于排查 “in-process runner 与真实 CLI 不一致”。
- `--dry-run`: 只返回将执行的 daemon/API 请求、payload 摘要和权限检查，不提交写操作。

### CLI/MCP Parity 验收

每个迁移完成的稳定 MCP 工具必须有三类测试：

1. CLI 单测：`movscript system ... --json` 可独立运行并返回稳定 JSON。
2. MCP adapter 单测：`system_*` MCP 调 command runner，输出与 CLI JSON 结构一致。
3. parity/golden test：同一输入下，CLI result 与 MCP result 的 `data`、`diagnostics`、`surfaces`、`warnings` 一致；只允许 `debug` 和协议包装不同。

## 分层总览

从底层到高级，MovScript 的 Skill + MCP 应收敛为以下层次。

| 层级 | 名称 | 主要问题 | 运行时所有者 | MCP/Skill 形态 |
| --- | --- | --- | --- | --- |
| 0 | Runtime Bootstrap / Daemon Control | 如何发现、启动、停止、重启、配置 daemon，并诊断 runtime？ | thin adapter bootstrap + daemon/cloud gateway | `runtime_*`, `movscript_runtime_status` |
| 1 | 系统生成模型使用 | 能生成什么、如何提交、如何查任务？ | Data Service / model gateway | `movscript system model/generation ...` + `generation_*`, `system_model_list` |
| 2 | 系统管理能力 | provider、模型 catalog、route、gateway key、生成工具、资源公网访问如何配置？ | Admin/Data Service + daemon gateway | `movscript admin ...` + `admin_*` |
| 3 | 系统资源管理 | RawResource、上传、读取、媒体探测、外部资源、shot library | Data Service + Media Pipeline | `movscript system resource/external-resource/shot ...` + `system_resource_*`, `system_external_resource_*`, `system_shot_*` |
| 4 | 后端执行能力 | Agent 可选择哪些 timeline/render backend？ | Editing/Composition backends + Media Pipeline | `editing_*`, future `remotion_*`, `hyperframes_*`, `external_nle_*` |
| 5 | 项目层 | 项目初始化、项目 source/read-model、候选、选择、影响复查 | Project Service + Data Service | `system_project_*`, `domain_*` |
| 6 | Timeline 编译层 | 从影视意图到 TimelineAssembly / CompileManifest / backend project | Project Service + future Timeline Service | `timeline_*`, future `compile_*` |
| 7 | Skill 工作流层 | Agent 在何时用哪些工具、如何保护用户确认边界 | Skill package | `runtime`, `admin`, `project`, `planning`, `domain`, `generation`, `review`, `timeline`, `editing` |

这里的关键区分是：第 6 层的 Timeline 编译层才是剪辑/合成的上层合同；第 4 层只是可选执行后端能力。`MediaEditingProject`、Remotion、HyperFrames、External NLE 都是 CompileManifest 之后的后端选择，不应把 `MediaEditingProject` 当成唯一系统模型。

## Runtime / Daemon

Runtime 是所有业务能力下面的单独类目。它不属于 System、Admin、Project 或 Editing；它负责让 MovScript runtime 本身存在、可发现、可配置、可诊断。

这里有一个 bootstrap 例外：daemon-owned MCP 是目标形态，但 daemon 未启动时，Agent 仍需要一个极小的 MCP/CLI bootstrap 能力来启动 daemon。因此 runtime 应拆成两层：

| 子层 | 职责 | 可由谁执行 |
| --- | --- | --- |
| Runtime bootstrap | 发现 runtime records、启动/ensure daemon、stop/restart daemon、写入最小 runtime configure | thin MCP adapter / CLI / Desktop launcher |
| Runtime service plane | runtime descriptor、service readiness、data plane、endpoint、tool registry、diagnostics | daemon / cloud runtime gateway |

bootstrap 层只允许管理 daemon 生命周期，不执行业务工具，不拥有 Project Service、Editing Service、Media Pipeline 或 Data Service 的业务状态。

Daemon 是本地运行时的唯一 owner。它至少拥有：

- `movscript.local-node.control`
- `movscript.local-node.gateway`
- `movscript.project.service`
- `movscript.timeline.compile.service`
- `movscript.editing.service`
- Remotion backend runtime/adapter
- HyperFrames backend runtime/adapter
- External NLE adapter
- `movscript.canvas.service`
- `movscript.local-surface.host`
- `movscript.media.pipeline`
- 本地数据面模式下的 `movscript.data.service`
- MCP tool registry 和 MCP tool executor

数据面可以是三种：

| 数据面 | Data Service | 本地 daemon 仍应启动 |
| --- | --- | --- |
| `local` | 本地 sqlite Data Service | Project / Timeline / Backend / Canvas / Surface / Media |
| `cloud` | 云 Data Service | Project / Timeline / Backend / Canvas / Surface / Media |
| `external` | 外部 Data Service URL | Project / Timeline / Backend / Canvas / Surface / Media |

Desktop 不再被视为业务 sidecar owner。Desktop 是 GUI、focus、native bridge 和 surface client。Agent Plugin、CLI 和 Desktop 都应该通过 MovScript Home 中的 runtime records 发现同一个 daemon。

Runtime 类目的最小能力：

- daemon discovery: 找到 MovScript Home、runtime records、已有 daemon endpoint。
- daemon ensure/start: 没有 daemon 时启动；已有 daemon 时返回现有 endpoint。
- daemon status: 返回 daemon PID/endpoint/data plane/service readiness/MCP endpoint。
- daemon configure: 切换 local/cloud/external data plane，写入 runtime endpoints 和本地配置。
- daemon stop/restart: 明确用户意图下停止或重启本地 daemon。
- runtime preflight: 检查 sqlite、端口、Data Service、Project Service、Editing Service、Surface Host、Media Pipeline、provider route/key、FFmpeg 等缺口。
- runtime descriptor: 告诉 Agent 该连哪个 MCP endpoint、哪些服务 ready、哪些能力 degraded。

## MCP 收敛目标

### 当前形态

当前实现中，`movscript.local-node.gateway` 已经暴露 canonical HTTP MCP endpoint：`POST /v1/mcp`、`GET /v1/mcp/health`，并保留迁移期兼容 `POST /mcp`。`movscript.mcp.host` / `movscript mcp stdio` 是 provider-facing stdio 入口：当 MovScript Home 或 `MOVSCRIPT_DAEMON_MCP_ENDPOINT` 能发现 daemon MCP endpoint 时，stdio host 优先把业务 `tools/list`、`tools/call`、`resources/list`、`resources/read` 转发给 daemon；daemon 不可用时只暴露 runtime bootstrap/control fallback。

这意味着：

- daemon 已经拥有业务服务生命周期，并已在本机 gateway 暴露 canonical `/v1/mcp` 和 `/v1/mcp/health`。
- stdio/http MCP host 在 daemon ready 后已经降级为 bridge/proxy；daemon 未 ready 时只保留 runtime bootstrap fallback，不再把稳定业务工具作为 fallback 执行面。
- MCP tool registry/executor 已上移到 `packages/local-daemon/src/mcp.ts`；daemon `/v1/mcp` 直接执行 daemon-owned MCP executor，stdio/http host 只做 provider-facing 协议适配和 bootstrap fallback。
- `runtime_daemon_*` 是 canonical daemon 控制工具族，`runtime_local_daemon_*` 和 `runtime_local_node_*` 只作为兼容别名。

### 目标形态

最终只保留一个 MovScript MCP 能力面：

```text
provider stdio MCP
  -> bridge/proxy
  -> daemon MCP endpoint
      -> daemon tool registry
      -> daemon tool executor
      -> CLI command runner for system/admin tools
      -> daemon gateway/service clients
```

目标规则：

1. `tools/list` 从 daemon 读取工具清单。
2. `tools/call` 转发给 daemon 执行。
3. stdio host 可以保留最小 runtime bootstrap 工具，例如 daemon `ensure/start/status/restart/stop/configure`。这是为了启动 daemon 的例外，不是业务执行权。
4. 所有 project/domain/generation/resource/editing/timeline 工具都由 daemon 执行。
5. MCP tool 不能依赖 provider session cwd、Desktop window 或 stdio 进程内存来推断项目；项目级调用必须显式传 `projectId` 或 Project Service 可解析的 locator。
6. MCP 失败诊断必须指出缺哪个 owner 或服务：daemon、Data Service、Project Service、Editing Service、Surface Host、Media Pipeline、provider key、FFmpeg 等。
7. 外部或云 runtime 可以暴露同一套 daemon gateway contract；Agent 侧仍只看见一个 MovScript MCP endpoint。
8. `system_*` 和第一批 `admin_*` 工具必须映射到 CLI command runner；CLI 不可用时，MCP 不应直接绕过 CLI 成功。

建议 daemon gateway 增加稳定端点：

```text
GET  /v1/runtime/status
GET  /v1/runtime/descriptor
POST /v1/runtime/configure
POST /v1/mcp
GET  /v1/mcp/health
```

`/mcp` 可以作为兼容路径保留，但文档和 runtime descriptor 应以 `/v1/mcp` 为 canonical endpoint。

## MCP 命名边界

### Runtime

`runtime_*` 和 `movscript_runtime_status` 用于运行时发现、配置和 daemon 控制。Runtime 是顶层独立工具族，不归入 `system_*`。

建议 canonical 工具族：

- `runtime_daemon_discover`
- `runtime_daemon_ensure`
- `runtime_daemon_start`
- `runtime_daemon_status`
- `runtime_daemon_stop`
- `runtime_daemon_restart`
- `runtime_daemon_configure`
- `runtime_descriptor_get`
- `runtime_preflight_check`

其中 `runtime_daemon_ensure` 是 Agent 默认入口：如果 daemon 未启动就启动，如果已经启动就返回现有 endpoint 和 readiness。`runtime_daemon_start` 是显式启动动作，失败时必须返回具体 blocker。

当前已有：

- `movscript_runtime_status`
- `movscript_runtime_configure`
- `runtime_daemon_discover`
- `runtime_daemon_ensure`
- `runtime_daemon_start`
- `runtime_daemon_status`
- `runtime_daemon_stop`
- `runtime_daemon_restart`
- `runtime_daemon_configure`
- `runtime_descriptor_get`
- `runtime_preflight_check`

兼容别名：

- `runtime_local_daemon_ensure`
- `runtime_local_daemon_start`
- `runtime_local_daemon_status`
- `runtime_local_daemon_stop`
- `runtime_local_daemon_restart`
- `runtime_local_node_status`
- `runtime_local_node_stop`
- `runtime_local_node_restart`

兼容别名应继续工作，但新文档、Skill grants 和 UI 文案都应使用 `daemon`。

Runtime 工具边界：

1. `runtime_daemon_ensure/start` 可以由 thin adapter 执行，因为 daemon 未启动时 daemon MCP endpoint 还不存在。
2. daemon 一旦 ready，`tools/list` 和业务 `tools/call` 应切到 daemon MCP endpoint。
3. `runtime_daemon_stop/restart/configure` 需要明确用户意图；普通创作 Skill 不应静默停止或重配 daemon。
4. runtime 工具只返回 runtime/config/service 诊断，不隐式打开项目、不生成资源、不修改 admin provider/model/route 配置。

### System

`system_*` 是 Agent 面向系统基础能力的稳定别名，避免把内部包名暴露给高层 Skill。

包括：

- `system_model_list`
- `system_project_create/init/open/fetch`
- `system_resource_*`
- `system_external_resource_*`
- `system_shot_*`
- `system_artifact_*`

原则：

1. `system_*` 不写项目语义 source，除 project bootstrap 和资源登记外不制造业务选择。
2. 资源工具产出 RawResource 或 artifact，不自动写 candidate/selection。
3. 生成模型能力查询和资源管理是系统能力，不是 project/domain 语义。
4. `system_*` 不承载 UI focus/session selection。当前焦点属于 context/session，不属于系统基础能力。

### Context / Focus

`system_focus_get` 已删除，不再作为兼容 alias 保留。

当前实现里，`tools/list` 不再包含 `system_focus_get` 或 `movscript_focus_get`，旧调用返回 unknown tool / tool not found。UI/session hint 的稳定入口是 `context_current_get`。

目标规则：

1. 新 Skill grants 不再授予 `system_focus_get`。
2. `system_focus_get` 从 `tools/list`、router dispatch、Skill grants、README 和测试预期中直接删除；旧调用应返回 unknown tool / tool not found。
3. 如果 Agent 需要 UI 当前上下文，应通过 daemon context/session 能力读取，例如 `context_current_get`，而不是 `system_*`。
4. Project/domain/generation/editing 工具不从 focus 隐式推断项目；必须显式传 `projectId`、`project_id`、project locator 或由 Project Service 明确解析。
5. Desktop 可以写入 context/session，但 Desktop 写入的 focus 只是 UI hint，不是业务 source of truth。

迁移状态：

- 已落地：`packages/core/src/mcp/node/server/toolRegistry.ts` 不再生成 `system_focus_get` alias，`system_focus_get` 不再出现在 `tools/list`。
- 已落地：`packages/core/tests/mcp.test.mjs` 断言 `system_focus_get` 和 `movscript_focus_get` 不在 tool list，旧调用返回 unknown tool。
- 已落地：创作 Skill 已改成显式解析 project locator，不从 UI focus 推断项目。
- 已落地：新增 `context_current_get` 作为新的 read-only UI/session hint 工具，返回 route、selected project、production、user 和 selection；写操作仍必须显式传 project locator。
- 已落地：`context_current_get` 已进入 `packages/cli-commands` 的 `contextCommandSpecs`，可通过 `movscript context current get --json` 独立复现；daemon MCP executor 调用同一 runner 并返回 `contract` / `debug.cli_argv`，不再依赖 legacy direct-core fallback。
- 已落地：删除 `packages/core/src/mcp/tools/focus/definitions.ts` 和 `packages/core/src/mcp/node/tools/focus/actions.ts` 的 `movscript_focus_get` 工具本体，不再保留迁移期 alias。
- 已落地：agent chat / Desktop 展示测试中的 context fixture 已迁到 `context_current_get`。
- 已落地：`packages/mcp-host/src/http.ts`、`packages/mcp-host/src/index.ts`、`apps/desktop/electron/ipc/mcpIpc.ts` 的 context snapshot 写入已变为 daemon-first：Desktop 仍调用 `@movscript/mcp-host` 的兼容 wrapper，但 wrapper 会先 POST daemon `/v1/context/sessions`，再把 snapshot 镜像到本地内存用于兼容诊断；daemon context/session 是事实入口。
- `apps/plugin/bin/*`、`plugins/movscript/bin/*`、`apps/desktop/out/*`: 由构建流程重新生成，不手改 bundle。

### Generation

`generation_*` 负责模型能力、请求准备、任务提交、任务查询和结果登记。

它不直接等价于“项目采纳”。生成成功只是 generated option，是否进入稳定项目状态必须通过 candidate/selection 决策。

### Domain / Project

`domain_*` 是项目 source、read-model、候选、选择和影响复查的内部工具族。

目标边界：

1. Project Service 是 source/read-model/interpreter 的权威入口。
2. Data Service 是 candidate/decision/job/resource metadata 的权威入口。
3. MCP 工具优先调用 Project Service/Data Service API，不直接写 `.interpret/**` 或 runtime cache。
4. `domain_inspect` 是诊断，`domain_interpret` 是验证和派生 artifact refresh，不是发布、审批或用户确认。
5. `candidate`、`selection`、`adoption` 三个概念必须严格区分。

### Backend Execution

后端执行能力不再是一个固定的“系统剪辑能力”。它是 CompileManifest 之后由 Agent 或系统按场景选择的执行路径。

`editing_*` 只代表其中一个 backend：track-based / FFmpeg / local NLE-lite 路径，负责 `MediaEditingProject`、轨道/clip 操作、导出和 Media Pipeline 任务。未来还应允许 Remotion、HyperFrames、External NLE 等并列 backend。

目标边界：

1. Agent 先通过 Timeline/Compile 层得到 `CompileManifest`，再根据能力、用户意图和输出目标选择 backend。
2. Editing Service 只拥有 `MediaEditingProject` 和 track-based timeline mutation。
3. Remotion/HyperFrames/External NLE 后端应拥有各自的 project artifact，不复用 `MediaEditingProject` 作为内部模型。
4. Media Pipeline 拥有 render/transcode/HLS/reframe 等执行任务，或作为不同 backend 的统一 render/result registry。
5. `editing_export_create_candidate` 和未来各 backend 的 candidate 写回都是显式动作；普通 render/export 不自动成为项目稳定选择。
6. 后端执行层不回写 Production 语义 source，只能通过显式 candidate/decision 进入项目稳定状态。

迁移状态：

- 已落地：`editing_runtime_capabilities_get` 进入 `packages/cli-commands` 的 `editingCommandSpecs`，可通过 `movscript editing runtime capabilities get --json` 独立诊断 backend/mediaPipeline runtime 能力。
- 已落地：`editing_timeline_validate` 进入同一 command manifest，CLI 可通过 `movscript editing timeline validate --editing-project '<json>' --json` 调 Editing Service 校验 MediaEditingProject；daemon MCP executor 调用同一 runner 并返回 `contract` / `debug.cli_argv`。
- 已落地：`editing_timeline_apply_commands`、`editing_timeline_add_track`、`editing_timeline_remove_track`、`editing_timeline_add_clip`、`editing_timeline_update_clip`、`editing_timeline_split_clip`、`editing_timeline_move_clip`、`editing_timeline_delete_clip` 已进入同一 command manifest，CLI 可独立完成 MediaEditingProject timeline mutation；这些命令只修改 editing project，不触发 render/export/candidate。
- 已落地：`editing_task_get`、`editing_task_cancel`、`editing_task_logs_get` 已进入同一 command manifest，CLI 可通过 Editing Service 路由查询/取消 Media Pipeline task 和读取日志；这些命令不做 export/import，也不写 candidate。
- 已落地：`editing_video_compose`、`editing_task_render_create`、`editing_task_hls_create`、`editing_task_transcode_create`、`editing_task_reframe_create` 已进入同一 command manifest，CLI 可通过 Editing Service 规范化 task request，再交给 Media Pipeline 创建执行任务；这些命令只创建 render/transcode/HLS/reframe task，不做 export/import，也不写 candidate。
- 已落地：`editing_project_create`、`editing_project_create_from_edit_plan`、`editing_project_get`、`editing_project_save`、`editing_project_update_settings`、`editing_project_add_asset`、`editing_project_remove_asset` 已进入同一 command manifest，CLI 可独立完成 MediaEditingProject 基础生命周期和 asset registry 管理。
- 已落地：`editing_project_create_from_edit_decisions` 进入同一 command manifest，CLI 可通过 `movscript editing project create-from-edit-decisions --edit-decisions '<json>' --asset-manifest '<json>' --json` 创建并保存 `MediaEditingProject`；该入口只生成 editing project 数据，不触发 render/export，也不创建或采纳 candidate。
- 未完成：export import/save/publish 和 explicit candidate write 仍需逐步 CLI 化，并且必须继续保持“render/export 不自动采纳”的 gate。

### Timeline / Compile

Timeline 编译层应成为下一阶段新增的高级能力层。它带来的核心能力是：把 MovScript 的影视语义和已选择素材先编译为统一的 timeline intent，再让 Agent 选择合适后端执行，而不是提前把全系统绑定到 track-based editing。

第一批已引入独立 no-persist 工具族：

- `timeline_assembly_get`
- `timeline_assembly_validate`
- `timeline_assembly_compile`
- `timeline_compile_manifest_create`
- `timeline_backend_project_create`
- `timeline_backend_capability_list`
- `timeline_backend_select`
- `timeline_backend_conformance_report`

它的职责是：

```text
Production / SceneMoment / ExpressionUnit
  -> ContentUnit / Selection / RawResource
  -> TimelineAssembly
  -> CompileManifest
      -> MediaEditingProject            # track-based / FFmpeg / local NLE-lite
      -> RemotionCompositionProject      # React/frame-based composition
      -> HyperFramesCompositionProject   # HTML/GSAP/timed composition
      -> ExternalNleProject              # XML/EDL/OTIO/FCPXML 等外部剪辑器
  -> MediaPipeline
  -> Render Result
```

后端选择原则：

1. `TimelineAssembly` 是上层创作意图，描述素材、节奏、层级、时序、转场、字幕、音频和审核点。
2. `CompileManifest` 是可执行计划，描述所需 backend 能力、输入资源、输出格式、约束和降级风险。
3. `MediaEditingProject` 只是 track-based / FFmpeg / local NLE-lite backend。
4. `RemotionCompositionProject` 适合 React/frame-based composition、程序化画面、数据驱动字幕和复杂 frame control。
5. `HyperFramesCompositionProject` 适合 HTML/GSAP/timed composition、网页式动画、字幕高亮、动态排版和轻量 motion graphics。
6. `ExternalNleProject` 适合交给 Premiere/FCP/DaVinci 等外部剪辑器，输出 XML/EDL/OTIO/FCPXML 等交换格式。
7. 如果 backend 不支持某个能力，必须输出 conformance report 和 blocker/degradation，不允许静默改写 TimelineAssembly。
8. Media Pipeline 是执行和结果管理层，可以渲染本地后端，也可以接收 Remotion/HyperFrames/External NLE 的 render/import 结果。

这层不应该把 `MediaEditingProject` 提升为全系统唯一模型。`MediaEditingProject` 只是其中一个 agent 可选择的 execution path。

### Admin / System Management

系统管理能力应拆为 admin-only MCP/Skill。它不只是“系统生成模型配置”，还包括 provider 账号、模型 catalog、route binding、model gateway key、生成工具服务器、资源公网访问 profile 和隧道/对象中转配置。

第一批已落地 MCP 工具族：

- Provider / credential:
  - `admin_provider_template_list`
  - `admin_provider_list`
  - `admin_provider_create`
  - `admin_provider_credential_create`
  - `admin_provider_credential_update`
  - `admin_provider_credential_set_primary`
  - `admin_provider_asset_library_get`
  - `admin_provider_asset_library_update`
- Model catalog:
  - `admin_model_catalog_template_list`
  - `admin_model_import_preview`
  - `admin_model_import_apply`
  - `admin_model_catalog_list`
  - `admin_model_catalog_create`
  - `admin_model_catalog_update`
  - `admin_model_catalog_delete`
- Route binding:
  - `admin_model_route_diagnose`
  - `admin_model_route_binding_create`
  - `admin_model_route_binding_update`
  - `admin_model_route_binding_delete`
- Model gateway:
  - `admin_model_gateway_key_list`
  - `admin_model_gateway_key_create`
  - `admin_model_gateway_key_update`
  - `admin_model_gateway_key_delete`
- Generation tool server:
  - `admin_generation_tools_settings_get`
  - `admin_generation_tools_settings_update`
- Resource access / public tunnel settings:
  - `admin_resource_access_settings_get`
  - `admin_resource_access_settings_update`
  - `admin_public_tunnel_config_get`
  - `admin_public_tunnel_config_update`
  - `admin_resource_access_resolve_test`
  - `admin_resource_access_check_test`

第一批工具是 daemon/MCP-host 上的 fixed endpoint wrapper，不是任意 admin HTTP proxy。写操作透传现有 backend payload，让后端继续负责权限、审计、secret masking 和校验。

后续可以继续细化但暂未落地的工具：

- `admin_provider_update`
- `admin_provider_connection_test`
- `admin_generation_tool_call_test`
- `admin_resource_access_profile_list`
- `admin_resource_access_profile_upsert`
- `admin_resource_access_profile_delete`
- `admin_resource_access_profile_test`
- `admin_resource_access_route_diagnose`

暂不纳入当前 admin MCP 目标：

- Object relay / cloud file config:
  - `admin_cloud_file_config_list`
  - `admin_cloud_file_config_create`
  - `admin_cloud_file_config_update`
  - `admin_cloud_file_config_test`
  - `admin_cloud_file_config_delete`
- Policy / usage:
  - `admin_usage_policy_get`
  - `admin_usage_policy_update`

这两组当前还没有进入实际使用路径，先不作为第一批 MCP 能力设计和 Skill grants 目标。后续只有当 object relay/cloud file config 或 usage policy 成为明确产品流程时，再提升为 admin 工具族。

原则：

1. 普通创作 Skill 不授予 admin 工具。
2. Admin 工具必须经过明确的用户意图和权限检查。
3. provider key、计费策略、路由策略不应通过 generation/domain/editing Skill 间接修改。
4. Admin MCP 写操作必须保留后端已有的审计、secret masking 和权限检查语义。
5. 公网隧道配置属于 Resource Access，不属于 Provider 配置。Provider 只管理账号、base URL、credential、provider 私有能力和连接测试。
6. route 只声明媒体传输需求，例如 `public_url`；Resource Access Resolver 负责把 RawResource 转成 public tunnel URL、public backend URL、object relay URL、provider file id 或 provider asset URI。
7. Agent 可以读取 sanitized 诊断，但不能看到原始 API key、AK/SK、signing secret、私有文件路径或完整临时签名 URL。

现有后端对应关系：

- `/api/v1/admin/providers`、`/api/v1/admin/providers/:providerID/credentials/*`: provider 和 credential。
- `/api/v1/admin/model-catalog`、`/api/v1/admin/model-catalog/:id/route-bindings/*`: model catalog 和 route binding。
- `/api/v1/admin/model-routes/diagnose`: route 诊断。
- `/api/v1/model-gateway/api-keys`: model gateway key，当前要求 `super_admin`。
- `/api/v1/admin/settings/generation-tools`: 生成工具服务器配置。
- `/api/v1/admin/settings/resource-access`: ResourceAccessProfile / public tunnel / public backend / object relay 配置。
- `/api/v1/resource-access/resolve`、`/api/v1/resource-access/check`: 运行时资源公网访问解析和外部可达性测试。
- `/api/v1/admin/cloud-file-configs`: object relay / cloud file config，当前不纳入第一批 admin MCP。

第一批落地顺序：

1. Read/diagnose first: provider list、model catalog list、route list/diagnose、generation tool settings get、ResourceAccessProfile list、resource-access check。
2. Safe test calls: provider connection test、route diagnose、generation tool call test、resource access resolve/check test。测试返回 sanitized diagnostics，不返回 secret、私有路径或完整临时签名 URL。
3. Admin writes: provider credential upsert、model catalog/route binding CRUD、gateway key CRUD、ResourceAccessProfile upsert。所有写操作只代理到 Data Service/Admin Service，不在 daemon MCP 内另建配置存储。
4. Public tunnel: 第一阶段只管理 ResourceAccessProfile 中的 `public_tunnel`/`public_backend` 配置和 health check；如果未来由 daemon 启停 ngrok/Cloudflare Tunnel 等进程，应作为独立 daemon tunnel controller 暴露 `runtime_tunnel_*` 诊断/控制，并由 admin resource-access 工具绑定到 profile。

## Skill 总纲

每个 Skill 不应该只说明“可以调用哪些工具”。它还必须说明自己处在完整制作流程的哪一步、依赖哪些系统、如何配置这些系统、哪些状态是卡点、哪些动作必须交给人工审核。

### 制作生产步骤

MovScript 的标准生产路径应被 Skill 统一描述为四步：

```text
规划内容
  -> 规划 timeline
  -> 生成
  -> 导出
```

Runtime readiness 是这四步之前的前置条件，不算创作步骤本身。Agent 在进入任一步之前都应先确认 daemon/runtime ready，并能报告缺哪个服务。

| 步骤 | 目标 | 主要 owner | 主要产物 | 相关 Skill/MCP |
| --- | --- | --- | --- | --- |
| 0. Runtime ready | daemon 已启动，Data/Project/Editing/Media 能力可诊断 | Runtime bootstrap + daemon | runtime descriptor、service readiness、MCP endpoint | `runtime`, `runtime_daemon_ensure/status` |
| 1. 规划内容 | 把用户意图变成 project source、production、scene moment、expression unit、content unit、必要的 asset/storyboard/keyframe | Project Service + Data Service | source edits、content units、dependency graph、inspect/interpret artifacts | `planning`, `domain_*` |
| 2. 规划 timeline | 把已选择的内容单元和素材组织成剪辑/合成意图、顺序、节奏、层级、后端能力需求 | Project Service + future Timeline Service | TimelineAssembly、CompileManifest、backend selection、preview timeline | `timeline_*`, future `compile_*`, future `domain_read_*_timeline` |
| 3. 生成 | 调用模型生成图片、视频、音频、字幕等 RawResource，并写入候选 | Data Service + model gateway + Resource Access + Project Service | generation jobs、RawResources、content-unit candidates | `generation_*`, `system_resource_*`, `domain_*candidate*` |
| 4. 导出 | 由已选择 backend 执行 render/export，生成 MP4/HLS/local file/RawResource，可选写回候选 | selected backend + Media Pipeline + Artifact/Resource Service | render result、HLS stream、export artifact、optional content candidate | `editing_*`, future `remotion_*`, future `hyperframes_*`, future `external_nle_*`, `system_artifact_*`, `domain_*candidate*` |

这四步之间的核心边界：

1. 规划内容产生“要做什么”和“依赖什么”，不等于已经生成。
2. 规划 timeline 产生“如何组装”和“选择哪个 backend”，不等于已经 render。
3. 生成产生 RawResource 和 candidate，不等于已采纳。
4. 导出产生 artifact，不等于已发布或已成为稳定项目选择。

### 系统架构与配置

Skill 必须能向 Agent 解释当前调用背后的系统分工，而不是把所有事情都说成一个 MCP 工具。

| 系统 | 功能 | 主要配置入口 | Skill 应说明 |
| --- | --- | --- | --- |
| Runtime / Daemon | 启动本地 runtime，提供 gateway、服务发现、MCP endpoint、readiness 诊断 | `runtime_daemon_ensure/configure/status`、MovScript Home、data plane config | daemon 未启动时先启动；服务缺失时报告具体 owner |
| MCP Adapter | stdio/http 协议适配、daemon bootstrap fallback | plugin manifest、stdio/http bridge config | 只做协议和 bootstrap，不拥有业务状态 |
| Data Service | RawResource、job、candidate、decision、admin config、model gateway 数据 | Data Service config、local/cloud/external data plane | 资源、候选、选择和 admin 配置的 source of truth |
| Admin Service / Admin Surface | provider、credential、model catalog、route、gateway key、generation tools、ResourceAccessProfile | admin MCP、Admin UI、`/api/v1/admin/*` | 普通创作 Skill 不能写 admin config |
| Project Service | project source、read-model、inspect、interpret、regeneration plan | project locator、project standards、source APIs | domain/project 状态必须显式传 project locator |
| Generation / Model Gateway | 模型发现、prompt 编译、任务提交、任务查询、provider adapter | provider credential、model catalog、route binding、gateway key | 生成失败要区分模型、route、credential、resource access、prompt blocker |
| Resource Management | RawResource 上传、读取、变换、外部资源导入、shot library | resource storage、ResourceAccessProfile | RawResource 是资源体，不是候选选择 |
| Resource Access | public tunnel/public backend/object relay/provider file/provider asset URI 解析 | `admin_resource_access_*`、`/resource-access/check` | 公网隧道属于资源访问，不属于 Provider |
| Timeline / Compile | 把 production/content-unit/selection 编译为 TimelineAssembly、CompileManifest 和 backend selection | timeline config、backend capability matrix | 需要输出 conformance report，不能静默降级 |
| Editing Backend | MediaEditingProject、轨道、clip、timeline mutation、编辑项目保存 | editing project settings、runtime capabilities | 只是 track-based backend，不是全系统 timeline canonical model |
| Remotion Backend | React/frame-based composition project、frame render、程序化合成 | Remotion runtime、Node/browser/render config | 适合 frame 精确控制和 React 组件化画面 |
| HyperFrames Backend | HTML/GSAP/timed composition project、网页动画式合成 | HyperFrames runtime、browser/render config | 适合 timed HTML/GSAP 动画、字幕高亮和动态图形 |
| External NLE Backend | XML/EDL/OTIO/FCPXML 等外部剪辑器交换工程 | backend export preset、外部软件兼容矩阵 | 适合交给专业剪辑器继续人工剪辑 |
| Media Pipeline | render/transcode/HLS/reframe、FFmpeg/task logs、render result registry | FFmpeg、media worker、output settings | 渲染缺口是 backend/media pipeline 缺口，不是内容规划失败 |
| Surface Host / Desktop / Browser Review | prompt、candidate、preview、impact、project status 等人工审核界面 | daemon surface endpoint、Desktop/browser URL | URL handoff 不是已审核，用户动作或 decision tool 才是审核完成 |
| Skill Package | Agent 工作流、工具授权、用户确认边界 | plugin skill files | Skill 负责解释流程和边界，不保存业务状态 |

系统配置也应按层分开：

1. Runtime 配置：daemon、data plane、endpoint、local/cloud/external 模式。
2. Admin 配置：provider、credential、model catalog、route binding、gateway key、generation tool server、ResourceAccessProfile。
3. Project 配置：project standards、aspect ratio、prompt rules、negative rules、style references、production/source 结构。
4. Resource 配置：storage、resource access profile、public tunnel/public backend/object relay、provider file/provider asset URI 策略。
5. Backend/Media 配置：backend capability matrix、canvas、fps、tracks/layers/frame model、render output、HLS variants、FFmpeg/browser/media worker capability。

### 卡点与人工审核

Skill 应把“卡住”分成三类，而不是笼统地说失败：

| 类型 | 含义 | 处理方式 |
| --- | --- | --- |
| Hard blocker | 缺少必要系统、配置或稳定依赖，继续会产生错误或不可追踪状态 | 停止当前步骤，报告缺口和 owner |
| Review gate | 已有候选、预览、影响或计划，需要人工选择/确认 | 返回审核入口，等待用户 `采纳`/`放弃`/`待定` 或确认 |
| Unstable draft path | 用户明确要跳过稳定依赖，允许生成草稿 | 明确标注 unstable，不写稳定 selection，不让它自动成为下游依赖 |

四步制作流程的典型卡点和人工审核点：

| 步骤 | 典型卡点 | 必要人工审核 | 审核方式 |
| --- | --- | --- | --- |
| 规划内容 | project locator 缺失、production 粒度不清、角色/场景/资产连续性缺失、`domain_inspect` blocker | 结构方案、关键设定、storyboard/keyframe/asset 是否进入稳定依赖 | planning/review surface URL、`domain_inspect` 摘要、用户明确确认 |
| 规划 timeline | 上游素材未选择、镜头顺序/节奏不清、backend capability 不匹配、CompileManifest validate 失败 | preview timeline、backend selection、CompileManifest、conformance report | preview timeline URL、backend selection report、timeline validation report、用户确认可进入 render |
| 生成 | provider/model/route 未配置、credential 缺失、public URL 不可用、prompt compile blocker、上游 asset/storyboard/keyframe 未采纳、job 失败 | 生成候选是否采纳/放弃/待定，是否接受不稳定草稿 | candidate review URL、candidate decision card、`domain_decide_content_unit_candidate` |
| 导出 | selected backend runtime 缺失、Media Pipeline/FFmpeg/browser renderer 缺失、timeline invalid、render task failed、HLS publish/import 失败、导出物尚未写回候选 | 导出预览是否通过，是否写入 candidate，是否采纳为最终版本 | export/preview URL、本地导出路径、backend-specific export create candidate、candidate decision |

人工审核的规则：

1. 任何 `surface.kind: "browser_url"` 只是审核入口，不是审核完成。
2. 只有用户在页面完成动作，或 Agent 在明确授权下调用 decision/selection 工具，才算审核完成。
3. 生成成功、render 成功、artifact upload 成功都不等于采纳。
4. `adopt` 才是稳定选择；`reject` 和 `defer` 不能解锁稳定下游生成。
5. Affected/stale 不等于必须重生成；用户可以选择 keep、relink、re-prompt、regenerate、re-shoot、deprecate 或 accept-stale。
6. 如果缺少人工选择，Skill 必须说明“现在停在哪个 gate”，并给出下一步审核入口或需要用户确认的具体问题。

### Skill 文档模板

每个 `SKILL.md` 最终都应包含以下固定内容：

1. 所属制作步骤：规划内容、规划 timeline、生成、导出，或 runtime/admin/review 横切能力。
2. 依赖系统：哪些服务必须 ready，哪些配置必须存在。
3. 能做什么：本 Skill 的正常工具族和产物。
4. 不能做什么：不能跨越的边界，例如生成不自动采纳、导出不自动发布、review 不自动编辑。
5. 进入条件：调用前必须读取的 context、project locator、runtime readiness、model/resource/editing capability。
6. 卡点分类：hard blocker、review gate、unstable draft path。
7. 人工审核方式：什么时候返回 browser URL、什么时候调用 candidate decision、什么时候只提出问题等待用户。
8. 输出格式：必须报告 readiness、remaining blockers、candidate/selection 状态和下一步。

## Skill 分层

现有 Skill 可以保留，但目标语义应更清晰：

| Skill | 层级 | 目标 |
| --- | --- | --- |
| `runtime` | 0 | daemon discover/ensure/start/stop/restart/configure、data plane、service readiness 诊断 |
| `project` | 5 | 项目定位、创建、打开、source/read-model 定位 |
| `planning` | 5 | 项目标准、结构、素材任务、scene beat 规划 |
| `domain` | 5 | source/read-model/candidate/selection/impact 的项目内部编辑 |
| `generation` | 1 + 3 + 5 | 生成 output task 的候选结果，并保护 adoption gate |
| `review` | 5 | 解释 pending changes、stale、selection validity、regeneration plan |
| `editing` | 4 | track-based `MediaEditingProject` backend、FFmpeg/local NLE-lite render/export 工作流 |
| `timeline` | 6 | TimelineAssembly / CompileManifest / backend selection / conformance |
| `workspace` | compatibility | 老 workspace 提示的兼容层，应逐步弱化 |
| `admin` | 2 | provider、模型、route、gateway key、生成工具和资源公网访问配置 |

Skill grants 应遵守：

1. 默认先授予 `movscript_runtime_status`，runtime Skill 额外授予 daemon ensure/status/restart 等 bootstrap 工具。
2. 高层 Skill 只授予完成该工作流所需的工具族。
3. Admin 工具不进入创作 Skill。
4. 兼容 alias 只为 runtime/local-node 等明确保留的旧命名服务，新 Skill 不继续扩散旧命名；`system_focus_get` 不适用此规则，直接删除。
5. Skill 文案使用业务语言，工具调用使用内部精确名。
6. 创作 Skill 不再依赖 `system_focus_get`；需要 UI hint 时使用 context/session 工具，真正写操作仍显式传 project locator。
7. `runtime_daemon_stop/restart/configure` 只在用户明确要求或修复 runtime blocker 时使用；普通 project/generation/editing workflow 默认只做 `runtime_daemon_ensure/status`。
8. 新增或修改稳定 `system_*` 工具时，必须同步定义 `movscript system ... --json` 命令；没有 CLI 对应物的 MCP-only system 工具只能标记为临时 fallback。

## 状态所有权

| 状态/对象 | Source of truth |
| --- | --- |
| runtime records / service endpoints | MovScript Home + daemon |
| daemon process lifecycle / PID / local port lock | MovScript Home + local-runtime bootstrap |
| provider/model catalog/admin config | Data Service/Admin Service |
| provider credentials / gateway API keys | Data Service/Admin Service |
| ResourceAccessProfile / public tunnel / object relay config | Data Service Admin Settings |
| RawResource / job / provider artifact provenance | Data Service |
| project source | Project workspace source files, through Project Service |
| interpreted diagnostics | Project Service derived artifacts |
| content candidate / decision metadata | Data Service candidate APIs |
| selection/adoption | Data Service decision metadata plus Project Service projection |
| MediaEditingProject | Editing Service |
| RemotionCompositionProject | Remotion backend |
| HyperFramesCompositionProject | HyperFrames backend |
| ExternalNleProject / XML / EDL / OTIO / FCPXML | External NLE backend |
| render/transcode/HLS/reframe task | Media Pipeline |
| render result / export artifact | Media Pipeline + Artifact/Resource Service |
| UI action URL / review surface | Surface Host |
| Skill instructions | Plugin package |
| MCP tool registry/executor | daemon |
| UI focus / current route / selected entity hint | daemon context/session, not system tool |

## 迁移路线

### Phase 1: 冻结命名和文档

- 把 `daemon` 作为正式术语，`local-node` 只作为实现名或兼容别名。
- 把 runtime 定义为独立 MCP/Skill 类目，并明确 daemon discover/ensure/start/status/stop/restart/configure 是最小能力。
- 把 Skill 总纲固化为模板：制作步骤、系统架构、配置入口、卡点、人工审核、输出格式。
- 更新 Skill grants，优先使用 `runtime_daemon_*`，旧 `runtime_local_daemon_*` 只作为兼容别名。
- 输出 MCP tool family 对照表和 owner 表。
- 保持旧工具名不破坏，但新文档不再推荐旧命名。
- 删除 `system_focus_get`，并列出 Skill grants、README、router、tool registry 和测试迁移清单。

### Phase 2: Daemon-owned MCP endpoint

- 在 stdio MCP host 保留最小 runtime bootstrap fallback：`runtime_daemon_ensure/start/status/stop/restart/configure`。
- 在 `movscript.local-node.gateway` 下暴露 canonical `/v1/mcp`。
  - 已落地：local daemon gateway 处理 `POST /v1/mcp` JSON-RPC、兼容 `POST /mcp`，并暴露 `GET /v1/mcp/health`。
  - 已落地：`/v1/runtime/descriptor` 显式返回 `gateway.mcpEndpoint` 和 `gateway.mcpHealthEndpoint`。
- daemon 启动时注册 MCP tool registry。
  - 已落地：daemon gateway 调用 `packages/local-daemon/src/mcp.ts` 的 `handleDaemonMCPJSONRPC` / `listDaemonMCPTools`，业务工具可经 `/v1/mcp` 调用；`packages/mcp-host` 不再拥有 tool registry/executor。
- daemon 执行 project/domain/generation/resource/timeline/backend 工具。
  - 部分落地：context、system/admin/generation/resource/artifact/shot 已通过 CLI-first command runner；timeline 第一批 no-persist 编译/backend 选择能力也已通过 CLI-first runner；domain/editing、Timeline Service 持久化和 backend 真实执行仍需继续服务化。
- stdio MCP host 改为 bridge/proxy：`tools/list`、`tools/call` 转发 daemon。
  - 已落地：stdio/http host 在 daemon ready 后优先 proxy 到 `gateway.mcpEndpoint`；daemon 未 ready 时 `tools/list` 只暴露 runtime bootstrap/control fallback，业务工具调用返回 daemon unavailable 诊断。
- stdio host 只保留 daemon bootstrap/control 的最小 fallback。

### Phase 3: CLI-first System MCP

- 新建 command manifest，定义 `command_id`、CLI argv、MCP tool name、输入/输出 schema、owner service、权限、exit code 和示例。
  - 已落地：`packages/cli-commands` 作为 runtime/context/admin/system/timeline/workspace shared command runner，CLI 和 daemon MCP executor in-process 复用同一套 spec。
  - 已落地：`packages/cli-commands` 的每个稳定 command spec 已包含 `family`、`ownerService`、`requiredRuntime`、`permissions`、`outputSchema`、`examples` 和 `stability`，命令执行结果也返回 `contract` 摘要，MCP adapter 可复用同一 output schema。
  - 已落地：`runtimeCommandSpecs` 覆盖 `movscript_runtime_status`、`runtime_daemon_*`、`runtime_descriptor_get`、`runtime_preflight_check` 及 `runtime_local_daemon_*` / `runtime_local_node_*` 兼容别名；`movscript runtime ... --json` 与顶层 `movscript daemon ... --json` 都返回统一 `movscript.command_result.v1`。
  - 已落地：core backend runtime endpoint/auth/workspace state 使用进程级 singleton，避免 CLI bundle 中 `backend/node` 与 `mcp/node` 两个入口读到不同 runtime endpoint。
- 为 runtime/system 第一批能力补 `movscript ... --json`：
  - 已落地：`movscript runtime daemon *`
  - 已落地：`movscript daemon discover/ensure/start/status/stop/restart/configure` 顶层产品入口，复用 runtime daemon command implementation。
  - 已落地：`movscript runtime descriptor get`
  - 已落地：`movscript runtime preflight check`
  - 已落地：`movscript context current get`
  - 已落地：`movscript system model list`
  - 已落地：`movscript system generation capability list`
  - 已落地：`movscript system generation prepare/submit/job get/job get-batch/result register`
  - 已落地：`movscript system project create/init/open/fetch`
  - 已落地：`movscript system artifact get-stream/upload-export/upload-hls-stream`
  - 已落地：`movscript system resource library query/open`
  - 已落地：`movscript system resource upload/upload-batch`
  - 已落地：`movscript system resource image read/annotate/transform-to-resource`
  - 已落地：`movscript system resource video extract-frames/probe/extract-frame-to-resource/extract-frames-to-resources/trim-to-resource/compose-to-resource/concat-to-resource/contact-sheet-to-resource/extract-audio-to-resource`
  - 已落地：`movscript system external-resource source list/search`
  - 已落地：`movscript system shot library query`
  - 已落地：`movscript system shot group create/get/add-shots`
  - 已落地：`movscript system video shot-cuts analyze`
- 已迁移 MCP adapter：
  - runtime bootstrap/control：`movscript_runtime_status`、`movscript_runtime_configure`、`runtime_daemon_discover/ensure/start/status/stop/restart/configure`、`runtime_descriptor_get`、`runtime_preflight_check` 及 runtime local daemon/local node 兼容名
  - context/session：`context_current_get`
  - model/capability：`system_model_list`、`generation_model_list`、`movscript_model_list`、`generation_capability_list`
  - generation：`generation_prepare`、`generation_submit`、`generation_job_get`、`generation_job_get_batch`、`generation_result_register`
  - project bootstrap：`system_project_create/init/open/fetch`、`movscript_project_create/init/open/fetch`
  - artifact：`system_artifact_get_stream`、`system_artifact_upload_export`、`system_artifact_upload_hls_stream`
  - resource library：`system_resource_library_query/open`、`movscript_resource_library_query/open`
  - resource media/upload：`system_resource_image_read/annotate/transform_to_resource`、`system_resource_video_extract_frames/probe/extract_frame_to_resource/extract_frames_to_resources/trim_to_resource/compose_to_resource/concat_to_resource/contact_sheet_to_resource/extract_audio_to_resource`、`system_resource_upload/upload_batch` 及对应 `movscript_resource_*` 兼容名
  - external resource：`system_external_resource_source_list/search`、`movscript_external_resource_source_list/search`
  - shot reference：`system_shot_library_query`、`movscript_shot_library_query`、`system_shot_group_create/get/add_shots`、`movscript_shot_group_create/get/add_shots`、`system_video_shot_cuts_analyze`、`movscript_video_shot_cuts_analyze`
- 稳定 context/system/admin/generation/editing 迁移工具不再保留 direct-core fallback；后续新增稳定工具必须先补 CLI/shared runner。
- 每个迁移工具必须提供 CLI 单测、MCP adapter 单测和 CLI/MCP parity test。
- MCP response 返回可脱敏的 `debug.cli_argv`，让用户能复制到终端复现。
- 仍存在的 legacy/direct-core fallback 只允许用于尚未纳入稳定 command manifest 的非 system/admin/generation 工具；fallback 必须在文档和测试里标记，不能成为新工具默认路径。

### Phase 4: 服务化所有工具执行

- Project/domain 工具全部经 Project Service/Data Service。
- Generation 工具全部经 Data Service model gateway/job APIs。
- Resource/media 工具全部经 Data Service/Media Pipeline。
- Backend execution 工具按选择的后端进入 Editing Service、Remotion、HyperFrames 或 External NLE adapter；最终 render/result 进入 Media Pipeline 或 Artifact/Resource Service。
  - 已落地：editing backend 第一批命令 `movscript editing runtime capabilities get --json`、`movscript editing timeline validate --json`、`movscript editing project create/get/save/update-settings/add-asset/remove-asset ... --json`、`movscript editing project create-from-edit-plan --json`、`movscript editing project create-from-edit-decisions --json`、`movscript editing timeline add-track/add-clip/update-clip/split-clip/move-clip/delete-clip/remove-track/apply-commands ... --json`、`movscript editing task get/cancel/logs get ... --json`、`movscript editing task render/hls/transcode/reframe create ... --json`、`movscript editing video compose ... --json` 已通过 shared command runner 和 daemon MCP executor；这些 project/timeline/task observe-control/task-create 命令只保存、读取、修改 MediaEditingProject，或查询/取消/创建已有 Media Pipeline task，不自动 export/import/candidate。
- 移除依赖 stdio 进程内存、cwd 或 Desktop window 的业务推断。

### Phase 5: Admin 能力隔离

- 已落地：新增 admin Skill 和第一批 admin MCP 工具族，并明确 admin 只处理系统配置/诊断，不进入普通创作流程。
- 将 provider、credential、模型 catalog、route binding、model gateway key 配置从普通 generation surface 中隔离。
- 将 ResourceAccessProfile、public tunnel、public backend、object relay 配置纳入 admin MCP，但不纳入 Provider 配置。
- 已落地：provider/credential、model catalog/import、route diagnose/binding、model gateway key、generation tools settings、resource-access settings/public tunnel config、resource-access resolve/check diagnostics 均有 `movscript admin ... --json` 和 MCP adapter。
- 普通用户生成只读取能力和 sanitized 诊断，不修改 admin config。
- Admin MCP 写操作复用后端权限、审计和 secret masking，不绕过 Data Service/Admin Service。
- 第一批 admin MCP 同步补 `movscript admin ... --json`，并让 MCP 调 command runner；暂不迁移 cloud file config 和 usage policy。

### Phase 6: Timeline 编译层和可选 backend

- 把 `TimelineAssembly + CompileManifest` 明确为 canonical edit intent IR。
- 已落地：新增第一批 no-persist `timeline_*` MCP 工具族：
  - `timeline_backend_capability_list`
  - `timeline_assembly_get`
  - `timeline_assembly_validate`
  - `timeline_compile_manifest_create`
  - `timeline_backend_select`
  - `timeline_backend_project_create`
  - `timeline_assembly_compile`
  - `timeline_backend_conformance_report`
- 已落地：backend capability/selection contract 让 Agent 可以在 `MediaEditingProject`、Remotion、HyperFrames、External NLE 之间选择。
- 已落地：`MediaEditingProject`、`RemotionCompositionProject`、`HyperFramesCompositionProject`、`ExternalNleProject` 成为同级 backend execution project；External NLE 当前返回未实现 conformance blocker，不静默 fallback。
- 已落地：每次 compile 输出 conformance report；unsupported backend 或 runtime lock mismatch 返回 blocker/degradation。
- 已落地：`movscript timeline ... --json` 通过共享 command runner 执行第一批 no-persist `timeline_*` 能力，daemon MCP executor 的 `timeline_*` 调用也走同一 runner 并返回 `debug.cli_argv`。
- 待落地：Project-backed `timeline_assembly_get`、Timeline Service、External NLE 真实 XML/EDL/OTIO/FCPXML adapter、backend project 持久化/导出 API。

### Phase 6.5: Workspace 无前端项目检查入口

- 已落地：`movscript workspace get-model/review/interpret --json` 返回统一 `movscript.command_result.v1` 包装，保留原始 workspace/interpreter 数据在 `data`，并提供 `debug.cli_argv`。
- 已落地：`workspace.get_model`、`workspace.review`、`workspace.interpret` 进入 `packages/cli-commands` shared command manifest；CLI workspace 命令和 MCP `domain_get_model` / `domain_inspect` / `domain_interpret` 均调用同一 runner。
- 已落地：workspace CLI 支持 `--server` / `--project-uid`，无前端模式下可显式绑定 daemon gateway / Project Service，并在 debug 中暴露 `project_service_endpoint`。
- 已落地：daemon MCP executor 对 `domain_get_model`、`domain_inspect`、`domain_interpret` 返回 `debug.cli_argv`，可复现为对应 `movscript workspace ... --json`。
- 已落地：CLI `workspace review` 覆盖 blocker diagnostics JSON + exit code 2；CLI/MCP `workspace interpret` 覆盖 project uid 绑定、backend ensure、Project Service interpret 调用链。

### Phase 7: 兼容清理

- 统计旧 `runtime_local_node_*`、旧 `movscript_*` 非 system alias 的使用。
- 在 Skill 和 docs 中删除旧推荐。
- 保留一段时间的 MCP alias，最终按版本迁移策略下线。
- 删除已完成 CLI 化工具的 direct-core MCP fallback。
- 按 Skill 总纲重写 `runtime/project/planning/domain/generation/review/editing/admin/timeline` 文档，删除只列工具、不解释流程边界的旧写法。
  - 已落地：`@movscript/cli` package 暴露 `movscript` bin，`movcli` 保留为历史 shim；顶层 `daemon` 已作为正式 CLI 命令族。
  - 已落地：Agent Plugin `bin/movscript` 统一承载 `mcp stdio`、`daemon run`、`daemon discover/ensure/start/status/stop/restart/configure`，`bin/movcli` 和 `bin/movscript-agent-mcp` 均转发到同一 `movscript.mjs`。
  - 已落地：插件入口不再静态导入 CLI；普通命令通过嵌入模式动态调用 `@movscript/cli`，避免 bundle 中 CLI 和插件入口重复解析同一个 argv。
  - 已落地：把 full-local `daemon run` 的持久进程 lifecycle loop 抽到 `@movscript/local-runtime` 共享 runner，插件入口复用该 runner，不再自己管理 signal、idle timeout、restart loop 和 app record 写入。
  - 已落地：新增 `@movscript/local-daemon` 作为共享 daemon service plane，承载 local-node control/gateway、Project/Editing/Canvas/Media/Surface adapters、daemon MCP HTTP endpoint、runtime descriptor/configure、static surface 和 Data Service path resolver。
  - 已落地：Agent Plugin 的 `daemon run` 与独立 CLI 的 `movscript daemon run` 均调用 `runLocalDaemonServicePlane`；plugin 入口只保留 MCP stdio session、legacy wrapper、embedded service re-entry 和 daemon lifecycle/control CLI 包装。
  - 已落地：runtime bootstrap/control 命令已纳入同一显式 command contract；`@movscript/cli` runtime 命令直接调用 `runMovScriptRuntimeCommand`，daemon MCP executor 也通过同一 runner 返回 `contract` 和 `debug.cli_argv`。
  - 已落地：MCP registry/executor 已上移到 `packages/local-daemon/src/mcp.ts`；`@movscript/local-daemon` 暴露 `./mcp` 子路径，daemon `/v1/mcp` 直接调用 `handleDaemonMCPJSONRPC` / `listDaemonMCPTools`，不再反向依赖 `@movscript/mcp-host`。
  - 已落地：`mcp-host` 已降级为 stdio/http 协议适配器：负责 daemon MCP endpoint 发现/proxy、daemon 未启动时的 runtime bootstrap tools/list fallback，以及对旧 `callMCPHostTool/listMCPHostTools/readMCPHostResource` API 的兼容委托；它不再直接调用 command runner 或 core `callTool`。
  - 下一步：逐步减少 `packages/local-daemon/src/mcp.ts` 中未纳入 command manifest 的 legacy direct-core fallback，并把同构 cloud runtime gateway 的 MCP executor 与本机 daemon MCP executor 对齐。

## 验收标准

重构完成后，应满足：

1. daemon 未启动时，Agent 可通过 runtime bootstrap 工具 `ensure/start` 启动 daemon，并拿到 daemon gateway/MCP endpoint。
2. `movscript daemon status` 返回 daemon-owned MCP endpoint、gateway、data plane、Project/Timeline/Backend/Canvas/Surface/Media readiness。
3. Codex/Agent 侧的业务 `tools/list` 来自 daemon，而不是 session stdio host 本地 registry。
4. 关闭一个 Codex session 不会关闭 Project Service、Timeline/Backend services、Media Pipeline 或 daemon MCP endpoint。
5. Plugin reinstall 或开发 cache 更新前，停止/restart daemon 能释放所有业务服务、backend runtime 和 MCP endpoint。
6. Desktop 未启动时，Agent Plugin 仍能通过 daemon 完成项目、生成、资源、timeline 编译和已安装 backend 的执行工作。
7. Cloud/external Data Service 模式下，本地 daemon 不启动 local Data Service，但仍启动 Project/Timeline/Backend/Canvas/Surface/Media。
8. 所有 project-scoped MCP 调用显式携带 project locator，不依赖 provider session cwd 隐式猜测。
9. 每个稳定 `system_*` MCP 工具都有对应 `movscript system ... --json` 命令；CLI 不可用时，MCP 不绕过 CLI command runner 直接成功。
10. 同一输入下，`movscript system ... --json` 与对应 `system_*` MCP 的核心 `data/diagnostics/surfaces/warnings` 一致；差异只允许出现在 MCP protocol wrapper 和 `debug`。
11. 每个完成 CLI 化的 MCP 响应都提供脱敏 `debug.cli_argv` 或等价复现命令。
12. admin config 不会被普通 generation/domain/backend Skill 修改。
13. Admin MCP 可以配置 provider、model catalog、route binding、model gateway key 和 ResourceAccessProfile；对应 `movscript admin ... --json` 可复现，所有响应都必须脱敏并写审计。
14. render/export 不自动写 candidate/selection，除非调用显式 candidate/decision 工具。
15. Timeline compile 遇到 backend 不支持能力时返回 blocker/conformance report，而不是静默改写意图。
16. 同一个 `TimelineAssembly` 可以根据 backend capability 生成不同的 `CompileManifest` / backend project artifact，例如 `MediaEditingProject`、`RemotionCompositionProject`、`HyperFramesCompositionProject` 或 `ExternalNleProject`。
17. `system_focus_get` 不再出现在 Skill grants、稳定 System tool list 或 router dispatch；旧调用返回 unknown tool / tool not found；稳定 UI/session hint 只能通过 `context_current_get` / `movscript context current get --json`。
18. 配置 public tunnel 或 public backend 后，MCP/CLI 可通过 admin/resource-access 诊断验证某个 RawResource 能生成外部可达 URL；RawResource 主记录不保存隧道 URL 或临时签名 URL。
19. 每个稳定 `SKILL.md` 都能说明自己属于规划内容、规划 timeline、生成、导出或 runtime/admin/review 横切能力，并列出依赖系统、配置入口、hard blockers、review gates、人工审核方式和下一步输出格式。

## 需要特别防止的漂移

- 不要让 MCP host 重新成为业务服务 owner。
- 不要让 Desktop 重新成为本地业务 sidecar 的必要条件。
- 不要把 `MediaEditingProject` 当成唯一 timeline canonical model。
- 不要把 track-based editing 重新提升成“系统剪辑能力”；它只是 CompileManifest 后的一个可选 backend。
- 不要让 backend adapter 静默改写 TimelineAssembly；能力不匹配必须进入 conformance report。
- 不要把 generated option 直接说成 selected/adopted result。
- 不要把 admin model/provider 配置混进普通创作 Skill。
- 不要把 ResourceAccessProfile 放回 Provider 配置；公网隧道是资源访问能力，不是 provider 账号能力。
- 不要把 UI focus 作为 project/domain/generation/editing 写操作的隐式路由依据。
- 不要重新引入 `system_focus_get` 或它的兼容 alias；需要 UI hint 时只能走 context/session。
- 不要把 `.interpret/**` 当成项目 source of truth。
- 不要让 Skill 退化成工具清单；Skill 必须讲清生产步骤、系统依赖、配置边界、卡点和人工审核。
- 不要新增无法通过 daemon status 诊断 owner/service 缺失的工具。

## 代码对应关系

当前实现中，相关入口主要是：

- `apps/plugin/src/agent-mcp.ts`: Agent Plugin entrypoint、daemon CLI、local daemon gateway/control。
- `packages/local-runtime/src/index.ts`: daemon ensure/probe/stop/restart 和 readiness 判断。
- `packages/cli-commands/src/index.ts`: runtime/context/admin/system/editing/timeline/workspace command manifest、shared runner、CLI/MCP contract metadata。
- `packages/local-daemon/src/mcp.ts`: daemon-owned MCP registry/executor，负责 command manifest 生成的 tool schema、CLI command runner 调用、daemon `/v1/mcp` 的本地 JSON-RPC 执行，以及尚未 CLI 化工具的 legacy direct-core fallback。
- `packages/mcp-host/src/stdio.ts`: stdio MCP host 兼容壳，负责 daemon proxy、runtime bootstrap protocol fallback 和旧 API 委托；不再拥有业务 tool registry/executor。
- `packages/mcp-host/src/http.ts`: HTTP MCP host compatibility。
- `packages/core/src/mcp/node/server/toolRegistry.ts`: 当前 core MCP tool registry。
- `packages/core/src/mcp/tools/*/definitions.ts`: tool family definitions。
- `packages/core/src/mcp/tools/focus/*` 和 `packages/core/src/mcp/node/tools/focus/*`: 当前 focus 工具和 context snapshot，应迁出 System tool family。
- `services/data-service/internal/interfaces/http/router/admin_routes_community.go`: provider、model catalog、route、settings、resource storage、cloud file config admin routes。
- `services/data-service/internal/interfaces/http/handler/admin_settings.go`: generation tools、provider assets、ResourceAccessProfile admin settings。
- `services/data-service/internal/interfaces/http/handler/ai_model_catalog.go`: model catalog 和 route binding handlers。
- `services/data-service/internal/interfaces/http/handler/provider_instances.go`: provider、credential、provider instance config/test handlers。
- `services/data-service/internal/interfaces/http/handler/model_gateway_keys.go`: model gateway API key admin handlers。
- `services/data-service/internal/interfaces/http/handler/resource_access.go`: Resource Access resolve/check/runtime serving。
- `services/*/program.manifest.ts`: daemon 可启动服务合同。
- `apps/plugin/startup.manifest.ts`: Agent Plugin startup policy。
- `plugins/movscript/skills/*/SKILL.md`: Agent skill workflow contracts。

这份文档的重构方向是把 `packages/mcp-host` 从“工具执行者”降级为“协议适配器”，把 tool registry/executor 提升到 `movscript.local-node` daemon 或同构 cloud runtime gateway。
