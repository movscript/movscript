# MovScript Agent Runtime 一体技术架构

## 目标

MovScript 需要把 Desktop App 已经验证的核心创作能力开放给 Agent 运行环境，同时支持本地 Data Service、云端 Data Service 和外部 Data Service。目标不是做一个新的 `lite` 业务分叉，也不是把 Desktop App 做成 Agent 能力的硬安装前置，而是形成一套可被 Desktop App、MovScript Agent Plugin App、Cloud App、CLI 和后续 provider 共同复用的 Agent-native 创作内核。Codex 只是首个 provider target，不是架构边界。对本机 full runtime 来说，长期 owner 是每用户唯一的 `movscript.local-node` daemon；Desktop、Agent Plugin、CLI 和 MCP 会话都 attach 到这个 daemon，而不是各自启动一套 full local 服务。

这份文档作为后续项目改造的总纲。后续实现应以这里定义的模块边界、能力分层、运行模式和目标结构为准。本次重构采用硬迁移策略：不为旧目录、旧入口、旧 service owner 或旧 auth/session 流程新增兼容层；发现旧路径依赖时直接迁移调用方。

Surface 层采用 Surface Domain + Surface Host 的拆分：Project/Admin 页面域分别在 `surface/project`、`surface/admin`，本机和云端可启动宿主分别是 `movscript.local-surface.host`、`movscript.web-surface.host`。历史 `agent-surface` 向 `project-surface` 演进的补充设计，见 `movscript-surface-runtime-supplement.zh-CN.md`。

## 设计结论

MovScript 不新增一套独立的 `movscript-lite` 业务项目。正确方向是：

```text
同一套核心能力，多种运行宿主。
```

核心能力放在 `packages/core` 及其依赖的 workspace、engine、interpreter、editing、prompt 等包中；MovScript Agent Plugin App、Desktop App 和 Cloud App 都通过同一套 core API、MCP tool registry 和 service contracts 访问这些能力。

`lite` 只表示轻量运行宿主，不表示轻量业务实现。MovScript Agent Plugin App 应启动 `movscript.mcp.host`，直接承载 core MCP，而不是转发到 Desktop-only MCP。

## 本次重构最终目标

本次重构的长期目标，是把 MovScript 从“Desktop App 内部能力 + 若干辅助入口”整理成一套可组合、可部署、可被 Agent 调用的创作 runtime。最终完成态应满足下面这些目标。

### 1. 同一套 MovScript 能力，多种应用宿主

MovScript 只保留一套核心业务语义，不做 `movscript-lite` 分叉。

长期所有入口都复用同一套 domain/source/project/candidate/selection/interpret/prompt/editing/generation 规则：

- Desktop App 是本地完整产品壳。
- Agent Plugin App 是 Agent/provider 接入壳。
- Cloud App 是 cloud deployment/ops 描述壳。
- Project Surface 是共享的项目协作和审阅 surface；Agent 只是触发和打开它的一种入口。
- Admin Web 是共享的管理控制面。

任何业务规则只能在 shared packages 或独立 service program 中实现，不能在 Desktop、Plugin、Cloud 各自复制一套。

### 2. 应用和程序概念硬化

最终代码结构必须明确区分 Application 和 Program：

- Application：安装、部署、启动和监督容器，例如 `apps/desktop`、`apps/plugin`、`apps/cloud`、`apps/cli`。
- Program/Service：可启动、可 health check、可被不同应用组合的运行单元，例如 `movscript.data.service`、`movscript.project.service`、`movscript.editing.service`、`movscript.local-surface.host`、`movscript.web-surface.host`。
- MCP Endpoint Program：Agent/MCP 会话入口，例如 `movscript.mcp.host`。它可以作为 Agent provider 启动的 stdio 进程、Desktop 启动的子进程，或云端 remote MCP 进程存在；它不是本机 full runtime 的长期 owner，也不承担服务注册中心职责。

`apps/*` 只能表达应用形态。凡是 Agent Plugin App 可以启动的服务，都不能被塞回 `apps/cloud` 当内部模块。Cloud 需要这些能力时，由 cloud deployment/orchestrator 启动独立 cloud profile service instance。

### 3. Daemon-first 本机 Runtime 所有权

本机 full runtime 的默认所有权归 per-user `movscript.local-node` daemon。

同一台电脑上可以同时存在 Desktop App、Agent Plugin App、CLI 和多个 MCP 会话，因此本机入口必须共享同一个 runtime owner：

| 入口 | 谁启动 | 第一启动目标 | 已有 daemon 时 |
| --- | --- | --- | --- |
| 用户入口 | 用户启动 Desktop App | ensure/attach `movscript.local-node` | 直接复用 daemon endpoint |
| Agent 入口 | Agent/provider 启动 Agent Plugin App | ensure/attach `movscript.local-node` | 只启动 session-scoped launcher/MCP host |
| CLI 入口 | 用户运行 `movscript daemon ...` 或兼容 `movcli` | 管理 `movscript.local-node` | status/stop/restart 作用于同一个 daemon |

Desktop App 在本机不是业务 sidecar owner。它是 GUI、窗口、project focus、desktop bridge 和增强本机能力宿主；业务执行服务由 daemon 拥有。Agent Plugin App 也不是和 Desktop 平级竞争 runtime 的应用。它接收 Agent/provider 的 stdio/MCP 请求，确保 daemon ready，再把请求路由到 daemon-owned Project/Editing/Canvas/Surface/Media 服务和选定 Data Service。

最终行为应是：

1. Desktop、Agent Plugin、CLI、MCP 会话启动后先解析 MovScript Home 并探测 `movscript.local-node.control`。
2. 如果 daemon ready，入口只 attach，不再启动 Data/Project/Editing/Canvas/Surface/Media 副本。
3. 如果 daemon 缺失且本地执行需要启动，入口通过同一套 ensure lock 启动 daemon，避免多个会话并发拉起多套服务。
4. daemon 的 data plane 由 `MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE=local|cloud|external` 或显式 CLI 参数决定。
5. data plane 为 `local` 时 daemon 启动本地 `movscript.data.service` 和 sqlite；data plane 为 `cloud` 或 `external` 时不启动本地 Data Service，但仍启动本地 Project/Editing/Canvas/Local Surface/Media 服务并连接远端或外部 Data Service。

这里不允许局部补齐。不存在“Desktop 启动了 Project Service、Plugin 再补一个 Editing Service”，也不存在“每个 Agent 会话各自启动一套 full local”的模式。

### 4. Agent Plugin Artifact 携带 Daemon 和 CLI 入口

Agent Plugin App 的长期目标不是简化版能力，而是提供 Agent/provider 接入壳和 daemon 管理入口。插件分发物应携带：

- stdio `movscript.mcp.host`
- `bin/movscript daemon start|status|stop|restart`
- 兼容 `bin/movcli`
- 兼容旧 `bin/movscript-agent-mcp local-node ...`
- daemon 内部可启动的 `movscript.local-node.control`
- daemon 内部可启动的 `movscript.project.service`
- daemon 内部可启动的 `movscript.editing.service`
- daemon 内部可启动的 `movscript.canvas.service`
- daemon 内部可启动的 `movscript.local-surface.host`
- daemon 内部可启动的 `movscript.media.pipeline`
- local data plane 下的 `movscript.data.service`

它不携带：

- Electron Desktop shell
- Desktop bridge
- Desktop timeline UI
- Desktop-only window/native state
- 第二套业务实现

`apps/cli` 可以保留为 CLI command library/source package，但用户可执行入口合并到 Agent Plugin Artifact。发布物中 `bin/movscript` 是 daemon-first 管理入口，`bin/movcli` 是兼容命令名。

`movscript.runtime.worker` 暂不作为当前必拆服务。当前由 `movscript.data.service` 内置 job orchestration 和 worker loop；未来只有在队列隔离、独立扩缩容、执行沙箱、GPU/媒体 worker 池或跨节点 drain/heartbeat 明确需要时再拆。

### 5. Cloud App 只做云部署和运维容器

Cloud App 的最终定位不是“云端大单体 runtime”，而是 cloud deployment/ops application。

它可以包含：

- cloud profile 配置
- deployment manifests
- migration/ops command
- auth/org/provider/storage 配置模板

它不能内嵌启动 Agent Plugin App 可启动的 service：

- `movscript.data.service`
- `movscript.project.service`
- `movscript.editing.service`
- `movscript.mcp.host`
- `movscript.local-surface.host`
- `movscript.media.pipeline`

云端需要这些服务时，由 Kubernetes、Docker Compose、systemd、CI deploy job 或等价平台编排启动独立 cloud profile 实例。

### 6. Project Service 成为唯一项目视图入口

`movscript.project.service` 是项目/source/candidate/interpret/read-model 的权威组合入口。

长期 Desktop、Plugin、MCP Host、Agent Surface 都不直接拼接 workspace source 和 candidate decision API，而是通过 Project Service 读取同一份 project snapshot。

Project Service 应负责：

- project discovery/open/create/import
- project uid 和 source root resolution
- domain source read/upsert/update/delete
- candidate/decision/selection view 聚合
- inspect/interpret/overview/regeneration impact
- project read model
- prompt context 构造

这样 Desktop 和 Agent 看到的是同一个项目状态，candidate selection、stale impact、prompt blocker 和 regeneration decision 只有一套来源。

### 7. Editing Service 成为唯一剪辑业务入口

`movscript.editing.service` 是 timeline/edit plan/render request 的权威入口。

长期 Desktop timeline UI、Agent Surface、MCP tools 都调用 Editing Service，不直接把 timeline 业务规则写在 Desktop UI、MCP handler 或 media pipeline 里。

Editing Service 应负责：

- timeline、track、clip、edit plan
- preview timeline
- render request 编排
- 剪辑版本和剪辑产物登记
- 与 Project Service/Data Service/Media Pipeline 的协调

`movscript.media.pipeline` 只做媒体执行能力，例如 probe、thumbnail、waveform、transcode、render、mux/demux，不拥有剪辑业务状态。

### 8. MCP Host 只做 Agent 协议和路由

`packages/mcp-host` 是 MCP host library 和 composition root，不是业务层，也不是本机服务注册中心。

长期目标：

- `movscript.mcp.host` 负责 stdio/http transport、MCP initialize、tools/list、tools/call、runtime status、capability gating、session/profile/project routing。
- MCP tool handler 通过 Project/Editing/Data Service clients 调用能力。
- `core/mcp` 保留 tool schema、tool registry 和 adapter，不直接创建 Node engine、file repository、decision store。
- Desktop、Plugin、remote MCP deployment 共用同一套 `packages/mcp-host`。

这里的“registry”只表示 MCP tool registry 和 capability registry：

- Tool registry：注册 MCP tools、schema、handler adapter。
- Capability registry：描述当前 MCP 会话可用的 Auth/Project/Data/Editing/Surface/Media 能力。
- 不提供本机 service lease、自注册、heartbeat 或 runtime owner registry。

MCP host 与服务之间的连接叫 **service wiring**，不叫 service registration：

- Application owner 或 launcher 决定启动或连接哪些服务。
- Application owner 拿到这些服务的 endpoint、auth/session、profile 和 capability probe 结果。
- Application owner 把 endpoint/client 注入 `packages/mcp-host` 的 composition。
- `packages/mcp-host` 根据注入的 clients 注册 MCP tools 和当前会话 capabilities。

Desktop 和 Agent Plugin App 不需要围绕 `movscript.mcp.host` 做互相注册。Agent Plugin App 自己的 stdio 进程就是一个 MCP host 会话；Desktop 如果要暴露 Agent/MCP 能力，也启动自己的 MCP host 子进程。两者都通过配置、Desktop runtime endpoint 或 service clients 连接 Auth/Project/Data/Editing 服务。

### 8.1 MovScript Home 是本机运行时事实目录

所有本机 Application 和 Service 都必须先解析同一个 **MovScript Home**，并把运行时痕迹写入 Home。Home 是本机应用/服务运行状态、端口、pid、session、日志和 profile 配置的 canonical 目录；它不是 project source，也不是 MCP host 的 service registry。

解析规则：

1. 显式 `MOVSCRIPT_HOME`。
2. 用户级默认目录，例如 `~/.movscript`。
3. 测试和 CI 可以用临时 Home，但必须通过显式配置传入。

Home 目录建议：

```text
$MOVSCRIPT_HOME/
  config/
    runtime.json
    profiles/
      local.json
      cloud.json
    auth-service.json
    data-service.json
    realms/
      local/auth.json
      cloud/<realm-id>/auth.json
  runtime/
    work/
      movscript.desktop/
      movscript.agent-plugin/
      movscript.auth.service/
      movscript.data.service/
      movscript.project.service/
    apps/
      movscript.desktop.json
      movscript.agent-plugin.json
    services/
      movscript.auth.service/
        <instance-id>.json
      movscript.data.service/
        <instance-id>.json
      movscript.project.service/
        <instance-id>.json
      movscript.editing.service/
        <instance-id>.json
      movscript.local-surface.host/
        <instance-id>.json
    endpoints/
      movscript.auth.service.json
      movscript.data.service.json
      movscript.project.service.json
      movscript.editing.service.json
      movscript.local-surface.host.json
    locks/
    sockets/
    ports/
  sessions/
  cache/
  tmp/
  logs/
```

运行时记录应使用稳定 schema，而不是靠端口约定或临时文本文件隐式发现：

```ts
type RuntimeStateRecord = {
  kind: 'app' | 'service' | 'mcp_endpoint'
  id: string
  serviceName?: string
  applicationId?: string
  ownerApplicationId?: string
  ownerKind: 'desktop' | 'plugin' | 'cli' | 'cloud' | 'dev'
  profile: 'local' | 'cloud' | 'desktop' | 'plugin' | 'test'
  pid?: number
  endpoint?: {
    transport: 'http' | 'ipc' | 'stdio'
    url?: string
    socketPath?: string
    port?: number
  }
  health?: {
    kind: 'http' | 'process' | 'stdio_tool'
    target: string
  }
  startedAt: string
  updatedAt: string
  logPath?: string
}
```

硬规则：

- 每个 Application 启动时必须写 `$MOVSCRIPT_HOME/runtime/apps/<applicationId>.json`。
- 每个长期 Service 启动并完成端口/IPC 绑定后，必须写 `$MOVSCRIPT_HOME/runtime/services/<serviceName>/<instanceId>.json` 和当前 endpoint 摘要。
- 每个 Application/Service 的非项目运行目录必须在 `$MOVSCRIPT_HOME/runtime/work/<id>/` 或同级约定目录下；cache、tmp、socket、log、pid、port 文件不能散落在项目 source 或随机 cwd。
- 端口可以由 App Runner 分配，也可以由 service 自己选择；但实际绑定结果必须写回 Home。
- Plugin App 启动时先读 Home，再做 health probe。只有 pid 存活且 health 通过的记录才可使用；stale record 必须忽略或清理。
- Project source 可以在任意工作区目录，项目内部 `.movscript/` 只保存项目级产物或诊断，不承担本机 runtime discovery。
- Home 目录是本机发现事实，不是授权绕过。读取 endpoint 后仍必须使用对应 session/auth token。
- `packages/mcp-host` 不写 service lease、不接受 service self-registration；它只消费 Application owner/service wiring 注入的 clients。

因此，当 Plugin App、Desktop App、CLI 和多个 Agent 会话同时存在于同一台电脑时，启动顺序是：解析 Home，读取 `movscript.local-node.control` 和 service endpoint 痕迹，验证 health；如果 daemon ready，就连接 daemon-owned runtime；如果 daemon 不可用且本地执行需要启动，通过全局 ensure lock 启动或替换 daemon，并把 daemon-owned 服务痕迹写入同一个 Home。

### 9. Agent Surface 一套实现，多处承载

Agent Surface 不应作为独立应用，也不应被 Desktop/Plugin/Cloud 各自 fork。

长期目标是 `surface/project` 提供同一套 `/agent/*` Web program：

- Desktop App 嵌入它。
- local runtime daemon 启动它。
- 本机启动，云端由 `movscript.web-surface.host` 部署它。
- Agent/MCP tool result 可以返回 surface URL。

Surface 只通过 adapters 连接 Project/Editing/Data Service、Desktop bridge 或 MCP proxy，不直接实现业务规则。

### 10. 编译产物边界清晰

最终产物必须明确区分：

- Core Library
- MCP Host Package
- Agent Plugin App
- Agent Plugin Artifact
- Auth Service Artifact
- Service Program Artifacts
- Local Runtime Sidecar Bundle
- Desktop App
- Cloud App / Cloud Deployment App
- Surface Host program
- Admin Web program

产物之间不能复制彼此 build output。Agent Plugin App 不复制 Desktop App；Desktop App 不 import plugin bundle；Cloud App 不内嵌 Agent Plugin-startable services。所有产物只通过 shared packages、service contracts、deployment manifests 和稳定协议组合。

当前社区版发布面先只对外打包两个用户安装产物：

| 用户安装产物 | Release asset | GitHub Pages 主入口 | 定位 |
| --- | --- | --- | --- |
| Agent Plugin Artifact | `movscript-agent-plugin-<version>.zip` | `curl -fsSL https://movscript.github.io/movscript/install-plugin.sh \| sh` | 安装 Agent/provider 插件、daemon 管理 CLI 和兼容 `movcli`；不安装 Desktop。daemon 只在显式命令或本地执行需要时启动。 |
| Desktop App Artifact | `movscript-desktop-<platform>-<arch>-*` | macOS 使用 `install-desktop.sh` 命令；Windows 使用 GitHub Releases `.exe` 下载 | 安装本地可视化工作台；Desktop 复用 per-user local runtime daemon。 |

GitHub Pages 必须把这两条路径作为一等入口展示，并在首屏就让用户理解它们的差别：

- “只安装 Agent 插件”：展示 `install-plugin.sh` 命令，说明它安装/注册 Agent Plugin Artifact、`movscript daemon` 和兼容 `movcli`，不安装 Desktop。
- “安装 Desktop 应用”：展示 macOS `install-desktop.sh` 命令，并提供 Windows `.exe` 和各平台 release asset 下载入口，说明 Desktop 会复用同一个 `movscript.local-node` daemon。
- 页面可以从 `release.json` 或 GitHub Releases 解析最新版本和精确 asset 链接；解析失败时引导到 GitHub Releases 手动下载。
- `install-desktop.sh` 是公开稳定的 Desktop 安装入口。`install.sh` 不再作为用户入口发布；如仍存在，只能是 release 脚本内部复用实现，并应在后续清理中移除公开引用。

Cloud App、Auth/Data/Project/Editing Service、Project Surface Host 和 Admin Web 暂不作为社区版用户直接安装产物发布；它们进入 deployment profile、未来服务包或应用内部组合。

### 11. Engine / Interpreter / Prompt 边界收窄

长期目标不是继续加厚 `packages/engine`。

目标分层是：

- `packages/language`：source schema 和 domain 类型。
- `packages/workspace`：source layout、repository、index、本地文件适配。
- `packages/interpreter`：source/workspace -> diagnostics、artifacts、read model、regeneration impact。
- `packages/prompt`：ProjectPromptContext -> backend prompt。
- `packages/engine`：收窄为稳定 facade 或 service 内部 orchestration API。
- `movscript.project.service`：真正的 project/domain/prompt 总装入口。

Prompt 长期不直接 query workspace；它吃 Project Service 提供的 prompt context。Interpreter 不 import Prompt 或 Engine。MCP/Core 不直接 import `@movscript/engine/node` 作为长期运行路径。

### 12. Runtime Discovery 和 Capability Gating 标准化

Agent Plugin App 和 MCP Host 必须能解释当前运行状态，而不是让每个 tool 抛不同错误。

长期应有：

- `movscript_runtime_status`
- `movscript_runtime_configure`
- local daemon probe
- service owner token/lock
- local/cloud profile detection
- project source detection
- Agent Surface URL resolver
- media capability probe

`runtime_status` 必须能明确返回 runtime owner：Local daemon、Cloud/external data plane、legacy Desktop diagnostic、basic/diagnostic 或 None。只要 local daemon ready，Plugin/Desktop/CLI sidecar 启动必须被禁用。

### 13. 本地和云端只切 profile，不切业务实现

local/cloud 差异应落在 profile、adapter、auth、storage、provider、deployment 上，不应落成两套 domain/project/editing/MCP 实现。

同一个 service 可以有 local profile 和 cloud profile，但语义必须一致：

- local source 可以是 Git/filesystem workspace。
- cloud source 可以是 Cloud Workspace Source API。
- candidate/resource/job 可以来自 Data Service local/cloud。
- Project Service 负责把 source 与 candidate/decision 聚合成同一份 read model。

### 14. 迁移完成标准

本次重构完成时，应满足：

- `apps/plugin` 是插件应用源码容器，`plugins/movscript` 只是分发物。
- `apps/desktop` 是 Desktop App 容器，旧 `apps/frontend` 不作为目标结构保留。
- `apps/cloud` 是 Cloud Deployment App；旧 `apps/backend` 不作为目标结构保留，服务源码归入 `services/data-service`。
- Agent Plugin App 可在无 Desktop 时通过 full local profile 启动完整 headless runtime。
- Desktop 可用时 Agent Plugin App 不启动任何同类 sidecar。
- Cloud App 不启动任何 Agent Plugin-startable service。
- Desktop、Plugin、Agent Surface、MCP Host 都通过 Project/Editing/Data Service clients 调用能力。
- Agent Surface 和 Admin Web 各自只有一套 shared Web program。
- `runtime-worker` 不作为当前必拆项；当前目标结构不定义该服务，未来只有出现明确独立进程需求时再新增 manifest 和服务实现。
- 主要边界由 `runtime-contracts`、`app-runner`、program manifests 和 `tools/runtime-registry` 校验。

## 总体架构

```text
Agent Runtime / Provider Host
  -> MovScript Agent Plugin App: apps/plugin
  -> service: movscript.mcp.host
  -> @movscript/core/mcp/node
  -> Domain / Workspace / Interpreter / Generation / Resource / Candidate
  -> Auth/Data Service local/cloud profile
  -> 本地 project source 或未来 cloud workspace source

MovScript Desktop App
  -> service: movscript.desktop.shell
  -> embedded service: movscript.local-surface.host
  -> connects service: movscript.project.service
  -> connects service: movscript.editing.service
  -> connects service: movscript.data.service
  -> optional service: movscript.mcp.host
  -> optional service: movscript.media.pipeline
  -> optional local service supervisor
```

一体化后的角色划分：

| 模块 | 职责 |
| --- | --- |
| `packages/core` | 可复用核心能力、MCP tool definitions、tool router、surface descriptor。 |
| `packages/mcp-host` | `movscript.mcp.host` 程序包和 composition root，负责 transport、runtime bootstrap、session/auth 加载、capability gating。 |
| `packages/runtime-contracts` | Application/Program/Scenario manifest contract。 |
| `packages/app-runner` | 统一 App 启动框架，负责 service graph、phase、health、shutdown order。 |
| `apps/plugin` | MovScript Agent Plugin App 容器，负责组装 agent plugin runtime，并构建 `plugins/movscript` 分发物。 |
| `plugins/movscript` | Agent plugin 分发物，包含通用 agent metadata、provider-specific manifests、`.mcp.json`、skills、assets、bin wrapper；Codex manifest 只是其中一个 provider target。 |
| `apps/desktop` | MovScript Desktop App 容器，承载 Electron shell、Desktop bridge、Agent Surface embed shell。 |
| `services/auth-service` | `movscript.auth.service` 服务源码，承接最小 principal、session、opaque key、agent/service credential 和权限声明职责。 |
| `services/data-service` | `movscript.data.service` 服务源码，承接当前 `services/data-service` 的 Go server/API/migration/job orchestration 职责。 |
| `apps/cloud` | MovScript Cloud Deployment App / cloud deployment 容器，承载云端配置、部署 manifest、ops/control wrapper；不承载后端服务源码，不内嵌启动 Agent Plugin App 也可启动的 service。 |
| `surface/project` | Project Surface 页面域包，承接 `/agent/*` legacy handoff route、Project Surface URL/browser handoff contract、可复用页面和 data adapters。 |

## 工程详细设计

本节定义代码目录定位、项目定位、切分原则、编译原则和产物原则。后续改造应先判断变更属于哪个层，再决定代码应该落在哪个目录。

### 三大工程类别

目标项目框架按三大逻辑类别组织：

```text
apps      # 应用容器：负责安装、部署、启动过程、UI/shell、profile 和 service graph
packages  # 可复用能力：负责业务语义、contracts、adapters、runner、composition、共享 UI/类型
services  # 运行单元：负责真正运行的 service/program identity，由 apps 启动，由 packages 实现或支撑
```

这三类都应成为清晰的顶层边界：

- `apps/*` 是真实顶层目录，承载应用容器，例如 Desktop App、Cloud App、CLI App。
- `packages/*` 是真实顶层目录，承载共享库、程序包和 contracts，例如 `core`、`mcp-host`、`app-runner`、`runtime-contracts`。
- `services/*` 是真实顶层目录，承载必须能独立运行的 service/program 源码、server entry、program manifest、service-local adapter 和部署无关的 runtime 实现。
- `apps/plugin` 是真实应用容器，表示 MovScript 的 agent plugin 应用形态。
- `plugins/*` 留给真实 agent plugin 分发物，例如 `plugins/movscript`。它只承载 Agent/provider 插件协议需要的 manifest、skills、assets 和构建后的 launcher。

三者的关系是：

```text
App container
  -> uses packages/app-runner
  -> reads application/startup manifests
  -> starts, supervises, or connects service graph
  -> each service entry lives in services/* or an explicit program package
  -> each service uses package contracts/adapters
```

判断一个新代码应该放在哪里：

| 问题 | 归属 |
| --- | --- |
| 这是用户安装、平台部署或产品入口吗？ | `apps/*` 应用容器 |
| 这是多个 App/Service 都要复用的业务语义、类型、adapter、runner 吗？ | `packages/*` |
| 这是一个可启动、可 health check、可记录 telemetry 的运行单元吗？ | `services/*`；必须有独立进程 entry 和 program manifest |
| 这是 Agent/provider 插件分发内容吗？ | `plugins/*`，例如 `plugins/movscript` |

### 目录定位总表

| 路径 | 定位 | 可放内容 | 不应放内容 |
| --- | --- | --- | --- |
| `packages/core` | MovScript 共享业务内核 | MCP tool definitions、tool router、domain/generation/resource/candidate action、Data/Auth Service client contracts、surface descriptor 纯函数 | Agent provider 专属启动逻辑、Desktop/Electron IPC、插件 manifest、shell wrapper |
| `packages/mcp-host` | Headless Agent MCP 程序包和 composition root | stdio/http transport、runtime discovery、local/cloud mode selection、capability gating、session/bootstrap、host-only diagnostic tools | domain 业务实现、generation 业务实现、Desktop UI 状态、插件文档和 skills |
| `packages/project` | Project Service contract/client | project discovery/open/create/import、project uid、source root resolution、workspace config contract、source/candidate/interpret 聚合接口、Project Service endpoint constants、runtime endpoint discovery、Project Service client | Desktop UI、Data Service persistence 实现、MCP transport |
| `apps/plugin` | 目标新增：MovScript Agent Plugin App 源码容器 | plugin launcher 源码、plugin build scripts、agent plugin manifest templates、provider manifest templates、skills source、assets source、bundling config | 可复用业务逻辑、长期运行状态、Data Service API 实现、最终分发缓存 |
| `plugins/movscript` | Agent plugin 分发产物 | agent metadata、provider-specific manifests、`.mcp.json`、skills、assets、bin wrapper、bundle 后的 Agent MCP runtime；Codex 适配只是一种 provider target | 可复用业务逻辑、长期运行状态、Data Service API 实现 |
| `apps/desktop` | Desktop App 容器 | Desktop shell、Electron bridge、service clients、local service supervisor、可视化工作台壳、本地预览 UI、Agent Surface embed shell | MCP 协议核心实现、Project/Editing/Data Service 权威逻辑、独立 Agent Surface 实现 |
| `apps/cloud` | Cloud Deployment App 容器 | cloud profile、deployment manifest、ops/control wrapper、service deployment manifests | Agent Plugin runtime、Desktop UI、第二套 MCP 实现、Agent Plugin App 也能启动的本地/通用 service startup、任何 service 源码 |
| `services/auth-service` | `movscript.auth.service` 服务源码 | Auth Service server entry、opaque `sk-...` access key 签发/撤销/introspection、login/session、agent/service credential、最小 principal/claims/RBAC、service manifest | Data/Project/Editing 业务 API、Desktop UI、Agent plugin manifest、Cloud Deployment App、JWT/JWKS 实现 |
| `services/data-service` | `movscript.data.service` 服务源码 | Data Service server entry、REST/API、resource/job/provider/model gateway、Cloud Source API、migrations、内置 worker loop、service manifest；通过 AuthProvider 获取 identity/claims，不签发登录态 | Cloud Deployment App、Desktop UI、Agent plugin manifest、Project/Editing/MCP/Surface 的源码实现、Auth Service 实现 |
| `services/project-service` | `movscript.project.service` 服务源码 | project/source/candidate/interpret/read-model/prompt-context 组合入口、独立 server entry、health/capability endpoint、program manifest、service adapter | Desktop UI、MCP transport、Data Service persistence 内部实现 |
| `services/editing-service` | `movscript.editing.service` 服务源码 | timeline/edit plan/preview timeline/render request 编排、`MediaEditingProject` command endpoint、media task request endpoint、独立 server entry、health/capability endpoint、program manifest、service adapter | Desktop timeline UI、media pipeline 执行细节、MCP transport、旧 API adapter |
| `services/media-pipeline` | `movscript.media.pipeline` 服务源码 | ffmpeg/probe/thumbnail/waveform/transcode/render/mux 等媒体执行入口和 capability probe | 剪辑业务状态、Desktop UI、Project Service read model |
| `surface/project` | Project Surface 页面域包 | 已落地 `/agent/*` legacy routes、browser handoff URL、surface intent/entity contract、共享 React route views、cloud/local/desktop data adapters；后续继续迁入 `/studio/*` Project Surface route shell、review/edit/monitor UI | Data Service API 实现、MCP transport、Desktop-only native code、Surface Host 启动逻辑 |
| `packages/workspace` | Source workspace 抽象 | workspace layout、source file repository、decision store adapter、project source read/write primitives | Agent runtime selection、provider 插件配置 |
| `packages/auth-client` | AuthProvider/Auth Service client contract | AuthProvider contract、Auth Service cloud/external client、login/status/logout、opaque key introspection/cache、claims 类型、service credential 注入 | Auth Service server implementation、UI、plugin manifest、JWT/JWKS 解析 |
| `packages/data-client` | 目标新增：Data Service API client contract | Data Service local/cloud client、auth header/session 注入、health probe、错误归一化 | Data Service server implementation、UI、plugin manifest |
| `packages/runtime-contracts` | 目标新增：应用/程序/场景/runtime home manifest contract | ApplicationManifest、ProgramManifest、ScenarioPolicy、RuntimeStateRecord、RuntimeEndpointRecord、validation helpers | 实际启动程序、业务逻辑、UI |
| `packages/app-runner` | 已落地：统一应用启动框架 | ApplicationRunner、startup scenario resolver、phase executor、service adapter contract、health aggregation、Home runtime record writer | 具体 Electron/Data Service/MCP/worker 业务实现 |
| `packages/engine` | Domain workspace facade | review、interpret、candidate/domain facade、workspace service 组合 | MCP protocol transport、Desktop UI |
| `packages/interpreter` | Source -> diagnostics/artifacts 解释器 | inspect/interpret/regeneration artifacts、read-model derivation | Auth Service session、Agent surface URL |
| `packages/editing` | MediaEditingProject 纯模型、Editing Service contract/client 和 media pipeline runtime port contract | timeline schema、pure timeline mutation、validation、edit plan conversion、Editing Service endpoint constants/client/runtime discovery、`EditingMediaPipeline*` / `EditingRuntime*` 端口类型 | Electron mediaPipeline 执行、ffmpeg 进程管理、MCP transport、runtime port 单例状态 |
| `packages/prompt` | Prompt 编译 | content unit prompt compilation、semantic ref/resource prompt projection | generation job submission、MCP transport |

### 项目定位

`packages/core` 是业务语义中心。凡是 Desktop App、MovScript Agent Plugin App、Data Service worker 都需要一致行为的能力，必须放到 core 或 core 下游的领域包中。典型例子：

- domain source query/read/upsert/update/delete。
- inspect/interpret/overview/regeneration plan。
- content unit runtime prompt build。
- resource query/upload/read helper。
- generation submit/job polling 的统一工具逻辑。
- candidate create/register/select。
- Agent Surface descriptor 的业务上下文构造。

`packages/mcp-host` 是 `movscript.mcp.host` 程序包和 composition root，不是业务层。它只负责回答“当前能不能跑、怎么跑、请求如何进入 core”。典型例子：

- `movscript_runtime_status`。
- `movscript_runtime_configure`。
- stdio JSON-RPC 输入输出。
- `tools/list` 合并 host tools 和 core tools。
- AuthProvider/Data Service local/cloud profile probe。
- project source 检测。
- Desktop/mediaPipeline 增强能力 probe。

`apps/plugin` 是插件应用源码边界，负责组装运行时和生成 agent plugin 分发物；`plugins/movscript` 是最终让 Agent/provider 发现能力的插件包，不负责定义能力本身。典型例子：

- `.mcp.json` 指向 `bin/movscript-agent-mcp`。
- provider-specific manifest 可以按需指向同一个 launcher；例如 Codex target 只保留 provider adapter，不改变 canonical Agent Plugin 架构。
- `bin/movscript-agent-mcp` 查找 Node.js 并启动 bundle。
- `bin/movscript-agent-mcp.mjs` 是打包后的独立运行产物。
- skills 告诉 Agent 如何正确使用 MovScript 工具。
- README 描述安装后本地模式、云端模式、不启动 Desktop App、Desktop App 增强模式。

`surface/project` 提供可复用 Project Surface 页面域。项目 source 在本地时，Surface 页面必须通过本地 `movscript.project.service`、local service profile 或 Desktop bridge 读取数据；项目 source 在云端时，Surface 页面可以直接使用 cloud service profile 的 source API。`services/local-surface-host` 和 `services/web-surface-host` 只负责把 Surface Domain 挂载成可访问 Web UI，不拥有项目业务规则。

### 应用和程序定义

本文档里的“应用”和“程序”必须区分：

- **应用 Application**：安装、部署、展示和生命周期管理的容器。应用负责启动哪些程序、传入什么配置、暴露什么 UI/端口、如何管理权限和会话。
- **程序 Program**：应用容器里真正运行的 executable entry。程序负责一个明确运行职责，例如 Data Service API、MCP host、worker、web surface、desktop shell。

一个 Application 必须只有一个 owner。Application owner 是拥有应用生命周期最终决策权的进程或平台入口，负责决定启动、ready、shutdown、错误恢复和用户可见状态。`packages/app-runner` 只是生命周期执行库，不是新的 owner；它必须被具体 Application owner 调用。

Owner 规则：

| Application | 唯一 owner | ApplicationRunner 的位置 | 说明 |
| --- | --- | --- | --- |
| Desktop App | Electron main process | Electron main process 内托管/调用 | 窗口生命周期、native 权限、service supervisor、退出顺序都归 Electron main 统一决策。 |
| Agent Plugin App | Agent/provider 启动的 plugin launcher 进程 | plugin launcher / MCP host bootstrap 中调用 | Agent provider 启动插件进程，插件再以 Desktop 为首选启动目标。 |
| Cloud Deployment App | cloud platform/orchestrator 或 cloud-control wrapper | deployment/ops wrapper 中调用，或由平台编排替代 | Cloud App 不内嵌启动 Plugin-startable services，只描述和监督部署。 |
| CLI App | CLI process | CLI command 内调用 | 只服务当前命令生命周期。 |

因此 `movscript.mcp.host` 是 MCP endpoint program，不是应用，也不是和 Auth/Data/Project/Editing 同类的长期业务 service。`auth-service` 和 `data-service` 是程序 service，长期目录应分别是 `services/auth-service` 和 `services/data-service`；`apps/cloud` 是 Cloud Deployment App 容器。`Project Surface Host` 也是程序/页面产物，不应单独复制成 Desktop surface 和 Cloud surface 两套。应用负责按场景组合这些程序。

目录命名也应遵守这个区别：

- `apps/*` 只能表示应用容器实现，不能表示某个裸程序。
- `apps/backend` 不进入目标结构；后端服务源码归入 `services/data-service`，云部署/ops 容器职责归入 `apps/cloud`。
- 目标结构不是把 `apps/backend` 整体改名为 `apps/cloud`，而是拆成 `services/data-service` 和 `apps/cloud`。
- Plugin App 可以启动的程序 entry 不应放在 `apps/cloud` 内部，也不应由 Cloud App 进程启动。它们应来自 `services/*`、`packages/*/programs` 或等价的独立 service package；云端通过 deployment/orchestrator 启动同名 cloud profile 实例。

建议定义 3 个一等应用容器：

| 应用 | 建议目录/产物 | 容纳的程序 | 定位 | 不应承担 |
| --- | --- | --- | --- | --- |
| MovScript Desktop App | `apps/desktop` | Desktop shell、renderer、Electron bridge、service clients、Agent Surface embed shell、optional local service supervisor | 面向用户的本地产品壳、交互壳和本地服务对接容器 | 不重新实现 MCP tool、project 管理、editing 业务、Data Service 规则 |
| MovScript Cloud App | `apps/cloud` | cloud deployment manifest、cloud config、migration/ops entry、service manifests | 面向云端部署的应用/部署容器；描述 cloud profile 如何部署独立 service 实例 | 不放 Auth/Data/Project/Editing/MCP/Surface 服务源码，不启动 Plugin App 也可启动的 service，不依赖 Desktop App，不直接读取未经授权的用户本地文件，不提供完整 Desktop 产品 shell，不负责本地 profile 的应用容器 |
| MovScript Agent Plugin App | `apps/plugin` | plugin launcher、bundled stdio MCP host、optional local service supervisor、optional Project Surface Host、skills/assets templates、agent plugin build pipeline | Agent plugin/provider 内的 Agent 接入应用容器；构建输出为 `plugins/movscript` | 不重新实现 Data/Project/Editing Service，不携带 Desktop shell，不把 `plugins/*` 当源码应用目录 |

这 3 个应用可以连接同一类程序，但不能随意重复启动同一类程序。Desktop App 和 MovScript Agent Plugin App 可以启动本机 runtime；Cloud App 只描述云端部署，不内嵌启动任何 Plugin App 也可启动的 service。云端需要 Auth/Data/Project/Editing/Runtime/Surface 等能力时，由 cloud deployment/orchestrator 启动独立 `profile=cloud` service 实例，而不是由 `apps/cloud` 应用进程启动。本地模式由 Desktop App、MovScript Agent Plugin App、CLI App 或开发 runner 监督启动同名 service 的 `profile=local` 实例，不再单独定义一个 `apps/runtime-service` 应用。`admin-web` 不应混入 Agent Surface；如果它进入 Plugin App advanced profile，就也不应作为 Cloud App 内嵌启动项。

当前已落地的 manifest graph 先把这 3 个应用硬化为：

- `apps/desktop/application.manifest.ts`、`apps/desktop/startup.manifest.ts`、`apps/desktop/programs/desktop-shell.program.manifest.ts`
- `apps/cloud/application.manifest.ts`、`apps/cloud/startup.manifest.ts`、`apps/cloud/programs/cloud-control.program.manifest.ts`
- `apps/plugin/application.manifest.ts`、`apps/plugin/startup.manifest.ts`、`apps/plugin/programs/agent-launcher.program.manifest.ts`

`tools/runtime-registry.mjs` 当前校验结果应为 `3 applications / 11 programs / 7 scenarios`。这个数字不是长期功能上限，而是当前第一阶段 manifest graph 的受保护状态；后续新增真正 service entry、deployment profile 或 app scenario 时，必须同步更新 registry 测试。

当前代码迁移已经从低风险边界开始：

- Desktop App 已通过 `apps/desktop/runtime/desktopApplicationRuntime.ts` 接入 `apps/desktop/*` 的目标 manifest 和 `packages/app-runner`，启动时会把 Desktop application、desktop shell service 和 endpoint 写入 MovScript Home runtime records。Electron main、renderer、build config 和 package 入口已经归位到 `apps/desktop`，Desktop 的应用身份和 ApplicationRunner 所有权不再落在旧 `apps/frontend` 目录。
- Data Service 的 Go server、API、migrations、Dockerfile、observability 和 build script 已从旧 `apps/backend` 归位到 `services/data-service`，workspace package 名称收敛为 `@movscript/data-service`。
- Auth Service 已建立独立源码骨架并拥有最小 opaque key 生命周期和 identity/user/org management contract：`services/auth-service` 现在拥有 Go module、`@movscript/auth-service` workspace package、`movscript-auth-service serve` entrypoint、`GET /health`、`POST /v1/auth/introspect`、管理 token 保护的 `POST /v1/auth/keys/issue`、`POST /v1/auth/keys/revoke`、`GET /v1/auth/users`、`POST /v1/auth/users`、`GET /v1/auth/users/{id}`、`PATCH /v1/auth/users/{id}`、`PUT /v1/auth/users/{id}/password`、`GET /v1/auth/users/{id}/org-memberships`、`GET /v1/auth/orgs`、`POST /v1/auth/orgs`、`PATCH /v1/auth/orgs/{id}`、`GET /v1/auth/orgs/{id}/members`、`POST /v1/auth/orgs/{id}/members`、`PATCH /v1/auth/orgs/{id}/members/{user_id}` 和 `DELETE /v1/auth/orgs/{id}/members/{user_id}`；org list 的 `org_id`、`user_id`、status、plan、is_personal filter 均属于 Auth Service contract。identity wire contract 使用 `id`、`created_at`、`updated_at` 等新字段名，不保留旧 Data Service `ID`/`CreatedAt` 兼容字段。Auth Service 已拥有自己的 `User`、`Organization`、`OrganizationMember` 持久化模型、SQLite/Postgres 连接、migration 和 DB-backed identity provider；`MOVSCRIPT_AUTH_STATIC_IDENTITIES_JSON` 只作为显式测试/开发输入。Data Service 内部 user/org 身份权威写入正在硬迁移到 Auth Service，后续剩余工作应继续收敛业务路径里的 profile/membership 读取语义。
- Auth client/provider 边界已开始落地：`packages/auth-client` 提供 TS 侧 `AuthProvider`、`AuthContext`、Auth Service introspection client、管理 token 保护的 issue/revoke client、user list/create/update/profile、org list/create/update/member management 和 org membership client、`OpaqueKeyAuthProvider`、`LocalOwnerAuthProvider` 和 `NoAuthProvider`；`services/auth-service/pkg/authprovider` 提供 Go 侧 provider contract、local/no-auth provider 和 Auth Service opaque-key introspection provider；`services/auth-service/pkg/authidentity` 提供 Go 侧 Auth Service identity manager、identity value contract、本地模式 `LocalOwnerManager` 和细粒度 capability interface，覆盖 user profile、org membership、user directory/write/credential、org directory/write、org member directory/write。Data Service 通过 Go module `github.com/movscript/auth-service` 消费这些 contract，不再拥有本地 `internal/app/authprovider`、`internal/app/authidentity` 或 `internal/domain/identity`；协作用户搜索和 admin overview 已从全量 `authidentity.Manager` 收窄为只读 `UserDirectory` / `OrgDirectory`，admin user detail 已收窄到 `Reader`，admin org detail/join-code 已收窄到 `OrgMemberDirectory`，resource/resource-folder/canvas/job/entitlement legacy personal org 判断已收窄到 `OrgDirectory`；Data Service handler/app 层已禁止直接接收全量 `authidentity.Manager`，Project/Model Gateway 入口只接收 `Reader + OrgDirectory`，OrgHandler 只接收 invitation/member 流程所需的显式 capability 组合。
- Project Service 和 Editing Service 已从 manifest-only 进入独立进程阶段：`packages/project` 已作为 Project Service contract/client package 落地，拥有共享 endpoint constants、`ProjectServiceClient`、`MOVSCRIPT_PROJECT_SERVICE_URL` / MovScript Home runtime endpoint discovery；`services/project-service` 现在是 `@movscript/project-service` workspace package，提供 `movscript-project-service serve`、`GET /health`、`GET /v1/project/capabilities`，并已开始承接真实本地 project source/read-model 入口：`POST /v1/project/source/snapshot` 通过共享 workspace adapter 读取本地 source snapshot，`POST /v1/project/source/inspect` 调用 `@movscript/interpreter/node` 的 inspect，`POST /v1/project/source/overview` 调用 interpreter overview 聚合 project read-model 概览，`POST /v1/project/source/interpret` 调用 interpreter 写入 `.interpret/current/*` 派生产物，`POST /v1/project/source/regeneration-plan` 调用 interpreter regeneration planning，`POST /v1/project/source/command` 通过白名单 source command 执行 project standards、setting/state/asset、script、content unit、production tree entity、transition/timeline/edit prompt 更新和 delete entity 等 source 写入，`POST /v1/project/lifecycle/command` 承接本地 open/create/import，`POST /v1/project/locator/resolve` 承接 locator/source-root 解析，`POST /v1/project/resources/view` 承接 project summary/scripts/settings/assets/production/storyboard/content-unit resource view，`POST /v1/project/candidates/command` 承接 content-unit candidate create/select/decide，`POST /v1/project/candidates/view` 读取 scoped Project Data decision context，`POST /v1/project/prompt/context` 聚合 runtime panel、generation prompt、dependency report、selection validity 和 backend prompt compiler 输出。Project Service 不复制 source parser、interpreter、regeneration、candidate decision store 或 prompt compiler 逻辑，只组合 `@movscript/workspace/node`、`@movscript/workspace/repository`、`@movscript/interpreter/node`、`@movscript/prompt` 与 `@movscript/engine/node`，并复用 `@movscript/project` 的 HTTP contract。`packages/core/mcp/node/tools/domain` 的 source 写入、content-unit candidate create/select/decide、content-unit prompt read/build、inspect、review alias、overview、interpret 和 regeneration plan 已改为调用 `ProjectServiceClient`。`packages/editing` 已作为 Editing Service contract/client 的归属包，拥有 `EDITING_SERVICE_*` endpoint constants、`EditingServiceClient`、`MOVSCRIPT_EDITING_SERVICE_URL` / MovScript Home runtime endpoint discovery；`services/editing-service` 现在是 `@movscript/editing-service` workspace package，提供 `movscript-editing-service serve`、`GET /health`、`GET /v1/editing/capabilities`、`POST /v1/editing/project/command`、`POST /v1/editing/timeline/view`、`POST /v1/editing/task/request` 和 `POST /v1/editing/task/action`，并承接纯 `MediaEditingProject` create、edit-plan conversion、preview timeline / scene-moment edit-plan read view、scene moment timeline bundle、production timeline bundle、settings、assets、timeline、validate command、timeline render/HLS/transcode/reframe task request 编排，以及 task get/cancel/logs、export/import、save-local、HLS publish runtime action 归一化。`packages/core/mcp/node/tools/editing` 的 `editing_project_create/create_from_edit_plan/add_asset/remove_asset/update_settings`、`editing_timeline_*` 和 `editing_task_*_create` 编排逻辑已改为调用 `EditingServiceClient`，`editing_task_get/cancel/logs_get` 也已通过 `EditingServiceClient.taskAction` 获取 canonical runtime action；`editing_export_import_resource`、`editing_export_save_local` 和 `editing_export_publish_hls` 已改为通过 Editing Service 获取 canonical export handoff request；MCP 不再保留本地 mutation、edit-plan conversion、media task request 组装、task action 解释或 export handoff request 解释兼容实现；`packages/core/mcp/node/tools/domain` 的 `domain_read_preview_timeline` / `domain_read_scene_moment_edit_plan` / scene moment timeline bundle / production timeline bundle 也已改为调用 `EditingServiceClient.timelineView`，不再从 MCP domain runtime 直接读取或组装这些 editing view。该 service boundary 只接受 canonical `MediaEditingProject v1`，不补齐历史 `assets` 形态。后续应继续把 media pipeline 执行边界迁入 Editing Service 或独立 media service。
- Editing Service 第八十八批补充：`packages/editing` 已提供 preview timeline clips 到 canonical `MediaEditingProject v1` 的共享纯转换，`services/editing-service` 的 project command 已新增 `createProjectFromPreviewTimeline`。`packages/core/mcp/node/tools/domain` 的 scene moment / production timeline handoff 现在调用 Editing Service project command，Core 不再保留本地 production preview timeline project builder；content source workspace snapshot 也复用 `@movscript/editing` 的 preview timeline 转换纯函数。MCP/Core 不再拥有第二套 preview timeline conversion 逻辑。
- Project Service 第八十九批补充：`packages/project` 已新增 `PROJECT_SERVICE_READ_MODEL_ENDPOINT`、`ProjectReadModelRequest`、`ProjectReadModelResponse` 和 `ProjectServiceClient.readModel`；`services/project-service` 新增 `POST /v1/project/read-model`，统一组合 `overviewMovScriptWorkspace`、可选 `resolveWorkspaceSource` 和可选 `inspectMovScriptWorkspace`，返回稳定 `movscript.project-read-model.v1` envelope。该 endpoint 是正式 read-model contract，不是旧 overview alias；后续 Desktop、Plugin、Agent Surface 和 MCP 应围绕这一 contract 消费项目状态，而不是在各入口自行拼 source snapshot / overview / inspect。
- Project Service 第九十批补充：`packages/project` 已新增 `PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT`、`ProjectLifecycleCommandName`、`ProjectLifecycleCommandRequest`、`ProjectLifecycleCommandResponse` 和 `ProjectServiceClient.lifecycleCommand`；`services/project-service` 新增 `POST /v1/project/lifecycle/command`，承接本地 `openProject`、`createProject`、`importProject`。这些命令只处理 project directory、workspace metadata、`project.json` / `workspace.json` 初始化和 locator/summary，不执行 Data Service backend ensure，也不把后端绑定逻辑混入 project lifecycle contract。
- Project Service 第九十一批补充：MCP `system_project_init` / `system_project_open` 已硬迁移到 `ProjectServiceClient.lifecycleCommand`，分别调用 `createProject` / `openProject`。`packages/core/mcp/node/tools/project/projects.ts` 不再直接 import `@movscript/workspace/node`，也不再自行 `mkdir`、读取 `workspace.json` / `project.json` 或维护本地 metadata helper；MCP 只在 Project Service 返回 `projectUid` 后执行 MCP 自身的 backend project / project-data binding。
- Project Service 第九十二批补充：`packages/project` 已新增 `PROJECT_SERVICE_LOCATOR_RESOLVE_ENDPOINT`、`ProjectLocatorResolveRequest`、`ProjectLocatorResolveResponse` 和 `ProjectServiceClient.resolveLocator`；`services/project-service` 新增 `POST /v1/project/locator/resolve`，负责把 project directory、workspace directory、显式 project uid 和本地 metadata 归一成 canonical locator。`packages/core/mcp/node/tools/project/localProjectBinding.ts` 已改为通过该 locator contract 获取 `projectUid`、project title 和 description，不再直接读取 `workspace.json` / `project.json`；MCP backend binding 只保留 backend project / project-data ensure。
- Project Service 第九十三批补充：`packages/project` 已新增 `PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT`、`ProjectResourceViewKind`、`ProjectResourceViewRequest`、`ProjectResourceViewResponse` 和 `ProjectServiceClient.resourceView`；`services/project-service` 新增 `POST /v1/project/resources/view`，承接 `summary`、`scripts`、`settings`、`assets`、`episodes/productions`、`scenes/segments`、`storyboards`、`content-units` 的本地 source resource view。MCP `project/resources.ts` 已改为调用该 Project Service endpoint，不再在 MCP 进程中创建 domain runtime、`queryEntities` 或 `readScriptSource`。
- Project Service 第九十四批补充：`packages/core/mcp/node/tools/domain/runtime.ts` 的 scoped Project Data decision store 已改为 lazy resolver。MCP domain runtime 不再直接 `readFileSync(workspace.json)` 或维护本地 `readWorkspaceManifest` helper；当 content-unit candidate decision 或 prompt context 需要 backend decision context 时，先通过 `ProjectServiceClient.resolveLocator` 解析 Project Service 权威 locator，再用解析出的 `projectUid` / `projectTitle` 组装 `ProjectDecisionStoreConfig`。这让 MCP 的 candidate overlay、candidate command 和 prompt context 都复用 Project Service 的 project uid/source-root 解释规则。
- Editing Service 第九十五批补充：`packages/editing` 已新增 `EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT`、`EditingServiceTimelineViewKind`、`EditingServiceTimelineViewRequest`、`EditingServiceTimelineViewResponse` 和 `EditingServiceClient.timelineView`；`services/editing-service` 新增 `POST /v1/editing/timeline/view`，在 service 进程内通过 `@movscript/workspace/node` 读取 production preview timeline 和 scene-moment edit plan。MCP `packages/core/src/mcp/node/tools/domain/actions.ts` 的 `domain_read_preview_timeline`、`domain_read_scene_moment_edit_plan` 和 scene moment timeline handoff 已改为通过 `EditingServiceClient.timelineView` 读取这两类 editing view，不再直接 `service(args).readPreviewTimeline` 或 `service(args).readSceneMomentEditPlan`。
- Editing Service 第九十六批补充：`EditingServiceTimelineViewKind` 新增 `productionTimelineBundle`，`POST /v1/editing/timeline/view` 现在可接收可选 `decisionStore`，在 `movscript.editing.service` 进程内通过 `@movscript/workspace/node` + `@movscript/workspace/repository` 的 scoped Project Data overlay 组装 production preview timeline、clips/blockers、canonical `MediaEditingProject v1`、production edit plan 和 editing context。MCP `packages/core/src/mcp/node/tools/domain/actions.ts` 的 `domain_read_production_timeline`、`domain_read_production_edit_plan` 和 production target `domain_create_editing_project_context` 已硬迁移到该 service view；MCP 不再保留 `productionTimelineClips` / `productionEditPlanFromBundle` 或 `createProjectFromPreviewTimeline` 二次组装链路。
- Editing Service 第九十七批补充：`EditingServiceTimelineViewKind` 新增 `sceneMomentTimelineBundle`，`POST /v1/editing/timeline/view` 现在可在 `movscript.editing.service` 进程内读取 scene-moment edit plan，并统一返回 `movscript.scene-moment-timeline-bundle.v1`：包含 `edit_plan`、canonical `media_editing_project`、editing `context`、`compose_inputs` 和 `blockers`。`productionTimelineBundle` 同步返回 `compose_inputs`。MCP `domain_read_scene_moment_timeline`、scene moment target `domain_create_editing_project_context` 和 production timeline compose inputs 已硬迁移为消费 service bundle；MCP 不再保留 `createProjectFromEditPlan` command handoff、editing context builder 或 compose inputs builder。
- Editing Service 第九十八批补充：`packages/editing` 新增 `EDITING_SERVICE_TASK_ACTION_ENDPOINT`、`EditingServiceTaskActionName` 和 `EditingServiceClient.taskAction`；`services/editing-service` 新增 `POST /v1/editing/task/action`，把 `getTask`、`cancelTask`、`getTaskLogs` 的 `taskId` / `projectId` 解释统一收敛为 `movscript.editing-task-action.v1` canonical runtime action，并在 capabilities / program manifest 中声明 `media-task-action`。MCP `editing_task_get`、`editing_task_cancel` 和 `editing_task_logs_get` 已改为先调用 `EditingServiceClient.taskAction`，再把返回的 action 交给 Electron runtime port；MCP 不再保留本地 `taskIdValue` helper。
- Editing Service 第九十九批补充：`POST /v1/editing/task/action` 继续承接 `importExportResource`、`saveLocalExport` 和 `publishHlsStream` 三类 export handoff action。`movscript.editing.service` 现在负责解释 `outputPath` / `taskId` / task snapshot、HLS manifest/segment、save path/directory、resource import derivative、publish metadata，并返回 `ready` runtime request 或 `result` / `not_found` / `pending_output` / `unsupported_output` envelope。MCP `editing_export_import_resource`、`editing_export_save_local` 和 `editing_export_publish_hls` 只负责通过 canonical `getTask` action 获取 task snapshot、调用 Editing Service 生成 export action，然后把 ready request 交给 Electron runtime port；MCP 不再保留 `exportImportDerivativeRequest`、`exportDerivativePayload` 或 `isHlsTaskOutput` 这类 export request 解释 helper。
- Editing Service 第一百批补充：`packages/editing/src/runtime.ts` 已承接 `EditingMediaPipelineTaskRequest`、`EditingMediaPipelineTaskState`、`EditingRuntimePort`、export import/save local/HLS publish request/result 和 runtime capability 等 media pipeline runtime port contract。`packages/core/src/mcp/node/tools/editing/runtime.ts` 现在只保留 MCP 进程内 `setEditingRuntimePort` / `getEditingRuntimePort` 单例注册槽位，并从 `@movscript/editing` re-export 类型；MCP 不再定义 media pipeline 端口 shape。`services/media-pipeline/program.manifest.ts` 已作为 `movscript.media.pipeline` 独立 service manifest 骨架存在，后续执行侧实现必须复用 `@movscript/editing` runtime contract，而不是在 Desktop、Plugin 或 MCP 中各自定义接口。
- Media Pipeline 第一百零一批补充：`services/media-pipeline` 已从 manifest-only 推进为 `@movscript/media-pipeline` workspace service package，拥有 `movscript-media-pipeline serve` bin entry、`src/server.mjs`、`GET /health`、`GET /v1/media-pipeline/capabilities` 和 `POST /v1/media-pipeline/probe`。`packages/editing` 同步新增 `MEDIA_PIPELINE_SERVICE_NAME`、`MEDIA_PIPELINE_CAPABILITIES_ENDPOINT`、`MEDIA_PIPELINE_PROBE_ENDPOINT`、`MediaPipelineServiceClient`、`MOVSCRIPT_MEDIA_PIPELINE_URL` / MovScript Home runtime endpoint discovery。当前 probe 返回稳定 `movscript.media-pipeline-probe.v1` envelope，并在未配置执行 runtime 时明确 `available=false` / `media_pipeline_execution_not_configured`，而不是在 MCP、Desktop 壳或 Plugin 里假装执行 ffmpeg。后续把 Desktop mediaPipeline adapter、headless ffmpeg runtime 或 cloud media worker 接入时，必须复用 `@movscript/editing` 的 `EditingRuntimePort` contract 和该 service endpoint。
- Media Pipeline 第一百零二批补充：`packages/editing` 已新增 `MEDIA_PIPELINE_TASK_CREATE_ENDPOINT`、`MEDIA_PIPELINE_TASK_ACTION_ENDPOINT`、`MediaPipelineTaskCreateRequest/Response`、`MediaPipelineTaskActionRequest/Response` 和 `MediaPipelineServiceClient.createTask/taskAction`；`services/media-pipeline` 的 HTTP runtime 已可注入同一套 `EditingRuntimePort`，并通过 `POST /v1/media-pipeline/task/create`、`POST /v1/media-pipeline/task/action` 托管 `createTask`、`getTask`、`cancelTask`、`getTaskLogs`。未注入 runtimePort 时，task execution endpoint 必须返回 `media_pipeline_runtime_unavailable`，不能在 Desktop、Plugin 或 MCP 里各自做隐式 fallback。后续 Desktop bridge adapter、local daemon 和 cloud worker 只能通过 `movscript.media.pipeline` service endpoint 暴露执行能力，并把 endpoint 写入 MovScript Home。
- Media Pipeline 第一百零三批补充：Desktop Electron 的真实 media pipeline adapter 已抽出为 `createDesktopMediaPipelineRuntimePort`，Electron IPC 和 Desktop ApplicationRunner 共用同一套 adapter。Desktop 可以把该 adapter 作为增强能力注册到 MovScript Home，但这只是 Desktop bridge capability，不代表 Desktop 成为 Project/Editing/Data/Canvas/Media 业务 sidecar owner。`services/media-pipeline` 同步补齐 `exports` / `types` 和 `@movscript/runtime-contracts` 显式依赖，Desktop 不再通过相对路径偷引服务实现。Desktop renderer 同步改为通过 `packages/editing/src/browser.ts` 消费 browser-safe pure editing entry，避免把 `@movscript/runtime-contracts` 的 Node fs/path discovery 带入浏览器 bundle。Agent/Plugin/MCP host 通过 Home discovery 选择可用 `movscript.media.pipeline` endpoint；无 Desktop 时由 local daemon/full-local 路径确保 daemon-owned media pipeline。
- Media Pipeline 第一百零四批补充：Plugin App 已具备发现 `movscript.media.pipeline` endpoint 的 runtime-status 语义，但 `plugin-basic` 不再启动任何 media pipeline sidecar，只保留 launcher + stdio MCP host。`plugin-desktop-compatible` 是当前 Desktop 兼容场景名；`plugin-desktop-owned` 仅作为 legacy alias，表示外连 Home 中已有 endpoint，不表示 Desktop 是业务 sidecar owner。`plugin-full-local` 负责 ensure/attach `movscript.local-node` daemon，并通过 daemon-owned `movscript.media.pipeline` 承接 media task。Headless media-pipeline runtime 可 probe `ffmpeg`、维护 task state/logs/cancel，并承接 `media_transcode`、`media_reframe`、最小本地媒体 clip 的 `timeline_render` / `timeline_hls` ffmpeg task lifecycle；缺少 ffmpeg 时 task endpoint 返回稳定 failed task，而不是 503 runtime unavailable。Agent/MCP host 可通过 `movscript_runtime_status.mediaPipeline` 看到 media-pipeline endpoint 是否存在。
- Admin Web 已从纯 Vite 静态程序进入可独立运行的 Web service/BFF 阶段：`services/admin-web` 现在提供 `movscript-admin-web serve`、`GET /health`、静态 `dist` serving 和 server-side `/api/admin/auth/*` Auth management proxy。该 proxy 先使用浏览器 bearer 通过 Auth Service introspection 校验 `super_admin`，再由服务端使用 `MOVSCRIPT_AUTH_SERVICE_MANAGEMENT_TOKEN` 转发到 `movscript.auth.service` 的 `/v1/auth/users`、`/v1/auth/orgs` 和 member management endpoint；management token 不进入浏览器源码和响应。Admin Web 用户/组织管理页面、ActiveUserSelect 和 ActiveOrgSelect 已切到 `authManagementApi` 访问该 BFF；Data Service 已硬删除 admin user/org identity list/create/update/member management 代理路由和 handler，只保留 user/org detail、quota、invitation、join-code 等本地业务聚合。
- Data Service bootstrap 已接入 AuthProvider 和 AuthIdentity 构建：`MOVSCRIPT_AUTH_MODE` 支持 `opaque-key`、`local-owner`、`no-auth`、`test`，`MOVSCRIPT_AUTH_BASE_URL` 用于连接 `movscript.auth.service` introspection/identity endpoint，`MOVSCRIPT_AUTH_SERVICE_MANAGEMENT_TOKEN` 用于 Data Service 访问 Auth Service 管理 identity endpoint；local profile 默认 local-owner 且不启动 local Auth Service，但会装配 `authidentity.LocalOwnerManager` 作为本地虚拟 owner/workspace read model，配置了 Auth Base URL 的 cloud/external profile 会自动使用 opaque-key provider。cloud/external profile 缺少 Auth Base URL 必须启动失败，不保留旧 session/token fallback；Data Service config 不再保留独立登录/注册/SSO surface，不再定义 `MCP_TOKEN`、Data Service `AdminUsername` / `AdminPassword`、Turnstile、SCIM、OIDC 或 SAML 配置字段。
- Data Service 剩余短期签名 token 已从身份命名中剥离：旧 `internal/infra/auth` 已删除，Git proxy temporary clone URL 使用 `internal/infra/scopedtoken` 和显式 `GIT_PROXY_TOKEN_SECRET` / `GIT_PROXY_TOKEN_TTL_HOURS`。`.env.example` 不再出现旧 `AUTH_TOKEN_*` 或 legacy session/token flow 文案。HTTP identity middleware 只依赖 AuthProvider，不再接收 DB、旧 token manager 或 encryption key 参数。
- Agent Plugin App 已建立 `apps/plugin` 源码容器，`plugins/movscript` 只保留可安装分发物。`release -- package --app plugin` 负责从 `apps/plugin` 构建并同步 launcher、manifest、skills、assets 和 README 到 `plugins/movscript`。
- 本地模式已经从 manifest 和测试层移除 local `movscript.auth.service` 启动；Desktop/Plugin local profile 使用 local AuthProvider 或 NoAuthProvider，`auth-service` 只保留 cloud/test profile。
- Agent Surface 已开始从 Desktop-only 页面迁出：`surface/project` root 入口现在拥有 `/agent/*` route/URL/browser handoff contract、browser-neutral MCP proxy snapshot/action data adapter contract、shared value/query helpers、Resource Library 纯模型/view props contract、resource query key contract 和 resource browser drag/drop/interaction contract；`@movscript/project-surface/resource-browser` 子入口拥有 Resource Library browser controller runtime、browser view composer、adapter contract 和 Data Service REST adapter；`@movscript/project-surface/react` 子入口拥有第一批可复用 React shell 组件和 CSS，并已承接 `AgentContentCandidatesSurface`、`AgentContentPromptSurface`、`AgentGenerationJobSurface`、`AgentImpactSurface`、`AgentPreviewTimelineSurface`、`AgentProjectStatusSurface`、`AgentResourceDetailSurface` 和 `AgentResourceLibrarySurface` 七条具体 route view + 一条 resource library shell；Desktop `/agent/*` 页面已改为消费 React 子入口，其中 `AgentContentCandidatesPage`、`AgentContentPromptPage`、`AgentGenerationJobPage`、`AgentImpactPage`、`AgentPreviewTimelinePage`、`AgentProjectStatusPage` 和 `AgentResourceDetailPage` 已收缩为只负责 Desktop MCP proxy readiness、URL params、query/action/media adapter binding 的 route wrapper，`AgentResourceLibraryPage` 已收缩为只负责 Desktop redirect 和注入当前 Desktop `ResourceLibraryView`，Desktop `agentSurfaceData.ts` 只保留绑定 Desktop `api` 的薄 adapter，不再拥有 snapshot/action request 语义或 record/array/string/number helper；Desktop resource library 旧 `resourceLibraryModel.ts`、`resourceLibraryViewTypes.ts`、reusable `resourceQueryKeys.ts`、resource drag payload 和 resource interaction helper 已删除，`useResourceLibraryController` 已收缩为 Desktop API/store/toast/i18n/invalidation adapter，`ResourceLibraryView` 已改为通过 `ResourceLibraryBrowserView` 注入 Desktop toolbar/content/pager/dialog slots，ResourcesPage/toolbar/controller、resource mutation/cache、settings、canvas、agent/shared UI 通过 `@movscript/project-surface` 消费共享 model/view props/query key/interaction contract，并通过 `@movscript/project-surface/resource-browser` 消费共享 controller runtime、view composer 和 Data Service adapter；`services/local-surface-host` 现在是 `@movscript/project-surface-web` workspace package，拥有 Vite/TS 构建入口和 `movscript.local-surface.host` service package 骨架。
- 现阶段的迁移原则是先让 app/program/service 边界可被测试守住，再做大目录移动。Desktop 源码和 Data Service 源码已经完成目录归位，Auth Service 已有第一批独立进程代码，AuthProvider client contract 已有 TS/Go 双侧骨架；Data Service HTTP middleware/router 已硬切到共享 AuthProvider/`AuthContext` 入口，不再解析旧 session token、signed bearer、BasicAuth 或 `git_token` query，也不再注册旧 `/auth/*`、admin auth settings、admin session revoke HTTP surface 或 admin password reset HTTP surface；旧 `AuthHandler`、旧 `internal/app/auth`、旧 `internal/domain/auth`、旧 `internal/app/authprovider`、旧 `internal/infra/auth`、旧 `internal/domain/identity`、旧 `internal/app/authidentity` 和旧 `internal/app/user` 已从 Data Service 删除；`AuthChallenge` 和 `AuthSession` 持久化模型及 baseline migration 注册已删除；Data Service `admin/settings` 残留的 `AuthSettings` service/handler/test 已硬删除，Admin Web 系统设置页也不再调用 `/admin/settings/auth`；Admin User 页面也不再调用 Data Service session revoke/password reset API；model gateway signed backend token fallback 已删除，只接受 AuthContext 当前用户或正式 Gateway API key。Auth Service 已经开始承接 user/org 权威数据结构、identity provider、user management API、org management API、Go/TS provider/identity client contract 和独立 password hash credential contract；Data Service/Admin Web 的 user/org/member 管理 handler、协作用户搜索 `GET /users`、匿名邀请接受注册路径、普通组织成员新增路径、join-code 加入路径、用户组成员新增路径、current membership middleware、entitlement org snapshot、project member 新增路径、组织 usage 用户展示字段、组织成员/用户组成员展示字段、admin org detail 成员数量、admin usage 用户展示字段、admin overview 用户/组织统计、admin resource owner 展示字段、project admin owner 校验、project owner/member read model 展示字段、project repository 个人/组织 owner 解析、resource/resource-folder/canvas/job legacy personal scope 判断、debug/LLM call log 用户展示字段、model gateway API key owner 校验和 model gateway legacy personal org scope 判断已切到 AuthIdentity capability/AuthContext 用户身份，本地 admin user service 已收敛为 project/usage/audit detail 聚合，本地 admin org service 已收敛为 org detail、invitation 和 join-code 本地业务能力，`internal/app/org.AcceptInvitation` 不再创建本地 user/password 或 personal org，`internal/app/org.AddMember`/`AddGroupMember` 不再查询本地 users 表解析/校验目标成员，`ResolveOrgMember`/`InjectOrgMember` 不再构造本地 org service，而是消费 AuthIdentity membership，`entitlement.Service` 通过 AuthIdentity `ListOrgs` 读取 org personal/status snapshot，`gateway.PolicyService` 通过 AuthIdentity `ListOrgs(org_id)` 判断 personal org legacy scope，`resource.Service`、`resource/folder.Service`、`canvas.Service` 和 `job.Service` 通过 AuthIdentity `ListOrgs(org_id)` 判断 personal org legacy scope，`ProjectHandler.AddMember/AdminAddMember` 负责通过 AuthIdentity 校验目标用户和工作区成员资格，`project.Service` 通过 AuthIdentity 校验 `AdminCreate`/`ForceSetOwner` 的 owner 存在性和 active 状态，并通过 AuthIdentity enrichment 补齐 project owner/member `UserRef`，`projectrepo.Service` 通过 AuthIdentity 解析个人项目仓库 owner username，并通过 AuthIdentity `ListOrgs(org_id)` 读取组织项目仓库 owner name/slug/is_personal，`org.Service` 通过 AuthIdentity enrichment 补齐 organization member 和 user group member 的 `User` 展示对象，`admin/org.Service` 通过 AuthIdentity `ListOrgMembers` 计算 org detail / rotate join code 返回中的成员数量，`ProjectHandler`、`ModelGatewayHandler` 和 `OrgHandler` 已从全量 `authidentity.Manager` 收窄为显式 capability interface，Data Service handler/app 层不再直接持有完整身份管理器；`project.gormRepository` 不再 `Preload("Owner")`、`Preload("Members.User")` 或 `Preload("User")`，`projectrepo.gormRepository` 不再 `Preload("Owner")`、`Preload("Organization")` 或依赖 `project.Owner.Username` / `project.Organization`，`org.gormRepository` 不再 `FindUserByID`、`Preload("User")` 或 `Preload("Members.User")`，`admin/org.gormRepository` 不再从本地 `organization_members` 统计 `member_count`，`app/entitlement` 不再保留本地 repository 或查询本地 `organizations`，`admin/resource.gormRepository` 不再 `Preload("Owner")` 或查询本地 users 表补资源 owner 展示字段，`admin/overview.gormRepository` 不再统计本地 `users` / `organizations` 表作为 admin overview 身份概览来源，`gateway.gormRepository` 不再查询本地 users 表校验 API key owner，也不再查询本地 `organizations` 判断 personal org，`resource.gormRepository`、`resource/folder.gormRepository`、`canvas.gormRepository` 和 `job.gormRepository` 不再查询本地 `organizations` 判断 personal org，`debug.gormRepository` 不再 `Preload("User")` 或从本地 users 表拼 `LLMCallLogUserRef`，`org.gormRepository.GetUsage` 不再 JOIN 本地 users 表补 username，`admin/usage.gormRepository` 不再 `Preload("User")` 或查询本地 users 表补 top user/log user，org repository 已删除旧 `ensureActiveUserExists`，Data Service persistence schema 也已删除本地 `organization_members` 表模型和 migration 注册。Admin Web 源码已从 `apps/admin` 归位到 `services/admin-web` 并改为 `@movscript/admin-web` service package；`surface/project` 已承接 `/agent/*` route、browser URL、surface intent/entity contract、MCP proxy snapshot/action data adapter contract 和第一批共享 React shell，MCP surface helper、Desktop route 常量、Desktop `/agent/*` 页面 shell 和 Desktop surface data wrapper 已切到该共享包。下一批迁移应继续推进具体 Agent Surface route pages 从 Desktop 中抽出，以及 Project/Editing Service 的真实源码拆分。

- 补充：Candidates、Prompt、Generation Job、Impact、Preview Timeline、Project Status 和 Resource Detail 已作为具体 Agent Surface route view 迁入 `surface/project`；Resource Library 的 agent shell、readiness、URL param contract、filter/scope/page model、view props contract、resource query key contract、browser interaction contract、browser controller runtime、browser view composer 和 Data Service adapter 也已迁入 `surface/project`。后续“具体 route pages 迁出”主要指继续收敛 Resource Library 更细的 UI primitive/slot contract，以及 Project/Editing Service 的真实源码拆分。

### MovScript 程序清单

推荐把程序定义成可独立启动、可被不同应用容器组合的 entry：

| 程序 | Service name | 建议位置 | 谁可以监督启动 | 职责 | 共享组件 |
| --- | --- | --- | --- | --- | --- |
| `desktop-shell` | `movscript.desktop.shell` | `apps/desktop` Electron main/renderer | Desktop App | 窗口、导航、项目选择 UI、native 权限、Electron bridge、本地预览 UI、service client wiring、daemon attach | data-client、project/editing service clients、Agent Surface UI、theme/tokens |
| `auth-service` | `movscript.auth.service` | `services/auth-service` | cloud deployment/orchestrator；本地模式不启动；不由 Cloud App 内嵌启动 | 最小 login/logout/session、principal/claims、opaque `sk-...` token、agent/service credential、RBAC/claims、token introspection | auth-client/runtime-contracts |
| `data-service` | `movscript.data.service` | `services/data-service` | `movscript.local-node` local data plane、cloud deployment/orchestrator；不由 Cloud App 内嵌启动 | workspace/project API、resource/job/model gateway、Cloud Source API、job orchestration、内置 worker loop；通过 AuthProvider 获取 identity/claims 并做业务授权 | core/project/data-client/auth-client contracts |
| `project-service` | `movscript.project.service` | `services/project-service`，contract/client 在 `packages/project` | `movscript.local-node`、cloud deployment/orchestrator；不由 Cloud App 内嵌启动 | Git/source workspace、project open/create/import、candidate decision view、inspect/interpret/read-model、regeneration impact 的统一项目入口；当前已有 HTTP runtime、health、capability endpoint、本地 lifecycle command、source snapshot/inspect/overview/interpret/regeneration-plan endpoint 和稳定 `project-read-model` endpoint | project/workspace/interpreter/core/data-client contracts |
| `editing-service` | `movscript.editing.service` | `services/editing-service`，contract/client 在 `packages/editing` | `movscript.local-node`、cloud deployment/orchestrator；不由 Cloud App 内嵌启动 | timeline、clip/track、edit plan、preview timeline、render request 编排、剪辑产物登记；当前已有 HTTP runtime、health/capability endpoint、`MediaEditingProject` create/edit-plan/preview-timeline/timeline project command endpoint 和 media task request endpoint | editing/project/data-client/media pipeline contracts |
| `mcp-host` | `movscript.mcp.host` | `packages/mcp-host`，入口可由 `apps/plugin` launcher、Desktop child process 或 cloud deployment 包装 | MovScript Agent Plugin App stdio 会话、Desktop MCP 子进程、remote MCP deployment/orchestrator；不由 Cloud App 内嵌启动 | MCP transport、tool registry、runtime status、capability gating、tool request routing | core/project/data-client/surface provider |
| `local-surface-host` | `movscript.local-surface.host` | `services/local-surface-host`，UI code 来自 `surface/project`、`surface/admin` 等 Surface Domain | `movscript.local-node`、Desktop App 可连接/嵌入、dev runner；不由 Cloud App 内嵌启动 | 本机 `/agent/*` legacy handoff、后续 `/studio/*` Project Surface、本机 Admin/Debug Surface 挂载 | surface domain packages、data/project/editing clients、theme/tokens |
| `web-surface-host` | `movscript.web-surface.host` | `services/web-surface-host`，UI code 来自 `surface/project`、`surface/admin` 等 Surface Domain | cloud web deployment/orchestrator；不由 Cloud App 内嵌启动 | 云端 Project/Admin Surface Web UI、协作访问、cloud profile route 挂载 | surface domain packages、data/project/editing/auth clients、theme/tokens |
| `admin-web` | `movscript.admin.web` | `services/admin-web`，后续可把共享 UI 抽到 `packages/admin` | Desktop advanced profile、cloud admin web deployment/orchestrator；如果 Plugin App advanced profile 启动，则不由 Cloud App 内嵌启动 | org/user/provider/usage/billing/audit/job/resource 管理 UI；必须提供 server-side BFF/proxy 持有 Auth Service management credential，浏览器不直接持有 management token | shared UI、data-client、auth/session contracts |
| `plugin-launcher` | `movscript.plugin.agent-launcher` | `apps/plugin/bin/*`，发布时进入 `plugins/movscript/bin/*` | MovScript Agent Plugin App | 在 MovScript Agent Plugin App 环境里找到 Node 并启动 bundled stdio MCP host；provider-specific launcher 只能是薄 wrapper | bundled mcp-host artifact |
| `cloud-control` | `movscript.cloud.control` | `apps/cloud/programs` | Cloud App | 云端 deployment profile、ops/migration/control wrapper；不启动 Plugin-startable services | deployment manifests、runtime-registry、service manifests |
| `media-pipeline` | `movscript.media.pipeline` | `services/media-pipeline` 或 media pipeline adapter package | `movscript.local-node`、cloud media deployment/orchestrator；不由 Cloud App 内嵌启动 | ffmpeg、preview、render、transcode、timeline materialization | editing contracts、resource/artifact contracts |

程序之间通过接口组合，不通过复制编译产物组合。Project/Admin Surface 的页面域来自同一套 `surface/*` package，本机由 `local-surface-host` 挂载，云端由 `web-surface-host` 挂载，Desktop 可以通过内部 `desktop-surface-host` 嵌入同一套页面域；`admin-web` 若作为历史管理 Web/BFF service 保留，也不能变成第四种 Surface Host；`mcp-host` 是 MCP 会话入口，代码来自同一套 `packages/mcp-host`，但每个 Agent/Desktop/cloud MCP 入口各自拥有自己的 host process/session。

`movscript.runtime.worker` 暂不作为当前一等服务。当前阶段由 `movscript.data.service` 内部承担 job orchestration 和 worker loop。只有当出现明确的队列隔离、独立扩缩容、执行沙箱、GPU/媒体 worker 池或跨节点 drain/heartbeat 需求时，再把它拆成独立 `runtime-worker` 程序。

`movscript.auth.service` 已从空 manifest 进入独立源码阶段。它不属于 `data-service` 的内部模块，也不属于 Cloud App 内嵌模块；cloud profile 必须部署独立 Auth Service。本地模式不启动 Auth Service，也不创建 user/org/tenant，而是通过 local AuthProvider 提供 `local-owner` / `local-workspace` principal。团队共享或高级管理需要身份能力时，应连接云端/外部已部署 Auth Service，而不是由本地 Desktop/Plugin 启动一个 local Auth Service。当前实现已硬化 health check、opaque key introspection contract、管理 token 保护的 issue/revoke contract、user list/create/update/profile contract 和 org membership 读取 contract；login/session 已从 Data Service 删除，user/org 迁移必须继续收敛到 `packages/auth-client` 和 Data Service AuthProvider 边界。

`movscript.admin.web` 不能把 Auth Service management token 下发到浏览器。目标结构中，Admin Web 程序必须从“纯静态 Vite bundle”升级为可独立运行的 Web service：浏览器使用当前用户会话访问 Admin Web BFF，BFF 在服务端持有 `MOVSCRIPT_AUTH_SERVICE_MANAGEMENT_TOKEN` 或等价 managed credential，再转发到 `movscript.auth.service` 的 `/v1/auth/*` management API。身份权威 API 迁移顺序必须硬切：

1. 先给 `services/admin-web` 增加 server entry、health check、static asset serving 和 server-side Auth Service management proxy。
2. Admin Web 用户/组织身份管理页面改为调用 Admin Web BFF 的 auth-management endpoint；业务 detail、usage、audit、resource、project 等仍调用 Data Service。
3. Data Service 删除 `/api/v1/admin/users`、`/api/v1/admin/orgs` 中 user/org/member create/update/list 这类身份管理代理，只保留业务聚合 detail、invitation、join-code、usage/audit/resource/project 等 Data Service 本域能力。
4. 边界测试禁止浏览器源码出现 Auth Service management token、禁止 Data Service 重新拥有 identity management write API，也禁止 Admin Web 退回直接调用 Data Service 代理身份管理。

这个迁移不设置历史兼容层；切换完成后，旧 Data Service admin identity routes 不保留 alias。

### 应用可携带服务矩阵

“应用带服务”指应用容器负责启动、监督、配置或嵌入某个程序实例，不表示应用拥有这份业务实现。业务实现仍然来自对应的 service program/package；应用只决定当前场景要不要启动它、用什么 profile、如何注入 config/session、如何停止。

#### MovScript Agent Plugin App 可携带的服务

MovScript Agent Plugin App 有三个主要运行形态。优先级从高到低是：显式 basic 诊断/外连模式、cloud/external data plane 模式、daemon-backed full local 模式。三者都不把 Desktop 作为业务 sidecar owner；Desktop 只是可选 GUI/focus/surface client。

| 形态 | 必带服务 | 可带服务 | 外部连接服务 | 不应携带 |
| --- | --- | --- | --- | --- |
| `plugin-basic` | `movscript.plugin.agent-launcher`、stdio `movscript.mcp.host` | local source proxy、surface URL resolver | ready daemon、cloud/external services | `movscript.desktop.shell`、Desktop Electron bridge、Desktop timeline UI、本机业务 sidecar |
| `plugin-full-local` + local data plane | session-scoped launcher/MCP host；后台 `movscript.local-node.control`、local AuthProvider、local `movscript.data.service`、local `movscript.project.service`、local `movscript.editing.service`、local `movscript.canvas.service`、local `movscript.local-surface.host`、local `movscript.media.pipeline` | local HTTP `movscript.mcp.host`、local `movscript.admin.web` advanced/dev profile | provider APIs、optional cloud account/session | `movscript.desktop.shell`、Desktop Electron bridge、Desktop-only UI state |
| `plugin-full-local` + cloud/external data plane | session-scoped launcher/MCP host；后台 `movscript.local-node.control`、local `movscript.project.service`、local `movscript.editing.service`、local `movscript.canvas.service`、local `movscript.local-surface.host`、local `movscript.media.pipeline` | local HTTP `movscript.mcp.host`、local `movscript.admin.web` advanced/dev profile | cloud/external `movscript.data.service`、optional Auth Service/session | local `movscript.data.service`、`movscript.desktop.shell`、Desktop Electron bridge、Desktop-only UI state |

Agent Plugin App 带服务的原则：

- 必带 `movscript.mcp.host`，因为插件的核心入口是 Agent/MCP。
- 如果 local daemon 已启动，Agent Plugin App 只作为 Agent 中间层，保留 stdio 入口和路由能力，不启动任何同类业务服务。
- daemon 是整组所有权，不做局部补齐。不存在“Desktop 有 Project Service，Plugin 再启动 Editing Service”这种混合模式。
- full local profile 表示确保 `movscript.local-node` daemon，而不是让每个 MCP 会话拥有一组 sidecar。默认本地模式不启动 `auth-service`。
- `local-surface-host` 由 daemon 启动本地 Web server，用于 project review、candidate approval、timeline preview、render job、resource inspection。
- `media-pipeline` 是 daemon profile 的必带服务；如果缺少 ffmpeg、GPU、codec 或沙箱权限，服务仍应启动并通过 capability/probe/task endpoint 返回 unavailable，而不是影响 domain/project/editing 基础能力。
- `admin-web` 不作为 Plugin App 默认能力；只有本地高级设置、调试或 dev profile 需要时才启动。
- Agent Plugin App 不携带 `desktop-shell`，不拥有 Electron IPC、窗口状态、拖拽、native dialog 和专业时间线 UI。

因此 Agent Plugin Artifact 的完整能力目标是“daemon-backed local runtime + Agent 接入”，不是“Desktop App 的无窗口版本”。它可以让 Agent 在不启动 Desktop 的情况下完成项目管理、domain source、interpret、prompt、生成、candidate、剪辑服务和 surface 协作；Desktop App 继续负责更强的 native 交互体验。

#### MovScript Desktop App 可携带的服务

Desktop App 的核心是本地产品壳。它应 ensure/attach `movscript.local-node`，也可以连接云端服务：

| 形态 | 必带服务 | 可带服务 | 外部连接服务 | 不应携带 |
| --- | --- | --- | --- | --- |
| `desktop-cloud` | `movscript.desktop.shell`、Agent Surface embed shell | child-process `movscript.mcp.host`、attach daemon-owned local services | cloud/external Data Service、cloud Auth Service、cloud `movscript.web-surface.host` | cloud deployment control plane、第二套 Auth/Project/Editing/Data Service 实现 |
| `desktop-local` | `movscript.desktop.shell`、Agent Surface embed shell | attach daemon-owned local Data/Project/Editing/Canvas/Surface/Media services、local `movscript.admin.web` | provider APIs、optional cloud account/session、optional external/cloud Auth Service | Agent plugin launcher、插件分发 manifest、第二套 MCP 实现、Desktop-owned business sidecars |

Desktop App 带服务的原则：

- 必带 `movscript.desktop.shell`，因为 Desktop App 的产品价值是窗口、导航、项目入口、本地权限和交互体验。
- local profile 下通过 daemon 启动或复用 `data-service`、`project-service`、`editing-service`，并向它们注入 local AuthProvider；Desktop UI 不重新实现这些服务的业务规则。默认本地模式不监督启动 `auth-service`。
- 可以嵌入同一套 `movscript.local-surface.host`，并通过 Desktop bridge 提供本地文件权限、预览和确认体验。
- 可以启动或嵌入 `movscript.mcp.host`，但只作为 Desktop 场景的 Agent 入口；MCP tool schema 和 handler 不在 Desktop 内 fork。
- `media-pipeline` 是 Desktop 的强项能力，但仍应通过 `editing-service` 或 media pipeline contract 进入，不让 UI 直接成为剪辑业务权威。

#### Plugin-startable 与 Cloud App 互斥规则

凡是 MovScript Agent Plugin App 可以启动的服务，绝对不应该再作为 Cloud App 的内嵌启动项。原因是这些服务必须是跨 Desktop/Plugin/cloud deployment 复用的一等 service，而不是 `apps/cloud` 的内部模块。

硬规则：

- `apps/cloud` 不能在 `application.manifest.ts` 或 `startup.manifest.ts` 中声明启动 `movscript.data.service`、`movscript.project.service`、`movscript.editing.service`、`movscript.mcp.host`、`movscript.local-surface.host`、`movscript.media.pipeline`。
- 这些 service 如果需要在云端运行，应由 cloud deployment/orchestrator 独立启动 `profile=cloud` 实例，例如 systemd、Kubernetes、Docker Compose、Fly/Render service、CI deployment job 或等价平台编排。
- Cloud App 可以提供 cloud profile 配置、deployment manifest、migration/ops command、auth/org/provider/storage adapters，但不能成为这些 service 的进程父容器。
- Cloud App 可以连接这些 cloud service 实例，不能 import 它们的内部启动代码作为自己的子模块。
- 如果某个服务未来确实必须作为 Cloud App 内嵌模块，它就不应再列入 Plugin App 可启动服务；两者必须二选一。

#### 服务归属和携带规则

| 服务 | Canonical 实现归属 | Plugin App 可携带 | Desktop App 可携带 | Cloud App 可携带 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `movscript.plugin.agent-launcher` | `apps/plugin` | 必带 | 不带 | 不带 | Agent plugin 入口，只属于 Plugin App。 |
| `movscript.desktop.shell` | `apps/desktop` | 不带 | 必带 | 不带 | Desktop 产品壳，只属于 Desktop App。 |
| `movscript.mcp.host` | `packages/mcp-host` | 必带 stdio MCP 会话 | 可选 child-process MCP endpoint | 不带；cloud remote MCP 由 deployment/orchestrator 独立启动 | 同一套 MCP host library，不同入口进程、transport/profile；不作为本机 runtime owner。 |
| `movscript.auth.service` | Auth Service program + `packages/auth-client` | 本地不带；可连接 cloud/external instance | 本地不带；cloud profile 外连 | 不带；cloud instance 由 deployment/orchestrator 独立启动 | 云端用户、组织、租户、session、token、claims 的权威入口；本地由 AuthProvider 提供 local principal。 |
| `movscript.data.service` | Cloud/local service program | daemon local data plane 启动；cloud/external data plane 外连 | attach daemon local data plane；cloud/external 外连 | 不带；cloud instance 由 deployment/orchestrator 独立启动 | Plugin/Desktop 不直接拥有服务实现。 |
| `movscript.project.service` | Project Service program + `packages/project` | daemon 启动或连接 | attach daemon | 不带；cloud instance 由 deployment/orchestrator 独立启动 | 项目/source/interpret/read-model 权威入口。 |
| `movscript.editing.service` | Editing Service program + editing contracts | daemon 启动或连接 | attach daemon | 不带；cloud instance 由 deployment/orchestrator 独立启动 | timeline/edit/render request 权威入口。 |
| `movscript.local-surface.host` | `surface/project` | daemon 启动或连接 | embed 或打开 daemon surface | 不带；cloud web 由 deployment/orchestrator 独立启动 | 同一套 surface，可本地启动、云端部署或 Desktop 嵌入。 |
| `movscript.media.pipeline` | media pipeline adapter/program | daemon 启动或连接 | attach daemon，可额外提供 Desktop adapter capability | 不带；cloud media worker 由 deployment/orchestrator 独立启动 | ffmpeg/render/preview 等重媒体能力，按 capability gating 降级。 |
| `movscript.admin.web` | `packages/admin` | dev/advanced 可带时 | local advanced 可带 | 不带；cloud admin web 由 deployment/orchestrator 独立启动 | 管理面，不是 Agent Surface 默认能力。 |

最推荐的默认组合：

| 入口 | 默认组合 | 完整组合 |
| --- | --- | --- |
| Plugin App | `plugin-basic`: launcher + stdio MCP host/bridge，连接 ready daemon 或 cloud/external endpoints | `plugin-full-local`: launcher + stdio MCP host + ensure/attach `movscript.local-node` |
| Desktop App | `desktop-cloud`: Desktop shell + embedded Agent Surface，连接 cloud services 或 daemon local services | `desktop-local`: Desktop shell + embedded Agent Surface + ensure/attach `movscript.local-node` |

### Service 通讯原则

Service 之间默认通过明确协议通讯，而不是互相 import 内部实现。这样可以让 service boundary、权限、健康检查、日志和部署拓扑保持清楚。

推荐规则：

| 通讯关系 | 推荐机制 | 说明 |
| --- | --- | --- |
| MovScript Agent Plugin App -> `movscript.mcp.host` | stdio MCP / JSON-RPC | MovScript Agent Plugin App 环境天然适合 stdio transport。 |
| `movscript.mcp.host` -> AuthProvider / `movscript.auth.service` | provider contract；cloud 时 HTTP/REST + auth-client | 本地 runtime status 和 capability claims 来自 local AuthProvider；云端 login/status、`sk-...` token introspection 和 claims 从 Auth Service 获取。 |
| `movscript.mcp.host` -> `movscript.project.service` | HTTP/REST 或受控 local IPC | project/domain/source/interpret/candidate-view 工具都从 Project Service 取项目视图。 |
| `movscript.mcp.host` -> `movscript.editing.service` | HTTP/REST 或受控 local IPC | editing/timeline/render-request 工具都从 Editing Service 进入剪辑业务。 |
| `movscript.mcp.host` -> `movscript.data.service` | HTTP/REST 或稳定 API client | generation/resource/job/provider 等非 project 聚合能力走 Data Service API。 |
| `movscript.data.service` -> AuthProvider | provider contract；opaque-key introspection/local-owner/no-auth/test | Data Service 不签发用户登录态；它通过 provider 获取 identity/claims，并按 resource/job/provider 业务规则做授权。 |
| `movscript.project.service` -> AuthProvider | provider contract；opaque-key introspection/local-owner/no-auth/test | Project Service 通过 provider claims 判断 workspace/project/source 权限，不直接读取用户表。 |
| `movscript.editing.service` -> AuthProvider | provider contract；opaque-key introspection/local-owner/no-auth/test | Editing Service 通过 provider claims 判断 timeline/render 权限，不直接拥有 session。 |
| `movscript.local-surface.host` -> `movscript.project.service` | HTTP/REST + session/auth | 项目 surface 读取同一份 project read model，不在浏览器拼 source 和 candidate。 |
| `movscript.local-surface.host` -> `movscript.editing.service` | HTTP/REST + session/auth | 剪辑 surface 读取同一份 timeline/edit read model，不在浏览器重写剪辑规则。 |
| `movscript.local-surface.host` -> `movscript.data.service` | HTTP/REST + session/auth | 资源、任务、模型和账号能力仍由 Data Service API 提供。 |
| `movscript.admin.web` -> `movscript.auth.service` | HTTP/REST + admin session/auth | 管理 org/user/tenant/RBAC/session/audit 的身份侧能力。 |
| `movscript.admin.web` -> `movscript.data.service` | HTTP/REST + admin session/auth | 管理资源、任务、provider、model、usage 等业务侧能力，不直接访问数据库或 worker 内部实现。 |
| `movscript.desktop.shell` -> `movscript.project.service` | HTTP/REST、local IPC 或受控 local supervisor handle | Desktop 是一个应用壳；可以监督启动本地 service，但项目读写仍走 Project Service。 |
| `movscript.desktop.shell` -> `movscript.editing.service` | HTTP/REST、local IPC 或受控 local supervisor handle | Desktop 提供剪辑交互体验，但 timeline/edit 业务仍走 Editing Service。 |
| `movscript.desktop.shell` -> local service profile | HTTP/REST 或受控 local supervisor handle | Desktop 可以监督启动本地 service，但资源/job/provider 访问仍走 Data Service API。 |
| `movscript.desktop.shell` -> embedded Agent Surface | WebView/route + Desktop bridge | Bridge 是 Desktop App 内部 adapter，不是独立 service，也不是 fork 一套 surface。 |
| `movscript.data.service` -> internal worker loop | internal queue / job protocol | 当前 worker loop 内置在 Data Service 内；未来拆出 `runtime-worker` 时才改成独立 service 协议。 |
| service 内部模块 -> packages | typed import | 同一个 service 内部可以直接 import packages 中的共享能力。 |
| App Runner -> service process | typed supervisor interface + process handle | App Runner 只负责启动、停止、health 和日志，不承载业务调用。 |

例外规则：

- 单个 service 进程内部的 composition 可以用 typed interface，例如 `movscript.mcp.host` 进程内部组合 `ProjectServiceClient`、`DataServiceClient`、`AgentSurfaceProvider`。
- App Runner 可以用 typed supervisor adapter 管理启动/停止/health，但不能绕过 service protocol 调业务 API。
- Desktop App 的 native bridge 只用于本地权限、窗口、文件选择、预览等 Desktop-only 能力，不替代 Data Service API。
- 测试可以使用 memory adapter，但测试 manifest 必须标注 `profile=test`，避免把 memory adapter 当生产通讯方式。

### Desktop App 单体边界

Desktop App 不再继续拆出 `desktop-interaction`、`desktop-bridge-service` 之类的独立程序。它只有一个稳定 service name：`movscript.desktop.shell`。

Desktop App 的 Application owner 必须是 Electron main process。`ApplicationRunner` 在 Desktop App 中只能作为 Electron main 托管的生命周期执行器存在，不能成为另一个平级进程 owner。

原因：

- Electron main 拥有窗口生命周期和应用退出决策。
- Electron main 拥有 native 权限、文件选择、系统菜单、托盘、协议唤起等 Desktop-only 能力。
- Desktop 对 daemon 的 attach/start/stop 策略必须跟窗口、session、用户设置和退出确认保持一致。
- Agent Plugin App 不唤起 Desktop App 或依赖 Desktop bridge；需要本地执行时直接 ensure/attach `movscript.local-node`。

因此 Desktop 内的启动关系应是：

```text
Electron main process
  -> owns MovScript Desktop Application
  -> calls ApplicationRunner as a library
  -> ensure/attach movscript.local-node daemon
  -> owns Desktop shell, window bridge, and Desktop-only adapters
  -> owns shutdown order and user-visible recovery
```

不应出现：

```text
ApplicationRunner process
  -> owns Desktop App
  -> starts Electron as just another child service
```

`movscript.desktop.shell` 内部可以有 Electron main、renderer、preload bridge、service clients、daemon attach/recovery、preview/player adapter 等模块，但这些都是 Desktop App 的内部实现，不进入全局 service graph。Project/Editing/Data/Canvas/Media/Local Surface 等本机业务服务仍归 `movscript.local-node` daemon 拥有。

Desktop App 的职责是对接服务，而不是成为服务本身的业务实现：

- 云端场景对接 `movscript.auth.service`，用于 login/status/logout、`sk-...` key introspection、user/org/tenant claims；本地模式只使用 local AuthProvider。
- 对接 `movscript.project.service`，用于 project/source/candidate/interpret/read-model。
- 对接 `movscript.editing.service`，用于 timeline/edit plan/preview timeline/render request。
- 对接 `movscript.data.service`，用于 resource/job/provider/model gateway。
- 可选监督启动 local `movscript.project.service`、`movscript.editing.service`、`movscript.data.service`、`movscript.media.pipeline`；不启动 local `movscript.auth.service`。
- 可选 embed 或启动 `movscript.mcp.host`，作为 Desktop 场景下的 Agent 入口。
- 嵌入 `movscript.local-surface.host`，但不 fork Agent Surface。

因此 Desktop App 的独有价值是窗口、导航、快捷键、文件权限、拖拽、剪贴板、本地预览、播放器交互、native dialog、服务启动/停止控制面和用户确认体验。Project、Editing、Runtime、MCP、Agent Surface、Admin 都是它连接或嵌入的服务/程序，不是 Desktop 内部业务分叉。

### Project Service 边界

`movscript.project.service` 应成为 Desktop App 和 `movscript.mcp.host` 的唯一项目视图入口。它不是“只读 Git 的工具”，也不是 Data Service candidate 表的别名，而是把两类权威状态组合成一个可解释的项目服务：

```text
Project Service
  -> Git/project source workspace
      project.json
      project_standards.json
      settings/**
      scripts/**
      content_units/**
      productions/**

  -> Data Service candidate/decision API
      resources
      jobs
      content-unit candidates
      candidate decisions
      selected candidates

  -> Interpreter/read-model
      domain_inspect
      domain_interpret
      regeneration impact
      agent/project surface snapshot
```

权威关系应这样定义：

- Git/project source 是创作意图、结构化 domain source 和版本历史的权威。
- Data Service candidate/decision API 是生成产物、candidate、selection、job/resource provenance 的权威。
- Project Service 负责把 source 与 candidate/decision 合成一个 project read model，并负责触发 `inspect`、`interpret`、`regeneration_plan`。
- `.interpret/**` 仍然只是解释器诊断和派生产物缓存，不是第三个产品状态源。
- Desktop App 和 `movscript.mcp.host` 不直接拼接 source 文件和 candidate API；它们只调用 Project Service，保证只有一个信息源。

这意味着 MCP tool 的职责也要收窄：

- `movscript.mcp.host` 负责 MCP protocol、`tools/list`、`tools/call`、resource exposure、capability gating、session/project routing 和错误归一化。
- `movscript.mcp.host` 不直接读写 project source，不直接运行 interpreter，也不直接实现 candidate selection 语义。
- project/domain/source/interpret/review/regeneration 相关 MCP tools 转发到 Project Service。
- generation/resource/job/model 相关 MCP tools 可以调用 Data Service API；当这些结果需要进入项目状态时，再通过 Project Service 写入 candidate/decision。

这条边界的收益是：Desktop App 和 Agent 都看到同一个 project snapshot；candidate selection 后的 downstream stale impact 只有一套计算；本地项目和云端项目只是 Project Service adapter 不同，而不是 UI、MCP、worker 各自实现一遍。

### Engine / Interpreter / Prompt 解耦计划

当前 `engine`、`interpreter`、`prompt` 不是严重循环依赖，但边界已经偏耦合。真实代码关系大致是：

```text
packages/engine
  -> packages/interpreter
  -> packages/prompt
  -> packages/workspace

packages/interpreter
  -> packages/workspace
  -> packages/language
  -> packages/decision

packages/prompt
  -> packages/workspace

packages/core/mcp/node/tools/domain
  -> packages/engine/node
  -> packages/interpreter/node
  -> packages/workspace/node
  -> packages/workspace/repository
```

这个形态虽然能运行，但目标架构里有三个问题：

- `engine` 名字和职责都偏大。它现在像 Domain workspace facade，又负责把 workspace、interpreter、prompt 和 candidate decision store 拼起来。
- `prompt` 直接依赖 workspace index/layout，导致 prompt compiler 会顺手承担 source query 和 ref resolution，未来接入 Project Service read model 时容易形成第二套项目视图。
- `core/mcp` 直接创建 `NodeMovScriptEngineRegistry`、file repository、decision store 和 interpreter 调用，使 MCP tool handler 变成隐形 Project Service。

目标边界应改成：

| 包/服务 | 目标职责 | 允许依赖 | 不应依赖 |
| --- | --- | --- | --- |
| `packages/language` | MovScript source schema、domain kind、基础类型 | 无或极少基础包 | workspace、interpreter、prompt、engine |
| `packages/workspace` | source layout、repository、index、source read/write primitive | language、decision contract | prompt、engine、MCP、Desktop |
| `packages/interpreter` | workspace/source -> diagnostics、artifacts、read model、regeneration impact | workspace、language、decision contract | prompt、engine、MCP、Data Service client |
| `packages/prompt` | read model / prompt context -> backend prompt | language/prompt contract、ProjectPromptContext | engine、MCP、Data Service client、file repository |
| `packages/engine` | 稳定 facade 或 service 内部 orchestration API | workspace、interpreter、prompt | service singleton、MCP transport、Desktop |
| `movscript.project.service` | project/source/candidate/interpret/prompt 的权威组合入口 | workspace、interpreter、prompt、data-client | MCP transport、Desktop UI |
| `packages/core/mcp` | MCP tool schema、tool registry、tool handler adapter | project/editing/data service clients、contracts | `@movscript/engine/node`、file repository、interpreter node runtime |

目标方向是把“项目总装”放到 `movscript.project.service`，而不是继续让 `packages/engine` 变厚。`engine` 可以作为服务内部 facade 被复用，但新的 Desktop/MCP/Agent Surface 不应直接依赖 `engine/node`。

Prompt 的目标输入也要从“workspace index + decision provider”收窄为“Project Service 已解释出的 prompt context”。示意：

```ts
type ProjectPromptContext = {
  projectSnapshot: ProjectReadModel
  contentUnit: ProjectContentUnitReadModel
  promptRefs: ProjectPromptResolvedRef[]
  decisionContext: ProjectDecisionContext
  styleContext: ProjectStyleContext
}

type PromptCompiler = {
  buildContentUnitBackendPrompt(context: ProjectPromptContext): Promise<MovScriptContentUnitPromptBuildResult>
}
```

旧 workspace-index API 不进入目标调用路径：

```ts
buildContentUnitBackendPrompt({
  index,
  contentUnit,
  decisionProvider,
})
```

但它应作为 adapter 存在，用于把 workspace index 转成 `ProjectPromptContext`，而不是让 prompt compiler 长期直接做 workspace query。

落地顺序应遵守“服务边界先行，再接入调用方”：

1. `packages/project` 已新增第一批 contract/client：Project Service endpoint constants、`ProjectServiceClient`、runtime endpoint discovery、source snapshot/inspect/overview/interpret/regeneration-plan、source command、content-unit candidate command/view、content-unit prompt context request contract。后续继续补完整 `ProjectSnapshot`、`ProjectReadModel`、更正式的 `ProjectPromptContext` 类型和 project lifecycle contract。
2. Project Service 已封装 `workspace/interpreter` 的 source snapshot、inspect、overview、interpret、regeneration planning、第一批 source command 写入、content-unit candidate create/select/decide/view，以及 content-unit prompt context 调用。后续继续把 ProjectReadModel 和 prompt context 类型进一步规范化。
3. `packages/core/mcp/node/tools/domain` 的 source 写入、content-unit candidate create/select/decide、content-unit prompt read/build、inspect、review alias、overview、interpret 和 regeneration plan 已改为调用 `ProjectServiceClient`。后续继续删除旧 `createMovScriptDomainRuntime` 中直接承担 engine facade、decision store 拼装的隐形 Project Service 路径。
4. 让 Desktop App 和 Agent Surface 的 project/domain 页面也调用 `ProjectServiceClient`，停止在 UI 层拼 workspace index 与 candidate decision。
5. 为 `packages/prompt` 增加 `ProjectPromptContext` 入口，并移除 MCP/Surface 对 workspace index prompt API 的直接调用。
6. 收窄 `packages/engine` exports：保留 service 内部 facade，禁止新代码直接依赖 `@movscript/engine/node`。
7. `rg "@movscript/engine/node|@movscript/interpreter/node" packages/core apps packages/mcp-host` 不应命中新的 MCP runtime 直连路径。

硬性约束：

- `interpreter` 不能 import `prompt` 或 `engine`。
- `prompt` 不能运行 interpret，不能直接写 candidate/decision，长期也不应直接读文件。
- `engine` 不能成为隐藏的跨服务 singleton；如果需要缓存，应在 Project Service 实例内管理。
- `core/mcp` 不能长期直接实例化 Node engine、file repository 或 decision store；它应只做 MCP protocol adapter。

### Editing Service 边界

`movscript.editing.service` 是剪辑业务入口。它和 `movscript.media.pipeline` 的边界必须分清：

- `movscript.editing.service` 理解 timeline、track、clip、edit plan、preview timeline、render request、剪辑版本和剪辑产物登记。
- `movscript.media.pipeline` 只执行媒体重活，例如 probe、thumbnail、waveform、transcode、HLS、render、reframe、mux/demux。
- Desktop App 提供 timeline/editor/player 的交互体验，但 timeline 业务规则和剪辑状态读写走 Editing Service。
- Agent/MCP 做粗剪、改 timeline、提交 render request 时，也走 Editing Service，不直接操作 Desktop UI 或 media pipeline。
- Editing Service 需要登记项目状态时，通过 Project Service 写 project/read-model 相关状态；需要资源、job、artifact 时，通过 Data Service API。

推荐调用关系：

```text
Desktop / Agent Surface / mcp-host
  -> movscript.editing.service
      -> movscript.project.service
      -> movscript.data.service
      -> movscript.media.pipeline
```

这样 Desktop App 可以继续提供最好的本地剪辑体验，但剪辑业务不会被锁在 Desktop App 里；Agent、Web Surface 和本地/云端 Runtime 都能看到同一套 timeline 和 render request 状态。

### 应用启动过程和 Service Name

每个应用必须有自己的启动过程。每个程序必须有稳定 service name。两者解决的问题不同：

- 应用启动过程描述一个容器如何启动、配置、监督和停止内部程序。
- 程序 service name 描述一个可执行 entry 在日志、健康检查、依赖图、telemetry、service discovery 中的身份。

应用启动过程应声明：

```ts
type ApplicationStartupManifest = {
  applicationId: string
  profiles: Array<'local' | 'cloud' | 'desktop' | 'plugin' | 'test'>
  phases: Array<{
    name: 'prepare' | 'configure' | 'start' | 'ready' | 'shutdown'
    services: string[]
  }>
  supervision: {
    restartPolicy: 'never' | 'on-failure' | 'always'
    shutdownOrder: string[]
  }
}
```

程序 service 应声明：

```ts
type ProgramServiceManifest = {
  programId: string
  serviceName: string
  entrypoint: string
  transports: Array<'stdio' | 'http' | 'ipc' | 'worker' | 'electron'>
  health?: {
    kind: 'http' | 'stdio_tool' | 'process'
    target: string
  }
  dependsOn: string[]
  provides: string[]
  logs: {
    namespace: string
  }
}
```

Service name 规范：

- 使用反向域风格：`movscript.<area>.<service>`。
- service name 稳定，不跟目录名重命名一起变化。
- profile 可以追加 runtime label，但不改变 service identity。例如 cloud/local 都是 `movscript.data.service`，运行实例可以标记 `profile=cloud` 或 `profile=local`。
- transport 不进入 service name。stdio 和 HTTP 形态都可以是 `movscript.mcp.host`，通过 `transport=stdio|http|ipc` 区分。

推荐 service names：

| Service name | Program | 典型 profile | Health |
| --- | --- | --- | --- |
| `movscript.desktop.shell` | `desktop-shell` | desktop | process ready event |
| `movscript.auth.service` | `auth-service` | cloud | `GET /health` + `POST /v1/auth/introspect` self-check |
| `movscript.data.service` | `data-service` | cloud、local | `GET /health` |
| `movscript.project.service` | `project-service` | cloud、local、desktop、test | `GET /health` |
| `movscript.editing.service` | `editing-service` | cloud、local、desktop、test | `GET /health` |
| `movscript.mcp.host` | `mcp-host` | plugin、desktop、cloud、local | `movscript_runtime_status` 或 `/health` |
| `movscript.local-surface.host` | `local-surface-host` | cloud、local、desktop | route health or static ready |
| `movscript.admin.web` | `admin-web` | cloud、local、dev | route health or static ready |
| `movscript.plugin.agent-launcher` | `plugin-launcher` | plugin | process start + MCP initialize |
| `movscript.media.pipeline` | `media-pipeline` | desktop、cloud、local | capability probe |

应用启动过程示例：

```ts
defineApplicationStartup({
  applicationId: 'movscript.desktop',
  profiles: ['desktop'],
  phases: [
    { name: 'prepare', services: ['movscript.desktop.shell'] },
    { name: 'configure', services: ['movscript.project.service', 'movscript.editing.service', 'movscript.data.service'] },
    { name: 'start', services: ['movscript.desktop.shell', 'movscript.local-surface.host'] },
    { name: 'ready', services: ['movscript.desktop.shell'] },
    { name: 'shutdown', services: ['movscript.mcp.host', 'movscript.media.pipeline', 'movscript.editing.service', 'movscript.project.service', 'movscript.data.service', 'movscript.desktop.shell'] },
  ],
  supervision: {
    restartPolicy: 'on-failure',
    shutdownOrder: ['movscript.mcp.host', 'movscript.media.pipeline', 'movscript.editing.service', 'movscript.project.service', 'movscript.data.service', 'movscript.desktop.shell'],
  },
})
```

```ts
defineApplicationStartup({
  applicationId: 'movscript.agent-plugin',
  profiles: ['plugin'],
  phases: [
    { name: 'prepare', services: ['movscript.plugin.agent-launcher'] },
    { name: 'configure', services: ['movscript.mcp.host'] },
    { name: 'start', services: ['movscript.mcp.host'] },
    { name: 'ready', services: ['movscript.mcp.host'] },
    { name: 'shutdown', services: ['movscript.mcp.host'] },
  ],
  supervision: {
    restartPolicy: 'never',
    shutdownOrder: ['movscript.mcp.host'],
  },
})
```

这套机制后续应由 `packages/runtime-contracts` 提供类型，由 `tools/runtime-registry` 校验：

- application startup 中引用的 service name 必须存在。
- 同一个 program 只能声明一个 canonical service name。
- 一个应用是否允许启动某个 service 由 scenario policy 决定。
- 日志、health、telemetry、runtime status 都必须使用 service name，而不是目录名或进程文件名。

### 统一 App 启动框架

所有应用可以使用同一套轻量启动框架。这个框架不关心 Electron、Go server、Node stdio、worker 具体如何运行，只负责按 manifest 管理生命周期和 service graph。

统一启动框架是 library，不是 application owner。每个 App 必须由自己的唯一 owner 调用它：Desktop 由 Electron main 调用，Agent Plugin 由 plugin launcher 调用，Cloud Deployment 由平台/orchestrator 或 cloud-control wrapper 调用，CLI 由当前 CLI process 调用。

建议框架职责：

```ts
type ApplicationRunner = {
  loadManifest(applicationId: string, profile: string): Promise<ApplicationStartupManifest>
  resolveServices(manifest: ApplicationStartupManifest): Promise<ResolvedServiceGraph>
  prepare(context: ApplicationContext): Promise<void>
  configure(context: ApplicationContext): Promise<void>
  start(context: ApplicationContext): Promise<void>
  waitUntilReady(context: ApplicationContext): Promise<void>
  shutdown(context: ApplicationContext): Promise<void>
}
```

每个具体程序通过 service adapter 接入：

```ts
type ProgramServiceAdapter = {
  serviceName: string
  configure(context: ApplicationContext): Promise<void>
  start(context: ApplicationContext): Promise<ServiceHandle>
  health(handle: ServiceHandle): Promise<ServiceHealth>
  stop(handle: ServiceHandle): Promise<void>
}
```

统一启动框架负责：

- 解析 `MOVSCRIPT_HOME` 和当前 runtime profile。
- 读取 `application.manifest.ts` 和 `startup.manifest.ts`。
- 校验当前 profile 允许启动哪些 service。
- 按依赖和 phase 顺序启动 service。
- 为每个 service 注入 config、session、profile、log namespace、telemetry context。
- 收集 service health，汇总成应用级 ready 状态。
- 把 application/service endpoint、pid、port、owner、health、log path 写入 `$MOVSCRIPT_HOME/runtime/**`。
- 按 `shutdownOrder` 停止服务。
- 把启动结果暴露给 diagnostics、runtime status 和测试。

统一启动框架不负责：

- 实现 Electron main process。
- 实现 Data Service API。
- 实现 MCP tool handler。
- 实现 worker job 逻辑。
- 实现 Agent Surface UI。

这些仍然由具体程序负责。App runner 只知道“启动 `movscript.data.service`”，不知道 Data Service 内部的 route、DB、job 细节。

### 各应用的启动设计

`MovScript Desktop App` 启动过程：

```text
prepare
  -> load desktop config
  -> resolve user data dir
  -> load application session

configure
  -> configure desktop bridge
  -> decide AuthProvider mode: local-owner / opaque-key / no-auth / test
  -> decide Data Service local/cloud profile
  -> configure Auth Service client only for opaque-key cloud/external profile
  -> configure Project Service client
  -> configure Editing Service client
  -> configure optional local service supervisor
  -> configure embedded Agent Surface

start
  -> movscript.desktop.shell
  -> optional movscript.data.service local instance
  -> optional movscript.project.service local instance
  -> optional movscript.editing.service local instance
  -> optional movscript.local-surface.host embedded shell
  -> optional movscript.mcp.host child process/http
  -> optional movscript.media.pipeline

ready
  -> Electron window ready
  -> project/session ready
  -> optional service health ready

shutdown
  -> stop mcp/media/Project/Editing/Data local service instances
  -> persist desktop state
  -> close windows
```

Desktop App 的具体运行仍然交给程序：

- `movscript.desktop.shell` 运行 Electron main/renderer。
- `movscript.auth.service`、`movscript.project.service`、`movscript.editing.service`、`movscript.data.service` 如果由 Desktop 监督启动，仍然是独立服务程序，不写进 Desktop 业务层。
- `movscript.mcp.host` 如果被嵌入，仍然走 `packages/mcp-host` composition。
- `movscript.local-surface.host` 只作为 embedded surface，不 fork UI。

`MovScript Cloud App / Cloud Deployment App` 启动过程：

```text
prepare
  -> load deployment profile: cloud
  -> load secrets/config/storage
  -> prepare database/storage/provider adapters
  -> load service deployment manifests

configure
  -> render cloud service config
  -> render migration/ops config
  -> render deployment manifests for independent services
  -> configure cloud health endpoints and service discovery
  -> configure admin/ops control surface if this app includes one

start
  -> Cloud App process starts only its cloud-control/ops/deployment wrapper
  -> cloud deployment/orchestrator starts independent service instances:
      -> movscript.auth.service
      -> movscript.data.service
      -> movscript.project.service
      -> movscript.editing.service
      -> optional remote movscript.mcp.host
      -> movscript.local-surface.host
      -> optional movscript.admin.web

ready
  -> deployment manifests applied
  -> independent service health checks pass
  -> cloud-control/ops routes ready if present

shutdown
  -> Cloud App process stops only its own control/ops wrapper
  -> service instance shutdown/drain is handled by deployment/orchestrator
```

Cloud App 只负责云端部署描述和云端运维入口：

- `profile=cloud` 使用 cloud Auth Service、cloud DB、object storage、provider credentials、多租户 auth。
- 本地模式不再由 Cloud App 容器表达；Desktop App、MovScript Agent Plugin App、CLI App 或开发 runner 可以监督启动同名 service 的 `profile=local` 实例。
- cloud/local 的差异放在 service profile 和 adapter 里，不放在两个应用目录里。
- Cloud App 不启动 Plugin App 也可启动的 service。云端的 `movscript.auth.service`、`movscript.data.service`、`movscript.project.service`、`movscript.editing.service`、`movscript.local-surface.host`、remote `movscript.mcp.host` 等都由 cloud deployment/orchestrator 独立启动。

`MovScript Surface Host program` 启动过程：

```text
prepare
  -> load surface config
  -> choose data adapter profile

configure
  -> configure cloud service adapter
  -> configure local service adapter
  -> configure desktop bridge adapter
  -> configure mcp proxy adapter

start
  -> movscript.local-surface.host

ready
  -> routes/assets ready
  -> selected data adapter ready or degraded

shutdown
  -> stop web server if self-hosted
```

`movscript.local-surface.host` 的具体运行是 Web 程序。它不实现 Data Service，也不实现 MCP，只通过 data adapter 连接 Data Service local/cloud profile、Desktop bridge 或 MCP proxy。

`movscript.admin.web` 程序启动过程：

```text
prepare
  -> load admin web config
  -> load admin auth/session config
  -> resolve Data Service API base URL
  -> resolve Auth Service base URL and server-side management credential

configure
  -> configure data-client
  -> configure Auth Service management BFF/proxy
  -> configure admin routes
  -> configure audit/telemetry client

start
  -> start movscript.admin.web HTTP server

ready
  -> /health ready
  -> admin routes/assets ready
  -> Auth management proxy configured or explicitly degraded
  -> Data Service admin API reachable or degraded

shutdown
  -> flush telemetry
  -> stop web server if self-hosted
```

`movscript.admin.web` 的具体运行是管理后台 Web 程序。它可以由 cloud deployment/orchestrator 同部署，也可以由 Desktop App 嵌入或本地启动；云端通过 Auth Service 管理身份/session/RBAC，本地通过 local AuthProvider / Desktop owner context 管理本机权限，通过 Data Service admin API 管理资源、任务、provider、model 和 usage。Auth Service management credential 只允许存在于 Admin Web 服务端 BFF 或受控 deployment secret 中，不能下发到浏览器；Admin Web 不直接读数据库、不调用 Data Service 内部 worker loop、不复用 Agent Surface 的项目协作页面作为管理后台。

`MovScript Agent Plugin App` 启动过程：

```text
prepare
  -> plugin launcher resolves Node/runtime path
  -> load plugin config/env

configure
  -> configure stdio mcp-host composition
  -> discover/ensure movscript.local-node
  -> discover AuthProvider/Data Service local/cloud/external profile
  -> discover project source
  -> configure plugin full local profile as daemon attach

start
  -> movscript.plugin.agent-launcher
  -> movscript.mcp.host
  -> if daemon ready: connect to daemon-owned services as middleware
  -> otherwise, if plugin-full-local is selected:
      -> initialize local AuthProvider
      -> movscript.data.service local instance only for local data plane
      -> movscript.project.service local instance
      -> movscript.editing.service local instance
      -> movscript.local-surface.host local instance
      -> movscript.media.pipeline local instance
      -> wire child service endpoints into current mcp-host composition

ready
  -> MCP initialize
  -> tools/list available
  -> movscript_runtime_status explains selected mode
  -> selected runtime owner health ready
  -> Desktop or local Agent Surface URL available

shutdown
  -> stop only Plugin-owned local sidecar services
  -> close stdio transport
  -> stop mcp-host
```

MovScript Agent Plugin App 的具体 MCP 运行由 `packages/mcp-host` 承载在当前 `agent-mcp` 进程里。Plugin launcher 只负责启动环境、选择模式、启动或连接服务，并把服务 endpoint/client wiring 进当前 MCP host composition；它不拥有 MCP 业务能力。

Agent Plugin App 应支持三种能力 profile：

| Profile | 启动内容 | 适用场景 | 能力边界 |
| --- | --- | --- | --- |
| `plugin-basic` | `movscript.plugin.agent-launcher`、stdio `movscript.mcp.host` | 显式诊断模式、已有 ready daemon，或用户明确选择 cloud/external service profile | MCP host 连接既有 daemon 或外部服务，不启动本地业务 sidecar |
| `plugin-full-local` + local data plane | 会话级 `movscript.plugin.agent-launcher`、stdio `movscript.mcp.host`；后台 `movscript.local-node` 托管 local AuthProvider、local `movscript.data.service`、local `movscript.project.service`、local `movscript.editing.service`、local `movscript.canvas.service`、local `movscript.local-surface.host`、local `movscript.media.pipeline` | 用户希望 Agent 完整操作本地项目、剪辑、预览和 surface，并使用本地 sqlite/Data Service | 全量 headless runtime；不包含 Electron Desktop shell，不复制服务业务实现；不启动 local `movscript.auth.service`；Codex 会话结束不立刻停止 local-node |
| `plugin-full-local` + cloud/external data plane | 会话级 launcher/MCP host；后台 `movscript.local-node` 托管 Project/Editing/Canvas/Surface/Media，本地不启动 Data Service | 用户希望本地执行项目/source/surface/media，但资源、候选、job、provider/gateway 走云端或外部 Data Service | 本地执行服务 + 远端/外部数据面；必须显式携带 Data Service URL 或可发现的 cloud config |

本地 runtime 的默认策略是 daemon-first。`plugin-full-local` 是“ensure/attach daemon”，不是补齐 Desktop 缺失服务的模式。只要 `movscript.local-node` ready，Agent Plugin App 就不启动新的 Data/Project/Editing/Surface/Media 副本；它只通过 stdio MCP/bridge 把 Agent 请求路由到 daemon-owned services。

Agent Surface 也可以被 Plugin App 带入本地 runtime。此时 `movscript.mcp.host` 的 tool result 可以返回 local surface URL，例如项目 review、candidate approval、timeline preview、render job、资源检查页面。没有浏览器 surface 时，工具仍应返回完整 JSON；有 surface 时，JSON 和 URL 同时返回，Agent 和用户各取所需。

#### Plugin full-local service wiring

`plugin-full-local` 下的顺序必须区分“会话入口”和“后台 local-node”：

```text
apps/plugin agent-mcp process
  -> loads packages/mcp-host
  -> checks movscript.local-node.control
  -> if no ready daemon, ensure movscript.local-node
      -> starts/reuses background local-node process
      -> initializes local AuthProvider
      -> starts local service processes according to data plane
      -> movscript.data.service only for local data plane
      -> movscript.project.service
      -> movscript.editing.service
      -> movscript.canvas.service
      -> movscript.local-surface.host
      -> movscript.media.pipeline
      -> exposes movscript.local-node.control
      -> writes endpoint records to $MOVSCRIPT_HOME/runtime
  -> starts session-scoped stdio movscript.mcp.host
  -> creates service clients from Home endpoints
  -> injects clients into MovScriptRuntimeComposition
  -> ToolRegistry exposes tools backed by those clients
  -> CapabilityRegistry exposes current session capabilities
```

这里没有“服务自己注册进 mcp-host”的全局机制。服务只需要启动、暴露 endpoint、通过 health/capability probe 告知可用能力；`movscript.local-node` 作为后台 service owner 负责监督本地服务，session-scoped `movscript.mcp.host` 只负责发现 Home endpoints 并转发工具调用。Plugin/Codex 会话退出时，stdio MCP host 结束；local-node 作为传统本机 daemon 默认继续运行，直到用户、agent tool、安装脚本或系统信号显式停止它。

#### Plugin local-node lifecycle

`movscript.local-node` 是无 Desktop 时的本机后台 owner。它不是安装期启动的服务，而是由 Agent Plugin App 在运行时按需拉起的传统本机 daemon；启动后默认不因 Codex 会话结束而退出，并且所有痕迹都写入 `$MOVSCRIPT_HOME/runtime`：

- app record：`$MOVSCRIPT_HOME/runtime/apps/movscript.local-node.json`
- control endpoint：`$MOVSCRIPT_HOME/runtime/endpoints/movscript.local-node.control.json`
- service records：`$MOVSCRIPT_HOME/runtime/services/<service-name>/<instance>.json`

默认策略：

- 默认不启用 idle timeout。
- `MOVSCRIPT_LOCAL_NODE_IDLE_TIMEOUT=30m` 可作为开发/测试 profile 启用空闲回收。
- `MOVSCRIPT_LOCAL_NODE_IDLE_TIMEOUT=never`、`0` 或未设置均表示传统 daemon 模式。
- 每次 MCP tool 调用会对 local-node control endpoint 执行 `/touch`，刷新 `lastActivityAt`，用于 status/debug 和可选 idle timeout。
- 显式 stop、系统信号或可选 idle timeout 触发时，local-node 按 Project Surface Host、Media Pipeline、Editing、Project、Data Service 的逆序优雅 shutdown，并把 app record 写成 stopped。

关闭/更新机制：

- CLI：`movscript daemon status`
- CLI：`movscript daemon stop`
- CLI：`movscript daemon restart`
- 兼容 CLI：`movscript-agent-mcp local-node status|stop|restart`
- MCP tool：`runtime_local_daemon_status`
- MCP tool：`runtime_local_daemon_stop`
- MCP tool：`runtime_local_daemon_restart`
- 兼容 MCP tool：`runtime_local_node_status|stop|restart`

安装器、release smoke 或本地开发更新插件前，应先通过 control endpoint 优雅 stop 旧 local-node。local-node 的 status 必须包含 `pluginRoot` 和 `pluginVersion`；新版本 Agent Plugin 发现后台 daemon 来自不同插件根目录或不同版本时，必须先 stop 旧 daemon，再用当前插件启动新的 local-node。只有 control endpoint 不可达且 pid record 指向 MovScript 自己的后台进程时，才允许使用 force stop。

### 目标文件夹规划

目标目录应让“应用容器、程序 entry、共享 package、插件分发”在文件系统上可见。建议最终形态如下：

```text
apps/
  desktop/                  # MovScript Desktop App，当前 apps/desktop
  cloud/                    # MovScript Cloud Deployment App，只放云部署/运维容器
  plugin/                   # MovScript Agent Plugin App，当前 plugins/movscript 的源码职责
  cli/                      # CLI App，保留为命令行应用

services/
  auth-service/             # movscript.auth.service，用户/session/token/org/tenant 权威入口
  data-service/             # movscript.data.service，当前 services/data-service Go server 的目标归属
  project-service/          # movscript.project.service，项目/source/read-model/interpret 权威入口
  editing-service/          # movscript.editing.service，timeline/edit/render-request 权威入口
  media-pipeline/           # movscript.media.pipeline，媒体执行能力

plugins/
  movscript/                # Agent plugin 分发物，由 apps/plugin 构建生成或同步

packages/
  core/                     # domain/source/tool schema 和纯业务逻辑
  project/                  # 目标新增：project discovery/open/create/import/source-root contract
  workspace/                # local filesystem workspace adapter
  auth-client/              # 目标新增：AuthProvider + Auth Service cloud/external API client contract
  data-client/              # 目标新增：Data Service local/cloud API client contract
  runtime-contracts/        # 目标新增：Application/Program/Scenario manifest 类型与校验
  app-runner/                # 目标新增：统一应用启动框架和 service graph runner
  mcp-host/                 # mcp-host program package，composition root
  interpreter/
  engine/
  prompt/
  editing/
  agent-surface/            # Surface Host program
  admin/                    # Admin Web program
  ui/
  theme/
  tokens/

tools/
  runtime-registry.mjs      # 已落地：聚合 manifests、做边界校验；后续可扩展生成文档
```

`packages/app-runner` 当前已支持读取 `ScenarioPolicyManifest` 并把 `startup.manifest.ts` 里的 service graph 解析为实际 `ProgramAdapter` 启动顺序。`apps/plugin/src/agent-mcp.ts` 已把 `plugin-full-local` 收敛为先 ensure 后台 `movscript.local-node`，再以 session-scoped `plugin-basic` 启动 launcher/MCP host；local-node 按 data plane 启动 Data/Project/Editing/Canvas/Project Surface Host/Media Pipeline 等本地 service，并把 runtime trace 写入 MovScript Home。`plugin-basic` 只作为显式 `MOVSCRIPT_PLUGIN_MODE=basic` 的诊断/外连模式或 daemon 已 ready 后的会话壳。Desktop Electron main 当前已通过 `desktop-bootstrap` scenario 写入 `movscript.desktop.shell` runtime trace，并 ensure/attach daemon；Cloud 后续接入时也必须走同一套 scenario resolver，而不是在应用入口里手写一套 service graph。

`services/*` 的推荐通用结构：

```text
services/<service-name>/
  service.manifest.ts
  program.manifest.ts
  package.json 或 go.mod
  cmd/ 或 src/
    server/
    worker/                 # 仅当该 service 内部确实需要多个 entry
  internal/ 或 src/internal/
    app/
    domain/
    infra/
    interfaces/
  migrations/               # 如果该 service 拥有自己的持久化 schema
  observability/
  scripts/
```

`services/*` 的目标形态必须是独立 OS 进程。`auth-service`、`project-service`、`editing-service`、`data-service`、`local-surface-host`、`admin-web`、`media-pipeline` 都必须提供独立 entrypoint、独立 health check、独立日志 namespace 和独立 program manifest。`mcp-host` 也必须能作为独立 MCP endpoint process 运行，但它的源码归属是 `packages/mcp-host`，并由 Agent Plugin、Desktop 或 cloud deployment 包装成具体会话入口。测试可以使用 memory fake 或 mock server，但测试 fake 不算 service runtime，不能进入生产 application startup。

当前目录到目标目录的含义映射：

| 当前目录 | 目标目录 | 当前问题 | 迁移目标 |
| --- | --- | --- | --- |
| `apps/desktop` | `apps/desktop` | 名字像普通前端，实际承担 Desktop App、部分 Web Surface、Electron shell | 移动为 Desktop App 容器；可复用 `/agent/*` 页面抽到 `surface/project`，运行 entry 放到 `services/local-surface-host` |
| `services/data-service` | `services/auth-service` + `services/data-service` + `apps/cloud` | 同时混有 auth/session、Data Service 源码、migration、Docker/ops 和 cloud deployment 语义 | 用户/session/token/org/tenant/RBAC 移到 `services/auth-service`；Go server 业务 API、migrations、job orchestration 移到 `services/data-service`；云端部署、ops、profile manifest 移到 `apps/cloud`；`runtime-worker` 暂不拆 |
| `services/admin-web` | `services/admin-web`，后续可拆 `packages/admin` | 已从 `apps/admin` 应用形态归位为 Admin Web 程序源码目录 | 继续作为独立 `movscript.admin.web` 程序；后续只在需要多端共享时把 UI 组件/contract 抽到 `packages/admin` |
| `apps/cli` | `apps/cli` | 已经是 CLI 应用容器 | 保留；CLI 可以启动/配置程序，但不变成 shared business layer |
| `plugins/movscript` | `apps/plugin` + `plugins/movscript` | 当前把应用源码和插件分发物混在一起 | 源码、构建配置、templates 移到 `apps/plugin`；`plugins/movscript` 只保留 Agent/provider 可安装的 agent plugin 分发物 |
| `packages/mcp-host` | `packages/mcp-host` + service entry | 已经是程序 package | 代码保留在 package；独立进程 entry 必须可由 Agent Plugin App、Desktop App 或 cloud deployment/orchestrator 启动 |
| `packages/workspace` | `packages/workspace` + `packages/project` | project 管理和 filesystem adapter 容易混在一起 | 把 project 语义 contract 拆到 `packages/project`，本地文件实现留在 `packages/workspace` |

### 目标应用目录结构

`apps/desktop` 目标结构：

```text
apps/desktop/
  application.manifest.ts
  startup.manifest.ts
  package.json
  electron/
    main/
    preload/
    services/
    managed-services/
  src/
    app-shell/
    routes/
    features/
    desktop-bridge/
    agent-surface-embed/
  programs/
    desktop-shell.ts
    desktop-shell.program.manifest.ts
    local-service-supervisor.ts
  public/
  scripts/
```

说明：

- `apps/desktop` 是应用容器，不是 shared UI package。
- Desktop-only IPC、window、native permission、media preview 留在这里。
- `/agent/*` 页面不应长期留在 Desktop App；共享页面归入 `surface/project`，独立运行入口归入 `services/local-surface-host`。

`apps/cloud` 目标结构：

```text
apps/cloud/
  application.manifest.ts
  startup.manifest.ts
  deployment-profiles/
    cloud.yaml
  deployment/
    docker-compose.yaml
    kubernetes/
    systemd/
  control/
    cloud-control.ts
    cloud-control.program.manifest.ts
  ops/
    migrate.ts
    seed.ts
    healthcheck.ts
  manifests/
    services/
      auth-service.manifest.ts
      data-service.manifest.ts
      project-service.manifest.ts
      editing-service.manifest.ts
      local-surface-host.manifest.ts
      server-side-mcp.manifest.ts
      admin-web.manifest.ts
  observability/
  scripts/
```

说明：

- `apps/cloud` 是应用/部署容器，不是 `data-service`、`project-service`、`editing-service`、`local-surface-host` 或 `mcp-host` 的源码目录。
- 当前 `services/data-service` 里的 Go server 目标归属是 `services/data-service`；`apps/cloud` 不接收这部分源码。
- Cloud App 只渲染和监督 cloud profile deployment manifests；local profile 由 Desktop App、Agent Plugin App、CLI App 或 dev runner 监督启动，不放进 `apps/cloud`。
- server-side MCP 如果存在，应是独立 `movscript.mcp.host` service entry 的部署 manifest，不能把 MCP 业务逻辑写进 Cloud App 或 Data Service request handler。

`surface/project` 目标结构：

```text
surface/project/
  package.json
  src/
    index.ts                 # 当前已落地：/agent/* route、browser URL、surface intent/entity contract
    resourceLibrary.ts       # 当前已落地：Resource Library browser-neutral model/view props contract
    resourceQueryKeys.ts     # 当前已落地：resource/resource binding/external/canvas query key contract
    resourceDragPayload.ts   # 当前已落地：resource drag/drop payload protocol
    resourceInteraction.ts   # 当前已落地：resource browser context-menu/drag/drop helper
    resource-browser.ts      # 当前已落地：Resource Library controller runtime + adapter contract + Data Service REST adapter 子入口
    react.ts                 # 当前已落地：React shell 子入口；Core/MCP 不 import
    components/
      AgentSurfaceShell.tsx  # 当前已落地：Desktop/local-surface-host 共用 shell
      AgentContentCandidatesSurface.tsx  # 当前已落地：Candidates 具体 route view
      AgentContentPromptSurface.tsx  # 当前已落地：Prompt 具体 route view
      AgentGenerationJobSurface.tsx  # 当前已落地：Generation Job 具体 route view
      AgentImpactSurface.tsx  # 当前已落地：Impact 具体 route view
      AgentPreviewTimelineSurface.tsx  # 当前已落地：Preview Timeline 具体 route view
      AgentProjectStatusSurface.tsx  # 当前已落地：Project Status 具体 route view
      AgentResourceDetailSurface.tsx  # 当前已落地：Resource Detail 具体 route view
      AgentResourceLibrarySurface.tsx # 当前已落地：Resource Library shell/params
      AgentSurfaceShell.css
    routes/
      agent/
    data-adapters/
      cloud-data-service.ts
      local-data-service.ts
      desktop-bridge.ts
      mcp-proxy.ts
    state/
  public/
  scripts/
```

说明：

- `surface/project` 是可独立启动或同部署的 Web 程序共享包；当前 root 入口已落地 route/URL/handoff contract、Resource Library browser-neutral model/view props contract、resource query key contract 和 browser interaction contract，`@movscript/project-surface/resource-browser` 已落地 Resource Library controller runtime、browser view composer、adapter contract 和 Data Service REST adapter，`@movscript/project-surface/react` 已落地第一批共享 React shell、Candidates、Prompt、Generation Job、Impact、Preview Timeline、Project Status 和 Resource Detail 具体 route view，并拥有 Resource Library shell/params contract；后续继续收敛 Resource Library 更细的 UI primitive/slot contract。
- `services/local-surface-host` 是独立 `@movscript/project-surface-web` service program package，负责把 `surface/project` 编译成可被 Desktop、Plugin full local 或 local full node 承载的浏览器程序；云端由 `services/web-surface-host` 承载。
- Desktop 嵌入它，Cloud 部署它，Local Runtime 可选择同部署它。
- 它不直接实现 Data Service API，也不实现 MCP transport；只通过 data adapter 访问后端或 bridge。

`apps/plugin` 目标结构：

```text
apps/plugin/
  application.manifest.ts
  startup.manifest.ts
  package.json
  tsconfig.json
  tsup.config.ts
  src/
    agent-mcp.ts
    agent-mcp.program.manifest.ts
  templates/
    .agent-plugin/
    .provider-plugin/
    .mcp.json
  skills/
  assets/
  bin/
    movscript-agent-mcp
  scripts/
    build-plugin-artifact.ts
```

`plugins/movscript` 目标结构：

```text
plugins/movscript/
  .agent-plugin/
  .provider-plugin/
  .mcp.json
  bin/
    movscript-agent-mcp
    movscript-agent-mcp.mjs
  skills/
  assets/
```

说明：

- `apps/plugin` 是 MovScript Agent Plugin App 源码容器，有 `application.manifest.ts` 和 `startup.manifest.ts`。
- `plugins/movscript` 是 agent plugin 分发物，不放应用源码和 workspace 构建配置。
- `src/agent-mcp.ts` 仍然只能是 thin wrapper。
- `bin/movscript-agent-mcp.mjs` bundle `packages/mcp-host`，不复制 Desktop 或 Data Service 代码。

### 重构落地原则

本次重构按目标结构直接落地，不设计旧目录、旧 wrapper、旧 bridge 或旧入口保留期。旧目录只作为“当前代码来源”被移动和拆分，不作为目标架构的一部分。

落地步骤：

1. **建立目标目录**
   - 创建 `apps/desktop`、`apps/cloud`、`apps/plugin`。
   - 创建 `services/data-service`、`services/project-service`、`services/editing-service`、`services/local-surface-host`、`services/admin-web`、`services/media-pipeline`。
   - 创建 `packages/runtime-contracts`、`packages/app-runner`、`packages/project`、`packages/data-client`、`surface/project`、`packages/admin`。

2. **移动源码到目标归属**
   - `apps/frontend` 的 Desktop shell/Electron/native bridge 移到 `apps/desktop`。
   - `apps/desktop` 的 `/agent/*` shared surface 移到 `surface/project`，运行 entry 移到 `services/local-surface-host`。
   - `apps/backend` 的 Go server/API/migrations/job orchestration 移到 `services/data-service`。
   - `apps/backend` 的 cloud deployment/ops/control 配置移到 `apps/cloud`。
   - `apps/admin` 的 Admin Web 程序源码移到 `services/admin-web`；后续需要复用时再把 shared UI 抽到 `packages/admin`。
   - `plugins/movscript` 的源码、构建配置、templates、skills source、assets source 移到 `apps/plugin`；`plugins/movscript` 只保留构建后的 agent plugin artifact。

3. **硬化 manifests**
   - 每个 App 必须有 `application.manifest.ts` 和 `startup.manifest.ts`。
   - 每个 service 必须有 `program.manifest.ts`，并声明独立进程 entry、transport、health、logs、dependsOn、provides。
   - `tools/runtime-registry.mjs` 必须校验 serviceName 唯一、service entry 独立进程化、Application/Scenario 引用的 program manifest 存在、Cloud App 不声明启动 Plugin-startable services；后续继续扩展 Desktop 和 Plugin 不重复拥有同类 local runtime 的运行期校验。

4. **删除旧路径和旧入口**
   - 删除 `apps/frontend`、`apps/backend`、`apps/admin` 的应用形态。
   - 删除 `plugins/movscript` 中的源码、tsconfig、tsup、package 构建配置。
   - 删除旧 `mcp-stdio-bridge`，`.mcp.json` 只启动 `bin/movscript-agent-mcp`。
   - 删除指向旧目录的 workspace filter、CI、release、Docker、docs、tests 引用。

5. **收紧依赖边界**
   - 禁止 `apps/*` 之间直接 import 内部实现。
   - 禁止 `services/*` import `apps/*`。
   - 禁止 `packages/core`、`surface/project`、`packages/admin` import Electron、Desktop bridge、Cloud internal 或 plugin bin。
   - 禁止 `mcp-host` 直接读写 project source、直接运行 interpreter 或直接实现 candidate/project/editing 业务。
   - 所有跨 service 调用必须走 HTTP/REST、stdio、local IPC 或稳定 client contract。

#### 验证命令

重构完成后的最小验证集：

```bash
pnpm -r --if-present typecheck
pnpm -r --filter "./packages/*" --if-present build
pnpm --filter @movscript/mcp-host build
pnpm --filter @movscript/plugin-movscript build
pnpm --filter @movscript/desktop test
pnpm --filter @movscript/admin-web test
```

Go/Data Service 侧验证入口：

```bash
cd services/data-service
go test ./...
node scripts/build.mjs
```

插件分发物至少需要通过 stdio smoke：

```bash
printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | ./plugins/movscript/bin/movscript-agent-mcp
```

目标结构必须通过这些静态检查：

```bash
rg "apps/desktop|services/data-service|plugins/movscript/src|plugins/movscript/tsup.config|plugins/movscript/package.json"
rg "backend-api|movscript.runtime.backend-api|backend-worker|movscript.runtime.backend-worker"
rg "Agent Surface App|Admin App|apps/agent-surface"
rg "in-process|in_process|同进程|compat|compatibility|legacy|alias|mcp-stdio-bridge"
```

这些检查在目标结构中必须为零，除非命中的是本文档用于说明禁止项的段落。

#### 禁止的迁移方式

- 不保留 `apps/desktop`、`services/data-service`、`apps/admin` 作为目标 alias。
- 不保留 `mcp-stdio-bridge` 作为兼容入口。
- 不把任何 service 作为另一个 service 的 in-process adapter。
- 不把 `project-service`、`editing-service` 直接实现到 Desktop UI 或 mcp-host tool handler 里。
- 不让 `packages/core`、`surface/project`、`packages/admin` import Electron、Desktop bridge、Cloud internal 或 plugin bin。
- 不把 `apps/cloud` 设计成本地模式应用；本地模式是同名 service 的 `profile=local`，由 Desktop/Plugin/CLI/dev runner 监督启动。

### 切分原则

1. **业务语义下沉，宿主逻辑上浮**
   - domain/generation/resource/candidate/editing pure model 属于 core 或领域包。
   - stdio、进程启动、runtime 检测、插件安装路径属于 mcp-host/plugin。

2. **同名 MCP tool 只有一个业务实现**
   - `domain_interpret`、`generation_submit` 等工具不得在插件里重写。
   - 插件可以包装 transport，但不得复制 tool schema 和 action 逻辑作为长期方案。

3. **Desktop 是增强宿主，不是核心依赖**
   - Desktop 可注入 focus、route、selected entity、mediaPipeline。
   - 没有 Desktop 时，project/domain/resource/generation 核心工具仍应可用。

4. **本地项目 Surface 必须有本地数据通道**
   - 页面可以由 local web、Desktop webview 或 cloud web shell 提供。
   - 只要 project source 在本地，数据读取和 source 写入必须经过本地 MCP host 或本地 API proxy。

5. **cloud service profile 不等于云端 source**
   - 第一阶段允许 cloud service profile + local source。
   - 完整 cloud project surface 需要 Cloud Workspace Source API。

6. **capability gating 优先于隐式失败**
   - 工具不可用时返回结构化 `unavailable`，说明缺哪类 runtime。
   - 不用 Desktop-only exception 文本作为用户引导。

7. **插件产物要自包含**
   - Agent provider 安装插件后不应依赖 monorepo workspace `node_modules`。
   - `bin/movscript-agent-mcp.mjs` 应 bundle 运行所需的 `@movscript/*` 包。

### 复用优先原则

后续改造的默认判断是：能复用 package 就不在 Desktop App、MovScript Agent Plugin App、Cloud App 里重新实现。运行时可以有多个 service instance，但业务实现必须只有一套。

1. **Desktop App 和 MCP host 共用同一套 MCP 能力**
   - MCP tool definitions、input/output schema、tool router、capability gating 应来自 `packages/core` 和 `packages/mcp-host`。
   - Desktop App 如果需要暴露 Agent/MCP 能力，应 embed 或启动 `packages/mcp-host`，而不是维护一份 Desktop 专属 MCP server。
   - MovScript Agent Plugin App 的 `bin/movscript-agent-mcp.mjs` 是 `packages/mcp-host` 的 Agent provider 打包外壳，不是第二套 MCP 实现。

2. **Desktop App、MCP host、cloud service instances 共用同一套 Project Service**
   - Project discovery、open/create/import、workspace config、source path resolution、migration、lock/watch 应通过 `movscript.project.service` 暴露，contract/client 放在 `packages/project`。
   - Desktop App 负责项目选择 UI、本地权限确认和 service client wiring；MCP host 负责从 cwd/config/env/session 解析调用上下文；cloud deployment/orchestrator 负责启动 `profile=cloud` 的 Project Service。
   - 三者不得各自定义 project id、project uid、source root、workspace config 的解释规则。

3. **Desktop App 和 Surface Host program 共用同一套 Agent Surface**
   - `/agent/...` 页面应作为 Web-first surface 实现，Desktop App 通过 WebView/route shell 嵌入，`movscript.local-surface.host` 可独立启动，Agent/provider 通过 URL 打开。
   - 同一个 surface 使用不同 data adapter：本地项目走 Desktop bridge/local service profile，本地 agent 走 local MCP/API proxy，云端项目走 cloud service profile API。
   - Desktop App 可以提供本地文件权限、media preview、native dialog 等增强，但不应 fork 一套只在 Desktop App 内存在的 Agent Surface。

4. **服务部署和代码依赖分开看**
   - 云端“同时启动 Data Service + Agent Surface + mcp-host”是部署拓扑，不表示 `apps/cloud` 要 import `packages/mcp-host` 作为 `data-service` 内部模块。
   - 最好把 server-side MCP host 作为独立 service entry 启动，它通过 Data Service API/client 访问服务端能力。
   - 这样可以让 Agent 本地 stdio host、云端 remote MCP host、Desktop embedded MCP host 都来自同一套 host package。

### 可组合 Runtime 原则

共享 package 还不够，运行时也要可组合。推荐把 MovScript runtime 拆成一组明确的 service clients 和 capability providers，再由 `mcp-host` 作为 MCP 进程的 composition root 在启动时组装。

`mcp-host` 的职责不是“实现所有能力”，而是“为当前进程选择并持有一套协议 adapter 和 service client 单例”：

```ts
type MovScriptRuntimeComposition = {
  config: RuntimeConfigProvider
  session: SessionProvider
  data: DataServiceClient
  project: ProjectServiceClient
  editing: EditingServiceClient
  tools: ToolRegistry
  capabilities: CapabilityRegistry
  surface: AgentSurfaceProvider
  telemetry: RuntimeTelemetry
}
```

组合规则：

- 每个 service client/provider 都是小接口，可以有 local、cloud、desktop、memory/test 等实现。
- `mcp-host` 启动时只创建一个 composition，作为该 MCP 会话进程的单例 runtime context。
- MCP tool handler 不直接读取环境变量、文件路径或全局 session，而是从 composition 中取依赖。
- Desktop、server-side MCP、Agent plugin 不 fork 业务逻辑，只传入不同 service clients、adapters 或 bootstrap options。
- 单例范围是“单个 MCP host 会话进程”，不是全局机器单例，也不是本机 runtime registry；多个项目、多账号、多 agent session 需要通过 session/project scope 显式表达。
- `mcp-host` 不提供 service self-registration、lease、heartbeat。服务发现由 daemon/control plane 和 profile 决策完成：本机 local runtime 由 `movscript.local-node` 写入 AuthProvider/Data/Project/Editing/Canvas/Surface/Media endpoints；cloud/external runtime 由 cloud profile/service discovery 提供 endpoints。
- Service clients 只能由 application owner、launcher 或 deployment bootstrap 注入 composition；tool handler 不自行寻找服务，不自行启动服务。

推荐启动入口：

```ts
const composition = await createMovScriptRuntimeComposition({
  hostKind: 'agent_plugin' | 'desktop_connected' | 'server_side_mcp' | 'local_dev',
  transport: 'stdio' | 'http' | 'ipc',
  runtimeServicePreference: 'auto' | 'local' | 'cloud',
  projectHint: cwdOrConfiguredProject,
})

await startMCPHost({
  composition,
  transport,
})
```

这样 `packages/mcp-host` 可以同时服务三类入口：

- Agent plugin：创建 `agent_plugin + stdio + auto Data Service` composition。
- Desktop connected：创建 `desktop_connected + http/ipc + desktop bridge adapters` composition。
- cloud service profile：创建 `server_side_mcp + http/remote MCP + cloud service adapter` composition。

无论哪一种入口，project/domain/source/interpret 语义都应通过 `ProjectServiceClient` 进入独立运行的 `movscript.project.service`。测试可以使用 mock Project Service server 或 memory fake，但生产和开发 runtime 不应绕回“直接读 source + 直接跑 interpreter”的临时路径。

### Composition 单例边界

`mcp-host` 负责组合和持有这些单例：

| 单例 | 生命周期 | 说明 |
| --- | --- | --- |
| Runtime config | host process | 解析 env、config file、启动参数、上次选择。 |
| Session provider | host process，必要时可 revalidate | 统一 local/cloud token、realm、workspace identity；云端来源是 Auth Service，本地来源是 local AuthProvider。 |
| Auth Service client | host process | 由 app owner/service wiring 注入，负责 Auth Service base URL、login/status、opaque key introspection/cache、revoke/rotate 和 claims。 |
| Data Service client | host process | 由 app owner/service wiring 注入，负责 Data Service local/cloud base URL、auth header、resource/job/provider 等 runtime 能力。 |
| Project Service client | host process 或 selected workspace scope | 由 app owner/service wiring 注入，负责 project discovery/open/create/import、source read/write、candidate decision view、inspect/interpret/read-model。 |
| Editing Service client | host process 或 selected project scope | 由 app owner/service wiring 注入，负责 timeline/edit plan/preview/render request。 |
| Tool registry | host process | 合并 core tools、host tools、capability-gated tools；只注册 MCP tool，不注册本机 service。 |
| Capability registry | host process，可动态刷新 | 描述 render、mediaPipeline、desktop bridge、surface、Data Service、project source 是否可用；只服务当前 MCP 会话。 |
| Agent surface provider | host process | 根据当前 mode 返回 cloud/local/desktop embedded surface URL。 |

这些单例只在 composition root 里创建。业务包里不应出现隐藏单例，例如直接从模块顶层读取 `process.env` 后缓存、直接创建 fetch client、直接持有当前 project path。需要缓存时，由 provider 明确管理。

### Adapter 组合矩阵

同一套 composition interface 可以组合出不同运行模式：

| 场景 | DataServiceClient | ProjectServiceClient | Project source mode | AgentSurfaceProvider | 备注 |
| --- | --- | --- | --- | --- | --- |
| Agent + local service profile | local HTTP client | local Project Service client | Git/filesystem source + local candidate API | local web 或 none | 不依赖 Desktop App。 |
| Agent + cloud service profile + local source | cloud HTTP client | local Project Service client with cloud candidate API | Git/filesystem source + cloud candidate API | cloud web + local proxy hint | 第一阶段推荐支持。 |
| Agent + full cloud source | cloud HTTP client | cloud Project Service client | cloud source API + cloud candidate API | cloud web | 无本地项目也可工作。 |
| Desktop App + local service profile | local/desktop bridge client | Desktop-supervised local Project Service client | Git/filesystem source + local candidate API | desktop embedded web surface | Desktop App 只增强 shell 和权限。 |
| Desktop App + cloud service profile | cloud HTTP client | cloud/local hybrid Project Service client | cloud source API 或 synced Git source + cloud candidate API | cloud web 或 desktop embedded surface | UI 复用 surface。 |
| Server-side MCP | internal/cloud Data Service client | cloud Project Service client | cloud source API + cloud candidate API | cloud web | 由 cloud deployment/orchestrator 与其他 cloud service 一起部署，但不作为 `data-service` 内部模块。 |
| Tests | memory Data Service client | memory Project Service client | memory source + memory candidate decisions | noop/test surface | 单元测试不需要 Desktop App/Cloud App。 |

### Tool Handler 组合原则

MCP tool handler 应接收 runtime context，而不是自行创建依赖：

```ts
type ToolHandlerContext = {
  runtime: MovScriptRuntimeComposition
  request: MCPRequestContext
}
```

推荐形态：

```ts
registerTool('domain_source_read', schema, async (input, ctx) => {
  return ctx.runtime.project.readSource({
    project: input.project,
    path: input.path,
  })
})
```

不推荐形态：

```ts
registerTool('domain_source_read', schema, async (input) => {
  const root = process.env.MOVSCRIPT_WORKSPACE_DIR
  return fs.readFile(path.join(root, input.path), 'utf8')
})
```

这样做的直接收益：

- Agent plugin、Desktop、cloud MCP 使用同一个 tool handler。
- local source 和 cloud source 只替换 adapter。
- 单元测试可以用 memory composition 覆盖核心行为。
- 运行时状态可以集中从 `movscript_runtime_status` 解释，而不是每个 tool 抛不同错误。

### 文件夹内职责

`packages/mcp-host` 推荐结构：

```text
packages/mcp-host/
  package.json
  tsconfig.json
  tsup.config.ts
  src/
    index.ts      # public exports
    stdio.ts      # stdio transport and JSON-RPC host dispatch
    cli.ts        # package bin entry, only responsible for calling startMCPStdioHost
    composition.ts # createMovScriptRuntimeComposition, composition root
```

后续如果文件变大，应按职责拆分：

```text
src/composition/create.ts    # create runtime composition
src/composition/types.ts     # runtime composition/provider interfaces
src/composition/singletons.ts # per-process singleton lifecycle
src/runtime/status.ts       # runtime status detection
src/runtime/configure.ts    # runtime configure
src/runtime/probes.ts       # Data Service/Desktop/project probes
src/protocol/stdio.ts       # stdio line protocol
src/tools/definitions.ts    # host-only MCP tool definitions
src/tools/router.ts         # host-only tool router
src/adapters/local.ts        # local service + Project Service adapters
src/adapters/cloud.ts        # cloud service + Project Service adapters
src/adapters/desktop.ts      # desktop bridge adapters, optional
```

拆分条件：

- 单文件超过约 300-400 行且出现两类以上职责。
- probe/configure/tool definitions/router 出现独立测试需求。
- runtime status 被 Desktop 或 CLI 复用。

`apps/plugin` 推荐结构：

```text
apps/plugin/
  package.json
  tsconfig.json
  tsup.config.ts
  src/
    agent-mcp.ts            # thin wrapper around @movscript/mcp-host
  templates/
    .agent-plugin/plugin.json
    .provider-plugin/plugin.json
    .mcp.json
  bin/
    movscript-agent-mcp     # shell launcher, locates Node.js
  skills/
  assets/
  README.md
```

`src/agent-mcp.ts` 必须保持很薄。它只调用 `startMCPStdioHost()`，不应添加业务分支。任何需要复用的逻辑都应进入 `packages/mcp-host` 或 `packages/core`。

### 编译产物矩阵

MovScript 改造后的编译产物分为 11 类。它们不是 11 套业务实现，而是围绕同一组 shared packages、service programs 和应用容器形成的不同交付外壳。

| 产物 | 目录 | 主要消费者 | 定位 | 包含什么 | 不包含什么 |
| --- | --- | --- | --- | --- | --- |
| Core Library | `packages/core` | Cloud App、Desktop App、mcp-host、tests | 库产物，MovScript domain/source/tool schema 的核心库 | domain schema、source read/upsert、tool definitions、JSON-RPC tool dispatch helpers、纯函数校验 | stdio server、HTTP server、Electron UI、Agent plugin manifest、云端 auth |
| MCP Host Package | `packages/mcp-host` | plugin bundle、开发者本地调试、未来其他 agent runtime | 程序/库产物，Headless MCP host 的 composition root | stdio JSON-RPC、runtime discovery、Data Service local/cloud selection、project source probing、host-level tools | Agent plugin metadata、Desktop window、Data Service business API implementation |
| Plugin App | `apps/plugin` | agent plugin runtime source | 应用产物，Agent 插件形态的接入应用容器 | plugin launcher 源码、manifest templates、skills/assets source、构建脚本、bundle 配置 | 可复用库 DTS、Desktop App、Cloud App、最终安装缓存 |
| Agent Plugin Artifact | `plugins/movscript` | Agent/provider plugin runtime | 插件分发产物，可被 Agent/provider 安装或发现 | plugin manifests、skills、assets、shell launcher、自包含 MCP host bundle | 应用 manifest、workspace tsconfig、可复用源码、Desktop App、Cloud App |
| Auth Service Artifact | `services/auth-service` | cloud deployment/orchestrator、外部身份服务部署、CLI/测试 | 可独立启动、可 health check 的身份服务产物 | auth server entry、program manifest、opaque `sk-...` key 签发/撤销/introspection、session/principal/claims/RBAC runtime | Data/Project/Editing 业务 API、Desktop shell、Agent plugin manifest、Cloud deployment control plane、JWT/JWKS、本地 sidecar |
| Service Program Artifacts | `services/data-service`、`services/project-service`、`services/editing-service`、`services/canvas-service`、`services/media-pipeline` | `movscript.local-node` daemon、cloud deployment/orchestrator、dev runner | 可独立启动、可 health check 的服务程序产物 | server entry、program manifest、service runtime code、migrations、service-local adapters、health/telemetry hooks；`data-service` 当前内置 job runner；通过 AuthProvider 授权 | Application owner、Desktop shell、Agent plugin manifests、Cloud deployment control plane、Agent Surface UI、Auth Service 实现 |
| Local Runtime Daemon Bundle | `apps/plugin` 构建，来源于 service packages/program entries | MovScript Agent Plugin Artifact、Desktop ensure/attach、开发者本地调试 | 本地 daemon 产物，让插件和 Desktop 复用同一个本机 runtime | `movscript.local-node.control`、local AuthProvider、local `data-service`（仅 local data plane）、`project-service`、`editing-service`、`canvas-service`、`local-surface-host`、`media-pipeline` 的启动入口和静态资源；`data-service` 内置 job runner | Electron Desktop shell、Cloud App deployment control plane、第二套业务实现、local `auth-service` |
| Desktop App | `apps/desktop` | 普通桌面用户、本地项目 surface | 应用产物，本地产品壳、交互壳和服务对接容器 | UI、project picker、service clients、media preview UI、Desktop-only bridge、可选 local service supervisor | Agent plugin bundle、Project/Editing/Data Service 业务实现、Cloud App 多租户控制面、第二套 MCP 实现 |
| Cloud App | `apps/cloud` | deployment、ops、平台运维 | 应用/部署产物，cloud service deployment 描述和运维入口 | cloud profile、deployment manifests、migration/ops command、service config templates | Data/Project/Editing/MCP/Surface 服务源码、Desktop-only local file access、Agent plugin manifest、Desktop UI、Plugin-startable service 内嵌启动 |
| Surface Host program | `surface/project` + `services/local-surface-host` | Agent/provider 打开的 surface、Desktop App 嵌入 surface、云端 web | 程序/页面产物，Desktop/Web 共用的项目和任务 surface 程序产物 | browser UI、agent handoff pages、workspace views、review/approval panels、route/URL handoff contract、共享 React shell、可切换 data adapter | 本地文件直读能力、Electron-only APIs、stdio MCP host、Data Service API |
| Admin Web program | `services/admin-web`，后续可抽 `packages/admin` 共享 UI | 平台管理员、组织管理员、本地高级设置/运维 | 程序/页面产物，管理控制面程序 | admin web routes、org/user/provider/job/resource/usage/audit 管理 UI、admin auth/session 集成 | Agent Surface 项目工作流、MCP transport、Data Service 业务实现、worker 内部实现 |

这 11 类产物里，真正必须先落地的是前四个：`Core Library`、`MCP Host Package`、`Plugin App`、`Agent Plugin Artifact`。它们让 MovScript Agent Plugin App 可以在不安装 Desktop App 的情况下作为 Agent 入口工作。若目标是“不启动 Desktop 也能获得完整本地项目、剪辑和 surface 能力”，则还需要落地 `Service Program Artifacts` 和 `Local Runtime Sidecar Bundle`，本地身份由 local AuthProvider 提供，不要求 `Auth Service Artifact`。Desktop App、Cloud App 和 Admin Web program 可以按产品节奏继续演进，但必须遵守同一组共享组件边界。

### 共享组件边界

所有产物应共用下列组件，避免 Desktop App、Cloud App、MovScript Agent Plugin App 各自实现一套 MovScript 语义：

| 共享组件 | 建议位置 | 被哪些产物共用 | 说明 |
| --- | --- | --- | --- |
| Domain schema/types | `packages/core` | 全部产物 | Project、Domain Source、Content Unit、Candidate、Selection、Artifact、Diagnostics 的类型定义只能有一份。 |
| Source read/upsert model | `packages/core`，需要文件系统时由 `packages/workspace` 适配 | core、mcp-host、Desktop App、Project Service | read/upsert 的语义属于核心；本地文件、云端 DB、远程 API 只是 adapter。 |
| Tool definitions | `packages/core` | mcp-host、plugin、tests、未来外部 MCP host | tool name、input schema、output shape 必须统一，host 只负责暴露和路由。 |
| Runtime composition contracts | `packages/mcp-host`，稳定后可拆到 `packages/runtime` | mcp-host、Desktop App、server-side MCP、tests | 定义 provider interface、composition root、capability registry、runtime context，不包含 UI。 |
| Interpreter/read-model | `packages/interpreter` 或先保留在 `packages/core` 后续拆出 | Desktop App、Project Service、mcp-host | `interpret`、diagnostics、stale impact、derived read model 不应写在 UI 或 plugin bundle 里。 |
| Project management | `packages/project` | Desktop App、mcp-host、Project Service | project discovery、open/create/import、project uid、workspace config、source root resolution、migration contract 必须统一。 |
| Workspace adapter | `packages/workspace` | Desktop App、mcp-host、本地开发测试 | 只处理本地项目目录发现、文件读写、watch、lock、migration，不包含产品 UI。 |
| Auth service client/contracts | `packages/auth-client` | mcp-host、Desktop App、Data Service、Project Service、Editing Service、Agent Surface、Admin Web、CLI | 统一 login/status/logout、opaque key introspection/cache、revoke/rotate、claims、service credential；身份语义不能散落在 Data Service client 或 UI。 |
| Data service client | `packages/data-client` | mcp-host、Desktop App | 统一访问 Data Service local/cloud profile 的 API、auth header、health probe、错误归一化。 |
| Prompt/generation contracts | `packages/prompt` + `packages/core` | Data Service、Project Service、Desktop App、tests | prompt 组装、provider route contract、generation request/response schema 要共享；provider credential 不能进入 plugin bundle。 |
| Media/editing contracts | `packages/editing` | Desktop App、Editing Service、mcp-host tools | timeline、render job、media artifact contract 共享；Electron media pipeline 是 Desktop/Data Service adapter。 |
| Agent Surface UI | `surface/project` + `services/local-surface-host` | Desktop App、agent-opened browser | 同一套路由和组件，按运行环境切换 data adapter，避免 Desktop App/Agent Surface surface 分叉。 |
| Admin UI shell | `packages/admin` + shared UI package | Desktop App、cloud deployment/orchestrator | 管理后台可以复用 design system、auth/session 和 data-client，但不能复用 Agent Surface 的 project workflow 作为管理界面。 |

共享组件遵循一个原则：业务语义上移到 package，运行环境差异下沉到 adapter。MovScript Agent Plugin App、Desktop App、Cloud App 都不应该重新定义 MovScript domain 规则。

### 编译原则

Monorepo 编译分三层：

1. shared package 编译：产出可被其他 package import 的库。
2. runtime host 编译：产出可直接运行的 Node entry。
3. product artifact 编译：产出面向安装、部署或发布的完整外壳。

推荐的编译顺序：

```text
packages/core
  -> packages/workspace / packages/interpreter / packages/editing / packages/prompt
  -> packages/mcp-host
  -> apps/plugin
  -> plugins/movscript artifact

packages/core
  -> services/data-service / services/project-service / services/editing-service

packages/core + packages/workspace
  -> apps/desktop

packages/runtime-contracts + service manifests
  -> apps/cloud

packages/core + data-client
  -> surface/project
```

这个顺序不是要求所有产物每次都完整构建，而是定义依赖方向。局部开发时可以只构建被修改链路上的产物。

`packages/core` 编译原则：

- 输出 ESM/CJS/DTS，作为 monorepo 内部和测试可复用库。
- 不能引用 `apps/*`、`plugins/*`、Electron、stdio、HTTP server。
- 可以包含 tool schema 和纯 dispatch helper，但不能绑定具体 transport。
- 任何 domain/source/candidate/selection 的类型变更，都必须先从这里开始。

`packages/mcp-host` 编译原则：

- 输出 ESM/CJS/DTS。
- 不 bundle `@movscript/core`，保持 workspace package 的正常库形态。
- `src/stdio.ts` 只导出函数，不自启动。
- `src/cli.ts` 才是 package bin 自启动入口。
- package bin 指向 `dist/cli.js`。
- 可以依赖 `packages/core`、`packages/workspace`、`data-client`。
- 不能依赖 `apps/plugin`、`plugins/movscript`、Desktop App、Electron UI。
- 负责提供 composition root 和 per-process singleton lifecycle。
- adapter 实现可以放在 `packages/mcp-host` 初期收敛；稳定后再拆到 `packages/data-client`、`packages/project`、`packages/workspace`。

`apps/plugin` 编译原则：

- 输出 ESM bundle 到 `bin/movscript-agent-mcp.mjs`。
- bundle 所有 `@movscript/*` workspace 包，保证插件安装后自包含。
- 不清理整个 `bin/` 目录，因为里面有手写 shell launcher 和 provider manifest 需要的固定入口。
- 不生成 DTS，插件 runtime 不是被外部 import 的库。
- `bin/movscript-agent-mcp` 必须有可执行权限。

建议 `apps/plugin/tsup.config.ts` 保持：

```ts
export default defineConfig({
  entry: {
    'movscript-agent-mcp': 'src/agent-mcp.ts',
  },
  outDir: 'bin',
  format: ['esm'],
  bundle: true,
  noExternal: [/@movscript\/.*/],
  platform: 'node',
  target: 'node20',
  splitting: false,
  dts: false,
  clean: false,
  outExtension: () => ({ js: '.mjs' }),
})
```

`clean: false` 是刻意选择。若需要清理 bundle，只清理 `bin/movscript-agent-mcp.mjs`，不能删除整个 `bin/`。

Desktop App 编译原则：

- Desktop App 是产品应用产物，不是 agent runtime library。
- Desktop App 可以依赖 `packages/core`、`packages/workspace`、`packages/interpreter`、`packages/editing`。
- Desktop App 提供本地项目 surface、本地媒体预览、本地项目文件权限和用户确认 UI。
- Desktop App 不应成为 MovScript Agent Plugin App 的必需依赖；MovScript Agent Plugin App 可以探测 Desktop App，但不能要求 Desktop App 已安装。

Cloud App 编译原则：

- Cloud App 是云端部署/运维应用产物，负责 cloud profile、deployment manifests、migration/ops command、cloud-control wrapper 和配置模板。
- Cloud App 可以引用 `packages/runtime-contracts`、service manifests、deployment adapters 和必要的 shared config 类型，但不应 import Data/Project/Editing/MCP/Surface service 的内部启动代码。
- 面向产品的稳定 HTTP/API surface 由独立 `movscript.data.service`、`movscript.project.service`、`movscript.editing.service` 等 cloud profile service 实例提供；Cloud App 自身最多暴露部署/运维控制面。
- `profile=local` 和 `profile=cloud` 应共享 service API contract，差异通过 service profile、auth、storage adapter 和 deployment manifest 体现，而不是通过两个应用目录体现。

Project Surface Host 程序编译原则：

- Surface Host program 是浏览器程序产物，用于让 agent 打开可视化 surface、让用户审阅/确认项目状态。
- 它应复用 `packages/core` 的类型、`data-client` 的 API client 和 shared UI primitives。
- Surface Host program 不直接读取本地文件；本地项目 surface 需要通过 Desktop bridge、local service profile 或本地 `movscript.mcp.host` 访问数据。
- 它不是 MCP server，也不是 plugin bundle。

### 产物原则

`packages/core` 发布或打包时必须包含：

- `dist/**`
- `package.json`
- 类型声明文件
- 必要的 schema/resource metadata

`packages/mcp-host` 发布或打包时必须包含：

- `dist/**`
- `package.json`
- package bin entry
- 类型声明文件

`apps/plugin` 构建出的 `plugins/movscript` 分发物必须包含：

- `.agent-plugin/**`
- `.provider-plugin/**`
- `.mcp.json`
- `assets/**`
- `skills/**`
- `README.md`
- `bin/movscript-agent-mcp`
- `bin/movscript-agent-mcp.mjs`

插件分发物不保留旧 bridge。`.mcp.json` 只允许启动 `bin/movscript-agent-mcp`，该入口直接进入 `movscript.mcp.host`。

Desktop App 发布产物必须包含：

- Electron app bundle
- frontend static assets
- main/preload/runtime code
- project surface UI
- local workspace adapter 所需迁移和资源

Cloud App 发布产物必须包含：

- deployment manifests
- cloud-control/ops wrapper
- migration/ops command
- service profile/config templates
- observability and healthcheck configuration

Auth/Data/Project/Editing Service 的 server entry、API/runtime code 和 job runner 属于对应 service program artifact；可以被 Cloud App 的 deployment manifests 引用，但不是 Cloud App 自身的内嵌发布内容。

Surface Host program 发布产物必须包含：

- browser static/server bundle
- route manifest
- API client configuration
- auth/session integration

不同产物之间不能通过复制编译输出互相依赖。例如 `apps/plugin` 不应复制 Desktop App 的 build output；它只 bundle `packages/*` 共享库并输出到 `plugins/movscript` 分发物。Desktop App 不应 import plugin 的 `bin/*.mjs`；如果需要 MCP host 能力，应依赖 `packages/mcp-host` 或通过 App Runner 启动 `movscript.mcp.host`。

### 按应用发布原则

发布脚本的顶层目标应按 Application 打包，而不是按旧目录名或单个 Program 打包。当前阶段只打包两个真正需要分发的 Application：Desktop App 和 MovScript Agent Plugin App。Cloud App 仍保留为部署/运维应用概念，但暂不进入发布脚本的 package target；CLI 也不作为本次 app release 目标。

建议发布目标先统一收敛为：

| 发布目标 | Canonical app target | 输入目录 | 输出产物 | 产物定位 |
| --- | --- | --- | --- | --- |
| Desktop Release | `desktop` | `apps/desktop` | Electron installer/app bundle，例如 dmg/zip/exe/AppImage | 用户安装的本地完整产品壳 |
| Agent Plugin Release | `plugin` | `apps/plugin` | `plugins/movscript` 目录或压缩包 | Agent/provider 可安装或可发现的插件分发物 |

暂不提供这些 package target：

| 非本阶段发布目标 | 处理方式 |
| --- | --- |
| `cloud` | Cloud deployment manifests、ops/migrate wrapper 和 service config 先作为源码/部署配置存在，不由 `release -- package` 生成云端分发包。 |
| `cli` | CLI 继续作为开发/自动化入口构建和测试，但不进入本次 app release 打包矩阵。 |

Service program 也可以单独 build/test，但它们的产物身份应是 `program artifact`，不应混成 Application release，也不作为本阶段独立 release package：

| Program artifact | 输入目录 | 谁引用 | 发布语义 |
| --- | --- | --- | --- |
| `movscript.auth.service` | `services/auth-service` | Cloud deployment、external auth deployment、test/dev cloud profile | 独立服务二进制/镜像/包，由部署系统监督启动；本地 Desktop/Plugin 不启动 |
| `movscript.data.service` | `services/data-service` | Desktop local、Plugin full local、Cloud deployment | 独立服务二进制/镜像/包，不属于 Cloud App 内嵌源码 |
| `movscript.project.service` | `services/project-service` | Desktop local、Plugin full local、Cloud deployment | 独立服务二进制/镜像/包，提供项目权威视图 |
| `movscript.editing.service` | `services/editing-service` | Desktop local、Plugin full local、Cloud deployment | 独立服务二进制/镜像/包，提供剪辑业务入口 |
| `movscript.local-surface.host` | `services/local-surface-host` 或 `surface/project/programs` | Desktop embed、Plugin full local、Cloud web deployment | Web program bundle，可被不同应用承载 |
| `movscript.mcp.host` | `packages/mcp-host` | Plugin stdio、Desktop child process、remote MCP deployment | MCP endpoint program package，不是应用 release |

发布脚本命名建议从“目录/实现名”迁移到“应用目标 + 动作”：

```text
pnpm release -- check
pnpm release -- package --app desktop --platform darwin --arch arm64 --unsigned
pnpm release -- package --app plugin
pnpm release -- collect --app desktop
pnpm release -- collect --app plugin
pnpm release -- collect --app all
```

`collect --app all` 只是本地/CI 聚合收集器，用于把已生成的 Desktop 和 Agent Plugin release assets 一次性写入同一个 `release-artifacts` 目录和同一份 `SHA256SUMS.txt`；它不是第三个 package target，不能被 `package --app all` 接受。

不做短期兼容。旧命令应在发布脚本重构时直接迁移或删除，目标语义统一指向 app：

| 旧命令 | 目标语义 |
| --- | --- |
| `release:package:unsigned` | 替换为 `release -- package --app desktop --unsigned` |
| `release:package:signed` | 替换为 `release -- package --app desktop --signed` |
| `package-desktop` | 替换为 `package --app desktop` |
| `prepare-desktop-package` | 替换为 `prepare --app desktop` |

长期不保留 `frontend`、`backend`、`admin` 作为发布目标名：

- `frontend` 是旧 Desktop 实现目录名，发布目标应叫 `desktop`。
- `backend` 是旧 Data Service 实现目录名，不能代表 Cloud App；服务发布应叫 `program movscript.data.service`，云端部署发布应叫 `cloud`。
- `admin` 是 Web program/control surface，不是一等 Application release；它可以被 Desktop advanced profile 或 cloud deployment 引用。

发布脚本的职责边界：

1. `check`：校验版本、release notes、manifest、workspace dependency、app/program 边界和 package resource contract。
2. `build --app <app>`：按应用构建它自己的 wrapper、manifest、静态资源和需要收集的 program artifact。
3. `build --program <serviceName>`：只构建某个 service/program，不生成应用安装包，也不进入 release collect，除非被 `desktop` 或 `plugin` packaging manifest 显式声明为随包 sidecar。
4. `package --app <app>`：生成最终应用分发物。
5. `collect --app <app>`：只收集该应用 release 需要上传或分发的文件；`collect --app all` 可以聚合 Desktop + Plugin 两个当前发布应用的产物。
6. `smoke --app <app>`：按应用 smoke test，例如 Desktop app 启动、Plugin stdio initialize。

按应用打包时，每个 app release 必须声明自己的 packaging manifest。manifest 是脚本入口的事实来源，而不是把路径写死在 release workflow 里：

```ts
type AppPackagingManifest = {
  appId: 'desktop' | 'plugin'
  applicationId: string
  sourceDir: string
  buildSteps: string[]
  programArtifacts: Array<{
    serviceName: string
    required: boolean
    profile: 'local' | 'cloud' | 'managed-local' | 'dev'
    source: string
    output: string
  }>
  packageOutputs: Array<{
    kind: 'installer' | 'plugin' | 'archive'
    path: string
  }>
  verify: string[]
  smoke: string[]
}
```

各应用的打包规则：

- `desktop` release 可以收集 local profile 所需的 service program artifact、Project Surface Host 静态资源和 ffmpeg/media 资源，但不能收集 `plugins/movscript` 插件分发物作为 Desktop 内部依赖。
- `plugin` release 必须自包含 Agent/provider 运行所需的 launcher、skills、manifest 和 `movscript.mcp.host` bundle；full local profile 可以额外收集 local service program artifact 和 Project Surface Host bundle，但不能收集 Desktop App。
- Cloud deployment 和 CLI 可以继续有 build/check 脚本，但不进入当前 release package/collect/smoke 的 app target。

因此，当前发布脚本未来确实应该调整为“按 app 打包”，但本阶段只接受 `desktop` 和 `plugin` 两个 app target。这不表示 service 不构建；service 应以 program artifact 的形式独立 build/test，并只在被 Desktop/Plugin packaging manifest 显式声明时随包收集。最终 release workflow 的核心判断应是：

```text
本阶段 release 上传和分发的是 app。
app 启动、监督或连接 program。
program 复用 package。
package 承载业务语义和 contract。
```

### GitHub Pages 分发入口

GitHub Pages 是用户看到的默认安装入口，也必须按 `desktop` / `plugin` 两个 app release 组织，而不是只展示 Desktop 下载。页面需要同时提供两条清晰路径：

| 页面入口 | 面向用户 | 安装方式 | 说明 |
| --- | --- | --- | --- |
| Agent Plugin only | 只想在 Codex/Agent/provider 中使用 MovScript，不想安装 Desktop 的用户 | 命令行安装 Agent Plugin | 安装 `plugins/movscript` 分发物、provider manifest、`movscript daemon` 和兼容 `movcli`；不安装 Desktop App；首次本地执行时 ensure/attach `movscript.local-node`。 |
| Desktop App | 希望使用本地可视化产品壳、项目工作台和本地交互体验的用户 | 桌面安装脚本 + 手动下载安装包 | 安装 Electron Desktop App；Desktop 复用 `movscript.local-node` daemon，并提供 GUI、bridge 和 focus 能力。 |

页面主 CTA 不应再是单一的 “Install MovScript”，而应拆成两个并列入口：

```text
Use with Agent
  curl -fsSL https://movscript.github.io/movscript/install-plugin.sh | sh

Install Desktop
  curl -fsSL https://movscript.github.io/movscript/install-desktop.sh | sh
  or download macOS/Windows installer from GitHub Releases
```

命名规则：

- `install-plugin.sh` 是 Agent Plugin App 的 canonical installer，只安装插件分发物。
- `install-desktop.sh` 是 Desktop App 的 canonical installer，只安装桌面应用。
- `install.sh` 不应继续作为含义不明的长期入口；当前已有脚本如果保留，应在页面和文档中明确它只是 Desktop installer 的旧入口，并在发布脚本重构时迁移到 `install-desktop.sh`。
- 两个安装脚本都从 GitHub Releases 读取 latest，也都支持 `--release <tag>`、`--repo <owner/repo>`、`--dry-run`，但默认安装目标不同。

Agent Plugin only 安装脚本职责：

1. 根据 provider 选择安装目标；默认先支持 Codex，后续扩展其他 Agent provider。
2. 下载 `plugin` release 产物，例如 `movscript-agent-plugin-<version>.zip` 或等价目录包。
3. 校验 sha256/checksum 和 manifest。
4. 安装到 provider 可发现的插件目录，写入 `.codex-plugin/plugin.json`、`.provider-plugin/plugin.json`、`.mcp.json`、skills、assets、bin launcher。
5. 不检查 `/Applications/Movscript.app`，不要求 Desktop 已安装，不启动 Desktop。
6. 安装后输出验证命令，例如让用户在 Agent 中查看 `movscript_runtime_status` 或重启 provider。

Desktop 安装脚本职责：

1. 下载 `desktop` release 产物，例如 macOS dmg/zip 或 Windows installer。
2. 只安装 Desktop App，不安装 Agent Plugin。
3. 可以提示 “Agent 用户可单独安装 plugin”，但不把 plugin 作为 Desktop 安装副作用。
4. macOS 命令行安装继续支持自动识别 Apple Silicon / Intel；Windows 以手动下载 installer 为主，直到有稳定命令行安装策略。

GitHub Pages release metadata 应同时描述 `desktop` 和 `plugin` 两类产物，避免页面只能识别 `.dmg` / `.exe`：

```ts
type GitHubPagesReleaseMetadata = {
  tagName: string
  desktop: {
    macosArm64?: ReleaseAsset
    macosX64?: ReleaseAsset
    windowsX64?: ReleaseAsset
  }
  plugin: {
    archive?: ReleaseAsset
    installScriptUrl: string
    supportedProviders: Array<'codex'>
  }
}
```

页面验收标准：

- 首屏能看出“不安装 Desktop 也可以只安装 Agent Plugin”。
- Plugin command 不应下载 Desktop installer。
- Desktop command 不应安装 Agent Plugin。
- GitHub Releases 链接仍保留，用于手动下载全部 `desktop` / `plugin` 产物。
- 页面文案应说明 Desktop、Agent Plugin 和 CLI 复用同一个本机 `movscript.local-node` daemon；Plugin 在 Desktop 不存在或不可用时仍可独立确保并连接 daemon。

### 依赖原则

允许依赖方向：

```text
apps/plugin -> packages/mcp-host -> packages/core -> domain packages
apps/desktop -> packages/core / packages/project / packages/workspace / data-client
apps/desktop -> packages/mcp-host capabilities only when embedding or launching movscript.mcp.host
apps/cloud -> packages/runtime-contracts / service manifests / deployment adapters / shared config types
server-side mcp entry -> packages/mcp-host -> data-client -> Data Service API

apps/desktop -> packages/mcp-host only as a child-process service dependency
```

禁止依赖方向：

```text
packages/core -> apps/plugin
packages/core -> apps/desktop/electron
packages/mcp-host -> apps/plugin
apps/cloud -> packages/mcp-host as an internal app dependency
domain packages -> MCP transport
surface/project -> Desktop/Electron-only APIs
```

`packages/mcp-host` 可以依赖 `@movscript/core/mcp/node`、project/workspace adapter 和 data-client，但不得依赖 Desktop App 或 Electron。cloud service profile 里的 server-side MCP host 应作为独立 service entry 组合部署，不应变成 `data-service` 内部模块。

### 测试和验证原则

每次修改 MCP host 或插件入口，至少验证：

```bash
pnpm --filter @movscript/mcp-host typecheck
pnpm --filter @movscript/mcp-host build
pnpm --filter @movscript/plugin-movscript typecheck
pnpm --filter @movscript/plugin-movscript build
```

stdio smoke：

```bash
printf '%s\n%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"movscript_runtime_status","arguments":{"timeoutMs":250}}}' \
  | ./plugins/movscript/bin/movscript-agent-mcp
```

期望：

- `initialize` 的 `serverInfo.name` 是 `movscript-mcp-host`。
- `tools/list` 包含 `movscript_runtime_status` 和 `movscript_runtime_configure`，且它们排在 core tools 前面。
- `movscript_runtime_status` 返回 `status: "ok"`，包含 `dataService`、`workspace`、`desktop`、`recommendedMode`、`requiresUserChoice`、`missing`。

如果项目有可用 local service profile 和本地 project source，还应额外验证：

- `system_model_list` 能返回模型或明确 auth/config 错误。
- `domain_inspect` 能对当前 project source 给出诊断。
- Desktop 未启动时不会影响上述核心工具。

## 为什么不做独立 Lite 项目

独立 `lite` 业务项目表面看起来简单，但会带来长期漂移：

- MCP tool 名称相同但参数和行为逐渐不同。
- domain schema、candidate 逻辑、interpret 输出和错误处理重复实现。
- Desktop、Agent provider、cloud workspace 三处各自修 bug，难以保证创作状态一致。
- 生成工具、资源工具和 Agent Surface 很快需要共享 provenance、job、candidate、selection 语义。

因此只允许新增轻量 host，不允许复制业务逻辑。业务逻辑必须下沉到 core、领域 package 或 Data Service 可复用层。

## 能力分层

### Core MCP 能力

这些能力应在没有 Desktop App 的情况下可用，是 MovScript Agent Plugin App 第一阶段必须支持的核心闭环：

- `movscript_project_init`
- `movscript_project_open`
- `movscript_project_fetch`
- `system_model_list`
- `system_resource_library_query`
- `system_resource_upload`
- `generation_capability_list`
- `generation_prepare`
- `generation_submit`
- `generation_job_get`
- `generation_job_get_batch`
- `generation_result_register`
- `domain_query_*`
- `domain_read_*`
- `domain_upsert_*`
- `domain_update_*`
- `domain_delete_entity`
- `domain_inspect`
- `domain_interpret`
- `domain_overview`
- `domain_regeneration_plan`
- `domain_build_content_unit_backend_prompt`
- `domain_create_content_candidate`
- `domain_register_raw_resource_as_content_unit_candidate`
- `domain_select_content_unit_candidate`

这些工具构成“项目 source 编辑 -> inspect/interpret -> prompt 构建 -> 生成 -> candidate 写入/选择 -> regeneration review”的 Agent 创作闭环。

### Runtime 增强能力

这些能力可以暴露在工具列表中，但必须通过 capability gating 判断当前 host 是否具备运行条件：

- ffmpeg media transform
- video frame extraction
- render
- HLS packaging
- transcode
- reframe
- local export/import
- local file reveal/save
- media pipeline runtime adapter

如果当前 host 不具备这些能力，工具结果应返回结构化不可用状态，而不是抛出含糊错误：

```json
{
  "status": "unavailable",
  "code": "render_runtime_required",
  "message": "This tool requires MovScript Desktop App or a configured Data Service render runtime."
}
```

### Desktop App 专属能力

这些能力不进入通用 MCP 核心，只由 Desktop App 注入或增强：

- 当前窗口路由
- 选中的 UI entity
- Electron IPC
- tray/window lifecycle
- desktop app settings UI
- local preview pane state
- Electron mediaPipeline UI

通用 MCP 可以接收 Desktop App 注入的 context，但不应该依赖 Desktop App context 才能执行核心创作工具。

## 本地和云端模式

### 本地模式

```text
MovScript Agent Plugin App
  -> local stdio movscript.mcp.host
  -> local service profile: http://localhost:8765
  -> Local project source directory
```

适用场景：

- 用户本地运行 local service profile。
- 用户安装 Desktop App 时，Desktop 和 MovScript Agent Plugin App 都优先 attach 同一个 `movscript.local-node` daemon。
- 用户未安装 Desktop App 时，MovScript Agent Plugin App 也可以通过 `plugin-full-local` ensure daemon。
- 用户希望项目 source 保存在本地 Git workspace。

本地模式需要支持：

- 默认从 `$MOVSCRIPT_HOME/config/local-auth.json` 或 runtime profile 解析 `LocalOwnerAuthProvider`，不要求本地 Auth Service。
- 本地模式不从 `$MOVSCRIPT_HOME/runtime/endpoints/movscript.auth.service.json` 发现或启动 Auth Service；如需身份服务，必须显式连接 cloud/external Auth Service。
- 从 `$MOVSCRIPT_HOME/runtime/endpoints/movscript.data.service.json` 发现已启动的本地 Data Service endpoint。
- cloud/external opaque-key profile 从 `$MOVSCRIPT_HOME/config/auth-service.json` 读取 Auth Service base URL。
- 从 `$MOVSCRIPT_HOME/config/data-service.json` 读取 Data Service base URL。
- 从 `$MOVSCRIPT_HOME/config/local-auth.json` 读取 `sk-local-...` owner key 或 local principal seed。
- 支持 `MOVSCRIPT_AUTH_MODE`、`MOVSCRIPT_LOCAL_OWNER_KEY`、`MOVSCRIPT_AUTH_BASE_URL`、`MOVSCRIPT_AUTH_TOKEN`、`MOVSCRIPT_API_BASE_URL`、`MOVSCRIPT_API_TOKEN`、`MOVSCRIPT_WORKSPACE_DIR` 环境变量覆盖。

### 云端模式

```text
MovScript Agent Plugin App
  -> local stdio movscript.mcp.host
  -> Cloud App cloud profile
  -> Cloud resource / generation job / project metadata
  -> Local synced project source 或 Cloud Workspace Source API
```

云端模式第一阶段可以支持“cloud service profile + 本地 project source”。也就是资源、生成、job、candidate decision 走云端，domain source 文件仍然在用户本地 workspace 中读写。

第二阶段应补齐 Cloud Workspace Source API，让完全无本地项目目录的用户也可以通过 Agent 编辑云端 project source。

## 标准启动场景

启动场景应按“部署拓扑”和“代码复用边界”同时设计。一个场景里可以有多个 service instance，但这些 service 不能各自实现一套 MCP、project 管理或 Agent Surface。

### 应用容器启动矩阵

应用容器启动程序的规则如下：

| 场景 | 用户/平台启动的应用 | 应用容器必须启动的 service | 应用容器可选启动的 service | 已存在或外部连接的 service |
| --- | --- | --- | --- | --- |
| 云服务平台部署 | Cloud Deployment App / orchestrator | deployment/control wrapper；具体取决于平台 | migration/ops command、cloud-control routes | 独立 cloud service instances：`movscript.auth.service`、`movscript.data.service`、`movscript.project.service`、`movscript.editing.service`、`movscript.web-surface.host`、optional remote `movscript.mcp.host`、optional `movscript.admin.web`、provider APIs、object storage、database |
| 云服务 + Desktop 用户 | Desktop App | `movscript.desktop.shell`、Agent Surface embed shell | child-process/local `movscript.mcp.host`、local `movscript.media.pipeline` | `movscript.auth.service` cloud instance、`movscript.data.service` cloud instance、`movscript.project.service` cloud instance、`movscript.editing.service` cloud instance、`movscript.web-surface.host` cloud instance |
| 云服务 + Agent 用户 | MovScript Agent Plugin App | `movscript.plugin.agent-launcher`、local stdio `movscript.mcp.host` | local source proxy、surface URL resolver | `movscript.auth.service` cloud instance、`movscript.data.service` cloud instance、`movscript.project.service` cloud instance、`movscript.editing.service` cloud instance、`movscript.web-surface.host` cloud instance |
| 本地模式 + Desktop 用户 | Desktop App + local service profile | Desktop: `movscript.desktop.shell`、embedded `movscript.local-surface.host`; local AuthProvider；local services: `movscript.data.service`、`movscript.project.service`、`movscript.editing.service` | Desktop-supervised local service instance、embedded `movscript.mcp.host`、`movscript.media.pipeline`、local `movscript.admin.web` | local project source；optional external/cloud Auth Service |
| 本地模式 + Agent 用户 | MovScript Agent Plugin App + local service profile | Plugin: `movscript.plugin.agent-launcher`、local stdio `movscript.mcp.host`; local AuthProvider；local services: `movscript.data.service`、`movscript.project.service`、`movscript.editing.service`、`movscript.media.pipeline` | local HTTP `movscript.mcp.host`、optional local `movscript.admin.web` | local project source；optional external/cloud Auth Service |
| 开发/测试 | test runner 或 local dev app | memory/test composition、selected service under test | local service profile、local web、stdio `movscript.mcp.host` | fixtures、mock providers |

启动矩阵说明：

- `mcp-host` 可以被多个应用容器启动，但每次启动都是当前进程的 composition root。
- remote/server-side `movscript.mcp.host` 由 cloud deployment/orchestrator 独立启动；MovScript Agent Plugin App 中的 local stdio `movscript.mcp.host` 服务用户本机 Agent host。两者共用 `packages/mcp-host`，但 transport、session、Project Service client 不同。
- Desktop App 不必须启动 `mcp-host`。只有需要 Desktop 暴露 Agent/MCP 入口，或需要 Desktop bridge 增强能力时，才 embed 或启动它。
- Cloud App 不负责用户产品体验，也不内嵌启动 Plugin-startable services；完整 UI 由 Desktop App、独立部署的 `movscript.admin.web` 或独立部署的 `movscript.local-surface.host` 提供。
- Agent Surface 作为同一套 web 程序，可以由 `movscript.local-surface.host` 独立启动、本机启动，云端由 `movscript.web-surface.host` 部署、Desktop App 嵌入或 Plugin full local profile 启动。

### 场景 1：云服务模式，平台侧启动

```text
Cloud Deployment App / orchestrator (profile=cloud)
  -> deployment manifests
  -> independent movscript.auth.service
  -> independent movscript.data.service
  -> independent movscript.project.service
  -> independent movscript.editing.service
  -> independent movscript.local-surface.host
  -> optional independent remote movscript.mcp.host
  -> optional independent movscript.admin.web
```

定位：

- 面向云端用户、托管 agent、远程 MCP client。
- `movscript.auth.service` 负责 cloud auth、user/org/tenant、session、token 和 claims。
- `movscript.data.service` 负责 workspace/project persistence、generation jobs、artifact storage，并通过 AuthProvider 获取 identity/claims。
- `movscript.local-surface.host` 提供同一套 `/agent/...` Agent Surface。
- `movscript.mcp.host` 作为独立 service entry 运行，连接 Data/Project/Editing Service API，不直接依赖 Desktop App，也不作为 Cloud App 内部模块。

复用要求：

- `movscript.mcp.host` 复用 `packages/mcp-host`。
- Cloud App 和 MCP host 共用 `packages/core` 的 tool schema/domain contract。
- Surface Host program 和 Desktop App 嵌入 surface 共用同一套路由/组件，只切换 data adapter。

### 场景 2：云服务模式，用户使用 Desktop App

```text
Desktop App
  -> movscript.desktop.shell
  -> embedded movscript.local-surface.host
  -> Cloud App cloud profile / movscript.data.service
```

定位：

- 用户安装 Desktop App，但项目和生成运行在 cloud service profile。
- Desktop App 是本地产品 shell，负责登录状态、项目入口、媒体预览和本地增强。
- Agent Surface 优先复用 `movscript.local-surface.host`；需要本地能力时由 Desktop bridge 注入能力。

复用要求：

- Desktop App 不重新实现 cloud project 规则，使用 shared data-client + core/project types。
- Desktop App 不 fork Agent Surface，只提供 native bridge、权限和本地预览增强。
- 如果 Desktop App 要提供 Agent/MCP 入口，应启动或 embed `movscript.mcp.host`，而不是维护 Desktop 专属 MCP 实现。

### 场景 3：云服务模式，用户使用 Agent + 本地 MCP host

```text
Agent Runtime / Provider Host
  -> MovScript Agent Plugin App / movscript.plugin.agent-launcher
  -> local stdio movscript.mcp.host
  -> Cloud App cloud profile / movscript.data.service
  -> Cloud Workspace Source API 或 Local synced project source
```

定位：

- 用户不需要安装 Desktop。
- MovScript Agent Plugin App 本地启动 stdio `movscript.mcp.host`。
- `movscript.mcp.host` 通过 cloud token 访问 cloud service profile。
- 第一阶段可以支持 cloud service profile + local project source；完整云端模式需要 Cloud Workspace Source API。

复用要求：

- Plugin launcher 只是 `packages/mcp-host` 的 Agent provider 打包外壳。
- Project 管理和项目视图仍走 Project Service contract；云端 source 由 cloud Project Service adapter 聚合，本地 source 由 local Project Service adapter 聚合。
- Agent Surface URL 可以指向云端 web；本地 source 场景需要 local MCP/API proxy 或 Desktop bridge 提供本地数据通道。

### 场景 4：本地模式，用户使用 Desktop App + local service profile

```text
Desktop App
  -> movscript.desktop.shell
  -> local AuthProvider
  -> local service profile / movscript.data.service
  -> Local project source
  -> embedded movscript.local-surface.host
```

定位：

- 面向完整本地创作体验。
- Desktop App 负责项目入口、文件权限、本地预览 UI、native dialogs 和本地 service 对接。
- Project Service local profile 负责本地 project/source/candidate/interpret/read-model。
- Editing Service local profile 负责本地 timeline/edit plan/preview timeline/render request。
- Local AuthProvider 负责本地 `local-owner` principal、`sk-local-...` owner key 和 claims；默认不创建 user/org/tenant。
- Data Service local profile 负责本地 generation/resource/job API。
- Agent Surface 使用同一套 `/agent/...` 页面，通过 Desktop bridge、Project Service 或 local service profile 读取本地项目数据。

复用要求：

- Desktop App 和 local service profile 共用 AuthProvider、Project/Editing/Data Service clients 和 shared contracts。
- Desktop App 的项目管理 UI 调用 Project Service client，不重写 source root 和 workspace config 规则。
- Desktop embedded Agent Surface 与 cloud Surface Host program 共用组件和路由。

### 场景 5：本地模式，用户使用 Agent + MCP host + local service profile

```text
Agent Runtime / Provider Host
  -> MovScript Agent Plugin App / movscript.plugin.agent-launcher
  -> local stdio movscript.mcp.host
  -> local AuthProvider
  -> local service profile / movscript.data.service
  -> Local project source
  -> optional local movscript.local-surface.host
```

定位：

- 用户不打开 Desktop，也可以让 Agent 操作本地 MovScript 项目。
- `movscript.mcp.host` 自动发现 cwd/config/env 中的 project source 和 local service profile。
- 如果有 local web/agent surface，可以返回本地 surface URL；没有 surface 时仍应返回 Agent 可读 JSON。

复用要求：

- Local stdio `movscript.mcp.host` 与 server-side `movscript.mcp.host` 共享 `packages/mcp-host`。
- 本地 project discovery/read/upsert 复用 Project Service contract 和 shared project/workspace package。
- Auth/Data Service local/cloud profile 尽量共享 API contract，使 MCP host 只切换 Auth/Data base URL、token/claims 和 Project Service client。

### 场景判断

场景拆分的关键是把“启动了几个 service instance”和“是不是一套实现”分开：

| 模式 | 谁启动 | 必备 service | 可选 service | 关键复用点 |
| --- | --- | --- | --- | --- |
| 云服务，平台侧 | Cloud Deployment App / orchestrator | deployment/control wrapper；独立 cloud services 包括 `movscript.auth.service`、`movscript.data.service`、`movscript.project.service`、`movscript.editing.service`、`movscript.web-surface.host`、`movscript.admin.web` | remote `movscript.mcp.host`、future runtime-worker/media workers | Auth/Project/Editing Service contracts、mcp-host package、core schema、Admin Web program |
| 云服务，Desktop 用户 | Desktop App | `movscript.desktop.shell`、`movscript.local-surface.host`、cloud `movscript.auth.service`、cloud `movscript.data.service`、cloud `movscript.project.service`、cloud `movscript.editing.service` | embedded `movscript.mcp.host`、local `movscript.media.pipeline` | shared auth/project/editing/data-clients、shared Agent Surface |
| 云服务，Agent 用户 | MovScript Agent Plugin App | local stdio `movscript.mcp.host`、cloud `movscript.auth.service`、cloud `movscript.data.service`、cloud `movscript.project.service`、cloud `movscript.editing.service` | cloud `movscript.web-surface.host` | plugin bundle 复用 mcp-host，Auth/Project/Editing Service client 可切换 |
| 本地，Desktop 用户 | Desktop App + local service profile | `movscript.desktop.shell`、local AuthProvider、local `movscript.data.service`、local `movscript.project.service`、local `movscript.editing.service`、local project source | embedded/local `movscript.mcp.host`、`movscript.media.pipeline`、local `movscript.admin.web` | shared AuthProvider/Project/Editing Service/workspace，shared Agent Surface |
| 本地，Agent 用户 | MovScript Agent Plugin App + local service profile | local stdio `movscript.mcp.host`、local AuthProvider、local `movscript.data.service`、local `movscript.project.service`、local `movscript.editing.service`、local `movscript.local-surface.host`、local `movscript.media.pipeline`、local project source | local `movscript.admin.web` | mcp-host + AuthProvider/Project/Editing Service/Agent Surface/Media Pipeline 共用 |

因此推荐标准表述是：

- 云服务模式：平台部署 Cloud App `cloud` profile 和可选 server-side `movscript.mcp.host`；用户侧可以使用 Desktop App，也可以使用 MovScript Agent Plugin App 启动本地 stdio `movscript.mcp.host` 连接云端。
- 本地模式：`movscript.local-node` daemon 是全量 runtime owner；Desktop App 和 MovScript Agent Plugin App 都 ensure/attach daemon。
- Desktop App 关注本地产品体验和本地项目 surface；`movscript.mcp.host` 关注 Agent 入口和能力路由；两者共享 core/project/workspace/data-client/agent-surface，不共享产品 shell。

## 运行时发现和模式选择

MovScript Agent Plugin App 启动后不应首先要求用户手动选择“本地还是云端”。正确体验是先自动检测当前环境，能确定时直接工作，只有存在多个合理选择或缺少关键输入时才询问用户。

启动诊断应覆盖六类状态：

1. MovScript Home 是否可用。
   - 解析 `MOVSCRIPT_HOME` 或用户级默认 Home。
   - 读取 `$MOVSCRIPT_HOME/runtime/apps/*.json` 和 `$MOVSCRIPT_HOME/runtime/services/**/*.json`。
   - 清理或忽略 pid 不存在、health 失败、owner token 不匹配的 stale record。
   - 后续所有 Desktop/service/cloud 配置发现都以 Home 为第一事实来源。
2. Local runtime daemon 是否可用。
   - 检查 `$MOVSCRIPT_HOME/runtime/apps/movscript.local-node.json` 和 `$MOVSCRIPT_HOME/runtime/endpoints/movscript.local-node.control.json`。
   - 对 control endpoint 执行 health/status probe。
   - 如果 daemon ready，本机 local runtime owner 就是 `movscript.local-node`；Plugin、Desktop、CLI 都不再启动本地 Data/Project/Editing/Runtime/Surface/Media 副本。
   - 如果 daemon 不可用且本地执行需要启动，通过 ensure lock 启动 daemon。
3. data plane profile 是否可用。
   - 优先解析 `$MOVSCRIPT_HOME/config/local-auth.json` 或 runtime profile 中的 AuthProvider mode。
   - 默认本地模式使用 `LocalOwnerAuthProvider`，不 probe Auth Service endpoint。
   - 本地 profile 不读取 `$MOVSCRIPT_HOME/runtime/endpoints/movscript.auth.service.json`，也不启动 Auth Service。
   - data plane 为 local 时读取 `$MOVSCRIPT_HOME/runtime/endpoints/movscript.data.service.json` 和 service instance records。
   - data plane 为 cloud/external 时读取 `MOVSCRIPT_DATA_SERVICE_URL` 或 cloud config，不启动本地 Data Service。
   - probe Data/Project/Editing endpoint；只有 Home 不存在可用 endpoint 时，才回退 probe 默认端口。
   - 读取 `MOVSCRIPT_API_BASE_URL`。
   - cloud/external opaque-key profile 读取 `$MOVSCRIPT_HOME/config/auth-service.json`。
   - 读取 `$MOVSCRIPT_HOME/config/data-service.json`。
4. 当前目录或配置目录是否为 MovScript project source。
   - 检查 `workspace.json` 或 `project.json`。
   - 检查 `settings/**`、`content_units/**`、`productions/**` 等 source 目录。
   - 必要时运行轻量 `domain_inspect`。
5. 是否存在云端登录或云端配置。
   - 检查 `$MOVSCRIPT_HOME/config/realms/cloud/*/auth.json`。
   - 检查 `MOVSCRIPT_API_TOKEN`。
   - 复用 `movcli auth status` 的 session 解析能力。
6. 是否允许启动 local daemon。
   - 检查插件包是否包含 `Local Runtime Daemon Bundle`。
   - 检查用户是否允许启动本地后台服务和本地 Agent Surface。
   - 检查全局 ensure lock、端口和 daemon identity，避免并发启动多套 full local。

### 自动决策表

| 检测结果 | Runtime owner | 默认模式 | 是否询问用户 |
| --- | --- | --- | --- |
| Local daemon ready，当前目录是项目 | `movscript.local-node` | `local_daemon` | 否 |
| Local daemon ready，当前目录不是项目 | `movscript.local-node` | 待定 | 是，询问初始化新项目还是打开已有 `projectDir` |
| Local daemon 不可用，允许启动 local data plane，当前目录是项目 | `movscript.local-node` | `local_data_local_source` | 否 |
| Local daemon 不可用，cloud/external Data Service 可用，当前目录是项目 | `movscript.local-node` + cloud/external Data Service | `cloud_or_external_data_local_source` | 否 |
| cloud service profile token 可用，没有本地项目 | Cloud | 待定 | 是，询问同步云端项目到本地还是配置 `projectDir` |
| local/cloud/external Data Service 都可用，当前目录是项目 | `movscript.local-node` with selected data plane | 沿用上次选择；无历史则推荐本地 | 是，允许本次切换 data plane |
| Data Service profile 不可用且 local daemon 不可启动 | None | 无可用 runtime | 否，返回安装插件 daemon、配置 Data Service URL 或登录云服务的引导 |

自动决策的目标是减少配置负担，但不能隐式切换会影响身份、数据归属的 Data Service profile。runtime owner 固定为 local daemon；只要 local/cloud/external data plane 同时可用且会影响 auth/project/resource/job 写入位置，就应该保留显式确认或沿用用户上次选择。

### Runtime Status 工具

MCP host 应提供一个低风险诊断工具：

```text
movscript_runtime_status
```

返回建议结构：

```json
{
  "dataService": {
    "local": {
      "available": true,
      "baseURL": "http://localhost:8765",
      "authenticated": true
    },
    "cloud": {
      "available": true,
      "baseURL": "https://api.movscript.example",
      "authenticated": true
    },
    "selected": "cloud"
  },
  "workspace": {
    "cwd": "/repo/project",
    "projectDir": "/repo/project",
    "isMovScriptProject": true,
    "projectUid": "proj_123"
  },
  "desktop": {
    "available": true,
    "launchable": true,
    "runtimeReady": true,
    "ownsLocalRuntime": true,
    "mediaPipeline": true
  },
  "runtimeOwner": {
    "kind": "desktop",
    "serviceOwnerId": "desktop:local:default",
    "pluginMayStartSidecars": false
  },
  "recommendedMode": "desktop_owned_local_runtime",
  "requiresUserChoice": false,
  "missing": []
}
```

该工具应只读取配置、probe 健康状态和检查项目结构，不创建项目、不登录、不写入 source。

### Runtime Configure 工具

当用户明确切换模式或补充 `projectDir` 时，MCP host 可提供配置工具：

```text
movscript_runtime_configure
```

输入建议：

```json
{
  "dataServiceMode": "local",
  "dataServiceBaseURL": "http://localhost:8765",
  "projectDir": "/repo/project",
  "remember": true
}
```

该工具只写入 MovScript runtime 选择和 Data Service config，不应创建业务项目。创建或初始化项目仍然通过 `movscript_project_init`、`movscript_project_open`、`movscript_project_fetch` 完成。

### 询问策略

Agent 交互应遵循：

- 能自动确定时不询问。
- 缺少关键能力时给明确下一步，不提出泛泛问题。
- 有多个可写入目标时询问，因为这会影响数据归属。
- 默认选择应可解释，例如“检测到当前目录是 MovScript 项目且 local service profile 已可用，因此使用本地模式”。
- 用户本次选择可以写入 workspace runtime preference，但必须允许后续切换。

## Data Service 边界

Cloud App 不建议在 `data-service` 内重新公开通用 `/mcp` endpoint。原因：

- MCP 是 Agent 执行入口，权限面比普通 REST API 更宽。
- 本地 MCP 应绑定可信本地 service instance，云端 MCP 暴露会扩大攻击面。
- Cloud App 已经有认证、资源、生成、project、job、org 等 API，`movscript.mcp.host` 可以作为 adapter 调用这些 API。

推荐边界：

```text
MCP protocol endpoint: 运行在 MovScript Agent Plugin App、Desktop App 或 cloud deployment/orchestrator 独立启动的 movscript.mcp.host。
Data Service API endpoint: 运行在 Data Service local/cloud profile，通过 REST/API auth 访问。
```

如果未来确实需要云端托管 MCP，也必须是 本机启动，云端由 `movscript.web-surface.host` 部署的独立受控 `movscript.mcp.host` 或 Agent Gateway，而不是直接恢复 `data-service` 内部 `/mcp`。

## MovScript Agent Plugin App 结构

`apps/plugin` 应成为标准 MovScript Agent Plugin App 源码项目，而不是 Desktop-only MCP 代理包。`plugins/movscript` 只作为 agent plugin 分发物存在。

`apps/plugin` 建议结构：

```text
apps/plugin/
  application.manifest.ts
  startup.manifest.ts
  package.json
  tsconfig.json
  tsup.config.ts
  src/
    agent-mcp.ts
  templates/
    .agent-plugin/plugin.json
    .provider-plugin/plugin.json
    .mcp.json
  bin/
    movscript-agent-mcp
  skills/
    domain/
    project/
    planning/
    generation/
    editing/
    review/
  assets/
    logo.png
  scripts/
    build-plugin-artifact.ts
  README.md
```

`plugins/movscript` 建议结构：

```text
plugins/movscript/
  .agent-plugin/plugin.json
  .provider-plugin/plugin.json
  .mcp.json
  bin/
    movscript-agent-mcp
    movscript-agent-mcp.mjs
  skills/
  assets/
  README.md
```

`.mcp.json` 应启动 `bin/movscript-agent-mcp`。该 launcher 做三件事：

1. 初始化 workspace、Auth/Data Service base URL、auth token、capabilities。
2. 启动 stdio `movscript.mcp.host`。
3. 把所有 MCP request 交给 `packages/mcp-host` composition 和 `@movscript/core/mcp/node` 的 tool router。

它不应该：

- 复制静态 tool schema。
- 强依赖 `http://127.0.0.1:18765/mcp`。
- 要求 Desktop App 先启动。
- 自己实现 domain/generation/resource 业务逻辑。

### Agent Plugin App 运行包和运行所有者

Plugin App 需要区分四个位置，不能把源码目录、发布物、安装目录和运行目录混成一个概念：

| 层次 | 建议位置 | 谁写入 | 谁读取/运行 | 定位 |
| --- | --- | --- | --- | --- |
| Source project | `apps/plugin` | 开发者和 CI | build scripts | 插件应用源码、模板、launcher source、skills source。 |
| Release artifact staging | `plugins/movscript` 或 release zip 内同构目录 | `release -- package --app plugin` | GitHub Releases、install-plugin 脚本 | 可分发、可校验、可安装的 Agent Plugin Artifact。 |
| Canonical local install store | `$MOVSCRIPT_HOME/plugins/movscript/<version>/`，`current` 指向当前版本 | `install-plugin.sh` | provider registration installer、debug 工具 | MovScript 自己维护的不可变插件包缓存；用于回滚、校验、重装到不同 provider。 |
| Provider installed runtime package | provider 自己的插件安装/cache 目录；Codex 示例是 provider 管理的 plugin cache | Agent/provider 或其插件安装流程 | Agent/provider MCP launcher | 真正被 provider 发现并按 manifest 执行的运行包。 |

运行原则：

- `apps/plugin` 永远不直接被用户的 Agent/provider 运行。它只是源码。
- `plugins/movscript` 是发布物形态，不是长期运行目录。
- `install-plugin.sh` 不启动长期后台进程；它只下载、校验、解包到 MovScript Home，并完成 provider registration。
- 真正运行时，Agent/provider 读取 provider installed runtime package 里的 manifest，例如 `.mcp.json`，并启动其中声明的 command。
- `.mcp.json` 的 `cwd` 应是插件包根目录，launcher 必须只用相对路径访问 `./bin`、`./skills`、`./assets`，不能依赖 monorepo 路径或安装脚本 cwd。
- Agent Plugin App 的会话级 process owner 是 Agent/provider 启动的 MCP server process。它可以在进程内启动 `packages/mcp-host`，也可以作为薄 launcher 启动 bundled `movscript.mcp.host` 子进程，但不能把运行所有权交给 Desktop。
- 如果进入 `plugin-full-local`，本地服务由后台 `movscript.local-node` 通过 App Runner 监督启动，并把 runtime trace 写入 `$MOVSCRIPT_HOME/runtime/services/**`。`movscript.mcp.host` 是 Codex/Agent 会话级入口，会话结束即可退出；`movscript.local-node` 是传统 daemon，默认不自动退出，必须通过 `runtime_local_daemon_stop` / `runtime_local_node_stop` / `movscript daemon stop` / 安装脚本 preflight 显式关闭。
- Desktop 可用时，Plugin App 和 Desktop 都连接同一个 daemon，不启动同类 sidecar。

Codex provider 的推荐安装链路：

```text
GitHub Releases
  -> movscript-agent-plugin-<version>.zip
  -> install-plugin.sh
  -> $MOVSCRIPT_HOME/plugins/movscript/<version>/
  -> provider registration, e.g. personal marketplace or equivalent provider entry
  -> Codex-managed installed/cache copy
  -> Codex reads .mcp.json
  -> Codex starts ./bin/movscript-agent-mcp with cwd=plugin package root
  -> bundled movscript.mcp.host
```

因此，MovScript 不能假设“运行包就在 `$MOVSCRIPT_HOME`”。`$MOVSCRIPT_HOME` 是 MovScript 的 canonical install store 和 runtime state store；最终执行路径由 provider 决定。launcher 必须同时支持：

1. 运行在 provider cache copy 内。
2. 运行在 `$MOVSCRIPT_HOME/plugins/movscript/current/` 内。
3. 开发模式下运行在 repo 的 `plugins/movscript/` 或 `apps/plugin` 构建输出内。

无论运行在哪个目录，运行时状态都只写 `$MOVSCRIPT_HOME/runtime/**`，不能写 provider cache 目录作为状态来源。provider cache 可以被清理、替换或重装。

#### 类似系统的参考模式

其他插件/扩展生态的共同点是：安装包放在宿主可发现的位置，生命周期由宿主或宿主的 extension host 管理，插件通过 manifest 声明入口，而不是自己在安装时变成常驻服务。

| 生态 | 包放在哪里 | 谁运行 | 对 MovScript 的启发 |
| --- | --- | --- | --- |
| Codex plugin | 插件 source 可来自 marketplace；安装后进入 Codex 管理的 plugin cache，`.mcp.json` 可以用 `cwd: "."` 启动包内命令。 | Codex 读取插件 manifest 并启动 MCP server command。 | MovScript Plugin Artifact 要自包含，provider cache 才是真正运行目录；launcher 用相对路径。 |
| Claude Code MCP | MCP server entry 存在 user/project/local scope 配置里，配置声明 command 或 URL。 | Claude Code 按配置启动本机 command 或连接远端 URL。 | MCP server 本质是 host-managed command；MovScript 不应要求用户手工启动 MCP host。 |
| Claude Desktop extensions | 用户安装 `.mcpb` desktop extension，Desktop 管理本地 MCP server；支持 Node.js、Python 和 binary server。 | Claude Desktop 安装、配置、运行和调试本地 MCP server。 | Agent Plugin Artifact 可以包含 Node bundle 或 native sidecar，但安装和运行要交给宿主流程。 |
| VS Code extension | 扩展安装到 VS Code 可发现的位置；运行位置由 local/web/remote extension host 和 `extensionKind` 决定。 | VS Code Extension Host 运行扩展，并隔离性能和生命周期。 | MovScript 也要声明运行偏好：需要本地文件/project 时靠近 workspace，需要 UI/native 能力时优先 Desktop。 |
| Chrome extension | 扩展代码必须随 extension package 发布，background service worker 由 manifest 声明。 | Chrome 根据 extension lifecycle 启停 service worker；不允许用远程托管代码绕过 package。 | MovScript plugin 的 MCP launcher 和核心 bundle 应随包分发，不在运行时从网络下载可执行逻辑。 |

参考链接：

- VS Code Extension Host: https://code.visualstudio.com/api/advanced-topics/extension-host
- Claude Code MCP quickstart: https://code.claude.com/docs/en/mcp-quickstart
- Claude Desktop local MCP / desktop extensions: https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop
- Chrome extension service worker basics: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics

#### 运行包约束

Plugin release artifact 必须满足这些约束：

- 可复制：整个插件目录被复制到 provider cache 后仍可运行。
- 可重命名：父目录包含 version/hash/cachebuster 时仍可运行。
- 可只读：provider cache 目录视为只读，运行状态写入 MovScript Home。
- 可离线：安装完成后，`initialize`、`tools/list`、`movscript_runtime_status` 不依赖网络下载代码。
- 可验证：release artifact 里必须有 manifest、version、checksum 或等价 release metadata。
- 可多 provider：Codex manifest 是 provider target，不是 canonical architecture；未来其他 provider 只增加 registration/manifest adapter。

运行包内建议增加：

```text
plugins/movscript/
  manifest.runtime.json       # MovScript 自己的 artifact metadata
  .mcp.json                   # provider-neutral MCP config when supported
  .codex-plugin/plugin.json   # Codex provider manifest
  .provider-plugin/plugin.json
  bin/
    movscript-agent-mcp       # shell/native launcher
    movscript-agent-mcp.mjs   # bundled Node entry
  runtime/
    node/                     # optional portable runtime only if provider does not provide one
    services/                 # optional plugin-full-local sidecar launchers
    web/agent-surface/        # optional bundled Agent Surface assets
  skills/
  assets/
  README.md
```

默认不内置 Node runtime。优先使用 provider 提供的 Node 或系统 Node；只有目标 provider 没有可靠 Node runtime，且插件包需要做到一键可运行时，才为对应平台发布带 runtime 的 fat plugin artifact。fat artifact 仍然是 `plugin` app release 的变体，不是 Desktop release。

## `movscript.mcp.host` 设计

建议新增 `packages/mcp-host`，避免把 Agent provider 专属启动逻辑塞进 core。

职责：

- stdio JSON-RPC transport。
- MCP initialize、tools/list、tools/call、resources/list、resources/read 分发。
- Auth Service session/token 解析。
- workspace default dir 设置。
- auth token 注入。
- capability registry。
- runtime discovery。
- AuthProvider/Data Service local/cloud profile selection。
- Desktop App / cloud service profile / local service profile 的 capability gating。
- Agent Surface base URL 配置。

`packages/core/mcp/node` 继续负责：

- tool definitions。
- tool router。
- resource registry。
- domain runtime。
- generation/resource/candidate tool actions。
- surface descriptor 创建的纯业务上下文。

## Agent Surface 支持

MovScript Agent Plugin App 应该支持 Agent Surface。Surface 是展示层协议，不是 Desktop App 专属能力。

工具结果既要给 Agent 可读 JSON，也要在合适场景返回可打开的 `surface` 描述：

```ts
type MovScriptAgentSurface = {
  kind: 'browser_url'
  surface: 'inspect' | 'review' | 'edit'
  title: string
  route: string
  url: string
  frontend_origin: string
  api: {
    mode: 'mcp_proxy' | 'data_service_api'
    base_url: string
    auth: 'mcp_context' | 'bearer_token' | 'provider_session'
  }
  entity?: {
    project_id?: number | string
    project_uid?: string
    content_unit_id?: string | number
    candidate_id?: string
    resource_id?: number
    job_id?: number
    production_id?: string
    scene_moment_id?: string
  }
  intent:
    | 'open_resource_library'
    | 'inspect_resource'
    | 'edit_prompt'
    | 'monitor_generation'
    | 'review_candidates'
    | 'preview_timeline'
    | 'review_impact'
    | 'project_status'
}
```

首批应支持的 Surface：

| Surface      | 路由建议                        | 入口工具                                                   |
| ------------ | ------------------------------- | ---------------------------------------------------------- |
| 资源库       | `/agent/resources`              | `system_resource_library_open`、resource query             |
| 资源详情     | `/agent/resources/:resourceId`  | resource read/query、generation output                     |
| 提示词工作台 | `/agent/content/prompt`         | prompt read/build/update、generation blocked               |
| 生成任务页   | `/agent/generation/jobs/:jobId` | generation submit/job get                                  |
| 候选对比页   | `/agent/content/candidates`     | candidate create/select/register、content-unit job success |
| 预览时间线   | `/agent/preview/timeline`       | `domain_read_preview_timeline`                             |
| 变更影响页   | `/agent/impact`                 | `domain_regeneration_plan`                                 |
| 项目状态页   | `/agent/project/status`         | `domain_production_status_summary`、focus/project open     |

Surface 的 URL 不应绑定 Desktop：

```text
local web:
http://127.0.0.1:<frontend-port>/agent/...

cloud web:
https://app.movscript.../agent/...
```

长期建议把 `/agent/...` 页面整理成可复用 Surface Host program。Desktop App 可以嵌入它，MovScript Agent Plugin App 可以打开它，Cloud App cloud profile 也可以同部署它。

## Project Source 模型

MovScript project source 是创作意图和产品状态的主要边界。Agent 和 UI 的 source 编辑应通过一致的 domain API 完成。

第一阶段 source 形态：

```text
Local project source directory
  project.json 或 workspace.json
  project_standards.json
  settings/**
  scripts/**
  content_units/**
  productions/**
```

Agent 不应把 `.interpret/` 当作产品状态写入。`.interpret/` 是解释器诊断和派生产物输出。

第二阶段 source 形态：

```text
Cloud Workspace Source API
  list/read/upsert/update/delete source records
  snapshot/version source state
  run inspect/interpret remotely or through queued worker
```

在 Cloud Workspace Source API 完成前，云端模式需要明确要求 `projectDir` 或通过 `movscript_project_fetch` 把云端/Git 项目同步到本地。

## Auth 和 Session

认证配置应迁移到独立 `movscript.auth.service`，并通过 `AuthProvider` 注入到 Data/Project/Editing Service。Auth Service 对外不暴露 JWT，不要求业务服务解析 token。统一使用 opaque `sk-...` access key；Data Service 不再拥有 login/session/token 的权威状态，只消费 `AuthProvider` 返回的 `AuthContext`，并在 resource/job/provider/project 业务范围内做授权。

因此 Auth Service 的目标应保持最小化：它不是大而全的账号平台，而是受控 profile 下的 `AuthContext` 生成、验证和撤销服务。Data/Project/Editing Service 只认可 `AuthContext`，不关心这个 context 来自 cloud/external Auth Service、`LocalOwnerAuthProvider`、`NoAuthProvider` 还是测试注入。

拆分后的服务边界：

| 服务 | 拥有什么 | 不拥有什么 |
| --- | --- | --- |
| `movscript.auth.service` | 最小 principal、session、opaque `sk-...` access key、agent token、service credential、roles/scopes/claims、introspection、revoke/rotate、auth audit、`AuthContext` 权威生成 | resource/job/provider/model/project 业务状态、generation queue、artifact storage、JWT/JWKS |
| `movscript.data.service` | resource、job、provider/model gateway、artifact metadata、Cloud Source API、业务侧 audit、worker loop；消费 `AuthContext` 并做业务授权 | 用户密码、session store、token 签发、`AuthContext` 权威生成、组织成员关系权威表 |
| `movscript.project.service` | project/source/candidate/interpret/read-model 权限执行 | 用户/session 权威状态 |
| `movscript.editing.service` | timeline/render/edit request 权限执行 | 用户/session 权威状态 |

云端模式必须部署独立 Auth Service。本地模式不启动 Auth Service，也不创建 user/org/tenant；本地服务通过 `LocalOwnerAuthProvider` 或显式 `NoAuthProvider` 工作。如需团队共享、本地多用户或调试云端身份流，应连接 cloud/external Auth Service，而不是由本地 runtime 启动 Auth Service。

### Opaque `sk-...` Access Key 模型

`sk-...` 是不透明 access key，不是 JWT，不承载可被客户端解析的身份信息。服务只做三件事：接收 token、交给 AuthProvider 验证、使用 AuthProvider 返回的 claims。

推荐 token 形态：

```text
sk-live-<random>     # cloud user / agent access key
sk-svc-<random>      # service-to-service key
sk-local-<random>    # local owner key，仅写入 MOVSCRIPT_HOME
sk-dev-<random>      # dev/test 显式 key
```

前缀只用于人类识别、路由和日志脱敏，不是权限来源；权限只来自 Auth Service/introspection 或 local AuthProvider 返回的 claims。

Auth Service 存储规则：

- token 只在创建时明文返回一次。
- 服务端只保存 `tokenPrefix`、`tokenHash`、`tokenLast4`、`principalKind`、`subject`、`scopes`、`expiresAt`、`revokedAt`、`createdBy`、`metadata`。
- `tokenHash` 应使用带服务端 secret 的 HMAC 或等价不可逆摘要，不能明文落库。
- 日志和 runtime status 只能显示 prefix/last4，不能输出完整 `sk-...`。
- token revoke/rotate 由 Auth Service 处理；业务服务通过 introspection cache TTL 控制撤销延迟。

长期 Introspection contract：

```ts
type TokenIntrospectionRequest = {
  token: string
  audience?: string
  action?: string
  resource?: AuthResource
}

type TokenIntrospectionResult = {
  active: boolean
  principalKind: 'cloud-user' | 'agent' | 'service' | 'local-owner' | 'anonymous' | 'test'
  subject: string
  scopes: string[]
  roles: string[]
  claims: Record<string, unknown>
  expiresAt?: string
  cacheTtlSeconds: number
}
```

业务服务可以短 TTL 缓存 introspection 结果，但不能把 `sk-...` 当成可解析 token，也不能在 Data/Project/Editing Service 内部自行签发 `sk-...`。

当前 `services/auth-service` 已经提供可运行服务 contract：`GET /health` 返回服务健康状态，`POST /v1/auth/introspect` 接收 `{ "token": "sk-..." }` 并返回 `{ active, token_type, principal, claims, auth_context }`；配置 `MOVSCRIPT_AUTH_MANAGEMENT_TOKEN` 后，`POST /v1/auth/keys/issue` 可以签发新的 opaque key，`POST /v1/auth/keys/revoke` 可以按 token 或 token_id 撤销 key；同一管理 token 保护的 user management、password hash management、org management、org member management 和 user/org membership contract 已经落地。当前 key store 仍可使用 `MOVSCRIPT_AUTH_STATIC_KEYS_JSON` 作为 dev/test/cloud bootstrap；identity 默认使用 Auth Service 自己的 SQLite/Postgres DB-backed provider，`MOVSCRIPT_AUTH_STATIC_IDENTITIES_JSON` 只作为显式测试/开发输入。Data Service 旧 org/admin-web 业务实现仍需继续切换到 Auth Service client。

### AuthProvider 抽象

Data/Project/Editing Service 不应直接硬编码“必须调用远程 Auth Service”。它们应依赖统一的 `AuthProvider` 抽象，由当前 profile 决定 provider 实现：

```ts
type AuthProvider = {
  mode: 'opaque-key' | 'local-owner' | 'no-auth' | 'test'
  authenticate(request: ServiceRequest): Promise<AuthContext>
  authorize(context: AuthContext, action: string, resource: AuthResource): Promise<AuthDecision>
  getServiceCredential?(audience: string): Promise<ServiceCredential>
}

type AuthContext = {
  authenticated: boolean
  principalKind: 'cloud-user' | 'agent' | 'service' | 'local-owner' | 'anonymous' | 'test'
  subject: string
  tenantId?: string // cloud only
  orgId?: string // cloud only
  local?: {
    homeId?: string
    workspaceId?: string
    deviceSessionId?: string
  }
  roles: string[]
  scopes: string[]
  claims: Record<string, unknown>
}
```

推荐 provider：

| Provider | 允许 profile | 行为 | 约束 |
| --- | --- | --- | --- |
| `OpaqueKeyAuthProvider` | `cloud`、external、advanced | 通过 Auth Service introspection 验证 `sk-...`，返回 principal/roles/scopes/claims | cloud profile 必须使用它或等价的受控外部 auth provider；不使用 JWT/JWKS |
| `LocalOwnerAuthProvider` | `local`、`desktop`、`plugin` | 为本机 runtime 生成稳定 `local-owner` principal；可选使用 `$MOVSCRIPT_HOME` 中的 `sk-local-...` owner key | 不创建 user/org/tenant，只绑定 loopback/local IPC，不用于公网 cloud deployment |
| `NoAuthProvider` | `dev`、`test`、显式 local unsafe profile | 返回固定 anonymous/dev subject，让业务流程无鉴权运行 | 必须显式配置，不能作为缺省 fallback；cloud profile 禁用 |
| `TestAuthProvider` | `test` | 按测试用例注入 claims 和权限结果 | 不进入生产 startup manifest |

关键规则：

- “没有 provider”不能在生产或 cloud 中静默退化为无鉴权；cloud profile 缺少 AuthProvider 必须启动失败。
- “无鉴权”应是显式 `NoAuthProvider`，并且 runtime status、日志、health/capability 必须清楚标记 `auth.mode=no-auth`。
- 本地体验需要免登录时，优先使用 `LocalOwnerAuthProvider`，而不是真正的 no-auth。
- Data Service 可以在 provider 返回的 `AuthContext` 上做业务授权，但不能自行签发用户 token 或维护用户/session 权威状态。
- MCP host、Agent Surface、Admin Web 应通过同一套 auth-client/AuthProvider 语义解释 session，避免 UI、MCP 和 service 对“当前用户”的理解不同。

当前实现状态：

- TS 侧 contract 已落地在 `packages/auth-client`，包含 introspection、issue/revoke、user list/create/update/profile、org list/create/update/member management、org membership client 和 AuthProvider contract，供 MCP host、Plugin App、Desktop App、Agent Surface、Admin Web 和后续 service client 复用；新 identity client 只接受 `id`/`created_at`/`updated_at` 等 Auth Service 字段名，不保留旧 `ID`/`CreatedAt` 兼容。
- Go 侧 contract 已由 Auth Service pkg 统一承接：`services/auth-service/pkg/authprovider` 提供 `Provider`、`AuthContext`、`LocalOwnerProvider`、`NoAuthProvider` 和 `OpaqueKeyProvider`；`services/auth-service/pkg/authidentity` 承接 Auth Service user profile / org membership reader、user/org/member management client、identity value contract，以及本地模式的 `LocalOwnerManager` 虚拟 owner/workspace read model。Data Service 通过 `github.com/movscript/auth-service` + local replace 消费这些 Go contract，不再拥有 `internal/app/authprovider`、`internal/app/authidentity` 或 `internal/domain/identity`。Auth Service 侧的 DB-backed identity provider 已落地在 `services/auth-service/internal/infra/dbidentity`，并通过 `services/auth-service/internal/infra/db` 连接 SQLite/Postgres 与运行 migration。
- Data Service HTTP router/middleware 已接入 `AuthProvider`，bootstrap 也已经根据 `MOVSCRIPT_AUTH_MODE` / `MOVSCRIPT_AUTH_BASE_URL` / `MOVSCRIPT_AUTH_SERVICE_MANAGEMENT_TOKEN` 装配 AuthProvider 与 AuthIdentity：`IdentityWithAuthProvider(provider)` 只接受 opaque `sk-...` bearer，经 provider 解析成 `AuthContext`，并通过 `CurrentAuthContextFromContext` 暴露给后续 handler；local-owner provider 注入固定本地 owner claims，并由 Auth Service Go contract 的 `LocalOwnerManager` 提供本地 org membership。`CurrentUserProfileFromContext` 只从 `AuthContext` 中显式的 `user_id`/`uid`/`data_service_user_id` 等 user claims 派生业务用户视图；纯 agent/service `AuthContext` 不会伪装成用户。HTTP identity middleware 不再接收 DB、旧 token manager 或 encryption key，不再解析旧 session cookie、signed bearer、BasicAuth 或 `git_token` query；Git proxy temporary clone URL 的签名 token 已重命名为 Data Service scoped token，使用 `internal/infra/scopedtoken` 与 `GIT_PROXY_TOKEN_SECRET` / `GIT_PROXY_TOKEN_TTL_HOURS`。`ResolveOrgMember` / `InjectOrgMember` 已切到 `AuthIdentity.OrgMemberships`，不再构造本地 org service；Data Service router 不再注册旧 `/auth/*`、admin auth settings、admin session revoke HTTP surface 或 admin password reset HTTP surface，HTTP handler 层也不再包含旧 `AuthHandler`；旧 `internal/app/auth`、`internal/domain/auth`、`internal/app/authprovider`、`internal/infra/auth`、`internal/app/authidentity`、`internal/domain/identity` 和本地协作用户 `internal/app/user` 已删除；`AuthChallenge`、`AuthSession` 持久化模型已删除；model gateway API key owner 校验和 legacy personal org scope 判断已切到 AuthIdentity capability。Admin user/org/member 管理 handler、`GET /users` 协作用户搜索和 project member 新增前置校验已切到 AuthIdentity capability，Data Service admin user service 已收敛为 usage/audit/project detail 聚合，Data Service admin org service 已收敛为 org detail、invitation、join-code 本地业务能力，不再拥有身份权威写能力；password hash credential 只能通过 Auth Service `PUT /v1/auth/users/{id}/password` 修改，`POST /v1/auth/users` 不再携带 `password_hash`。

优先级建议：

1. MCP host 显式参数。
2. 环境变量：
   - `MOVSCRIPT_HOME`
   - `MOVSCRIPT_AUTH_MODE`
   - `MOVSCRIPT_LOCAL_OWNER_KEY`
   - `MOVSCRIPT_AUTH_BASE_URL`
   - `MOVSCRIPT_AUTH_TOKEN`
   - `MOVSCRIPT_API_BASE_URL`
   - `MOVSCRIPT_API_TOKEN`
   - `MOVSCRIPT_WORKSPACE_DIR`
   - `MOVSCRIPT_DATA_SERVICE_MODE`
3. `$MOVSCRIPT_HOME/config/local-auth.json`
4. opaque-key profile 才读取 `$MOVSCRIPT_HOME/runtime/endpoints/movscript.auth.service.json`
5. opaque-key profile 才读取 `$MOVSCRIPT_HOME/config/auth-service.json`
6. opaque-key profile 才读取 `$MOVSCRIPT_HOME/config/realms/<realm>/auth.json`
7. `$MOVSCRIPT_HOME/runtime/endpoints/movscript.data.service.json`
8. `$MOVSCRIPT_HOME/config/data-service.json`
9. 默认 local service profile；Data/Project/Editing health probe 通过，且 AuthProvider 可解析后，才认为 local profile ready。

CLI 继续作为登录入口：

```bash
movcli auth login --auth-server http://localhost:<auth-port>
movcli auth login --auth-server https://auth.movscript.example
movcli auth status
movcli auth logout
```

MovScript Agent Plugin App README 需要给出本地模式、云端模式和无交互 token 模式的配置示例。无交互场景应使用 Auth Service 签发的 agent token 或 service credential，不直接复用用户长期 session。

拆分顺序建议：

1. 已完成第一批：定义 Auth Service program manifest，并在 `services/auth-service` 落地独立 Go module、build wrapper、`movscript-auth-service serve`、health check 和 opaque key introspection endpoint。
2. 已完成第二批：定义 `packages/auth-client`、Auth claims 类型、`OpaqueKeyAuthProvider`/`LocalOwnerAuthProvider`/`NoAuthProvider` contract，并建立 Go 侧 `authprovider.Provider` 边界。后续第五十五批已把该 Go provider contract 迁入 `services/auth-service/pkg/authprovider`。
3. 已完成第三批：Data Service HTTP router/middleware 可以依赖 `authprovider.Provider`；cloud/managed-local 配置 `MOVSCRIPT_AUTH_BASE_URL` 后使用 `OpaqueKeyProvider`，本地默认 `LocalOwnerProvider`。
4. 已完成第四批：Auth Service 支持管理 token 保护的 opaque key issue/revoke endpoint，`packages/auth-client` 提供对应 client 方法。
5. 已完成第五批：Data Service router 移除旧 `/auth/*`、admin auth settings、admin session revoke HTTP surface，router composition 不再构造旧 `AuthHandler`。
6. 已完成第六批：删除 Data Service HTTP 层旧 `AuthHandler` 和对应 `/auth/*` handler 测试，身份 HTTP 入口只保留 AuthProvider middleware 和业务 handler 消费 `AuthContext` 的路径。
7. 已完成第七批：model gateway signed-token fallback 不再调用旧 `auth.Service.CurrentUser`，只做最小的本地用户存在性和 active 状态检查；旧 `services/data-service/internal/app/auth` 已删除，边界测试禁止 Data Service 重新保留旧 auth application。
8. 已完成第八批：旧 `services/data-service/internal/domain/auth` 先拆成 `services/data-service/internal/domain/identity`；Data Service 只保留业务侧用户资料、角色、状态、邮箱规范化和 user model 映射，不再保留 challenge/session 等认证 domain 类型。后续第五十四批已继续把该 identity value contract 迁入 `services/auth-service/pkg/authidentity/identity`。
9. 已完成第九批：Data Service `AuthChallenge`、`AuthSession` 持久化模型和 baseline migration 注册已删除，认证挑战/登录会话不再由 Data Service 表结构承载；Admin User 详情不再返回 session 列表，Admin UI 不再调用 Data Service session revoke API。
10. 已完成第十批：Auth Service 增加管理 token 保护的 `GET /v1/auth/users/{id}` 和 `GET /v1/auth/users/{id}/org-memberships` 只读 contract，`packages/auth-client` 增加对应 client 方法；该批先用 `MOVSCRIPT_AUTH_STATIC_IDENTITIES_JSON` 注入静态 identity directory，后续批次已替换为 Auth Service DB-backed identity provider。
11. 已完成第十一批：Auth Service identity wire contract 硬迁移为 `id`/`created_at`/`updated_at` 等新字段名，`packages/auth-client` 不再兼容旧 `ID`/`CreatedAt`；Data Service 当时增加 Go reader，并由 bootstrap 通过 `MOVSCRIPT_AUTH_SERVICE_MANAGEMENT_TOKEN` 装配为 `AuthIdentity` 依赖。后续第五十四批已把该 Go reader 迁入 `services/auth-service/pkg/authidentity`。
12. 已完成第十二批：Auth Service 增加自己的 `User`、`Organization`、`OrganizationMember` 持久化模型、SQLite/Postgres 连接、migration 和 DB-backed identity provider；`movscript-auth-service serve` 默认使用 Auth Service 数据库 identity provider，只有显式设置 `MOVSCRIPT_AUTH_STATIC_IDENTITIES_JSON` 时才切换到静态 identity directory。
13. 已完成第十三批：Auth Service 增加管理 token 保护的 `GET /v1/auth/users`、`POST /v1/auth/users`、`PATCH /v1/auth/users/{id}`，DB-backed identity provider 支持 user list/create/update、个人 org 自动创建、duplicate key 映射和 last super admin 保护；`packages/auth-client` 增加对应 TS client 方法。
14. 已完成第十四批：Auth Service 增加管理 token 保护的 `GET /v1/auth/orgs`、`POST /v1/auth/orgs`、`PATCH /v1/auth/orgs/{id}`、`GET/POST /v1/auth/orgs/{id}/members`、`PATCH/DELETE /v1/auth/orgs/{id}/members/{user_id}`，DB-backed identity provider 支持 org list/create/update、member list/add/update/remove 和 last owner 保护；`packages/auth-client` 增加对应 TS client 方法。
15. 已完成第十五批：Go 侧 `authidentity` 从只读 reader 扩展为 Auth Service identity manager，覆盖 `ListUsers`、`CreateUser`、`UpdateUser`、`ListOrgs`、`CreateOrg`、`UpdateOrg`、`ListOrgMembers`、`AddOrgMember`、`UpdateOrgMember` 和 `RemoveOrgMember`，并映射 400/401/404/409 错误；Auth Service / TS auth-client / Go client 同步支持 org list 的 `org_id` filter。该 Go client 已在第五十四批迁入 Auth Service pkg。
16. 已完成第十六批：Data Service/Admin Web 的 admin user/org/member 管理 handler 已切到 `authidentity.Manager`，router dependency 从 `authidentity.Reader` 提升为 `authidentity.Manager`；Data Service 不再注册 `/api/v1/admin/users/:id/password`，Admin User 页面不再提交 password 或 password reset 请求，`internal/app/admin/user` 已硬迁移为本地 project/usage/audit detail 聚合，`internal/app/admin/org` 已硬迁移为本地 org detail、invitation、join-code 聚合/业务能力，不再保留 user/org/member create/update/list/password 本地身份读写代码。
17. 已完成第十七批：Auth Service credential/password management 作为正式 contract 补齐为管理 token 保护的 `PUT /v1/auth/users/{id}/password`，DB-backed identity provider 只在该接口写 `password_hash`；`POST /v1/auth/users`、`packages/auth-client.createUser` 和 Data Service Go `authidentity.CreateUserInput` 不再携带 password hash，TS/Go client 都提供显式 `setUserPasswordHash`/`SetUserPasswordHash` 方法。
18. 已完成第十八批：Data Service `GET /api/v1/users` 协作用户搜索切到 `authidentity.Manager.ListUsers`，`newHandlers` 通过 `deps.AuthIdentity` 注入 `UserHandler`，并删除本地 `internal/app/user` 和未使用的 `UserCreateInput`，不再保留本地协作用户创建/搜索 app。
19. 已完成第十九批：匿名接受邀请的注册路径切到 `authidentity.Manager.CreateUser` + `SetUserPasswordHash`，`OrgHandler` 通过 router 注入 `deps.AuthIdentity`；`internal/app/org.AcceptInvitation` 不再接收 `RegistrationInput`、不再生成 password hash、不再写 Data Service 本地 `users` 或 personal org，邀请消费也不再要求本地 `users` 表存在对应用户行。
20. 已完成第二十批：普通组织成员新增 `POST /orgs/:id/members` 通过 `OrgHandler` 使用 `authidentity.Manager.UserProfile/ListUsers` 按 `user_id` 或 `username` 解析目标用户，`internal/app/org.AddMember` 只接收已解析的 `domainorg.User` 并处理组织权限/角色/成员行；`gormRepository.CreateMember` 不再调用 `ensureActiveUserExists`，该路径不再要求 Data Service 本地 `users` 表有目标成员行。
21. 已完成第二十一批：join-code 加入和用户组成员新增不再要求 Data Service 本地 `users` 表存在对应用户行；`JoinByCode` 继续消费 AuthContext 转出的 `domainorg.User`，`AddGroupMember` 由 HTTP handler 通过 `authidentity.Manager.UserProfile` 解析目标用户后交给 org service；`gormRepository.JoinByCode/CreateGroupMember` 不再调用本地 active user 检查，旧 `ensureActiveUserExists` 已删除。
22. 已完成第二十二批：Data Service 增加 `authidentity.LocalOwnerManager` 作为本地模式虚拟 owner/workspace read model，`LocalOwnerProvider` 同步注入 `user_id=1`、`username=local-owner` 等 claims；router 将 `deps.AuthIdentity` 注入 `ResolveOrgMember` 和 `InjectOrgMember`，current membership middleware 通过 `AuthIdentity.OrgMemberships` 选择当前 workspace，不再构造本地 `org.Service` 或读取 `organization_members` 作为身份权威。
23. 已完成第二十三批：`ProjectHandler` 通过 `deps.AuthIdentity` 注入身份 manager，`AddMember` / `AdminAddMember` 在进入 project service 前使用 `UserProfile` 校验目标用户存在和 active 状态，并用 `OrgMemberships` 校验普通项目成员属于当前 workspace；`project.gormRepository.AddMember` 不再查询本地 `users` 或 `organization_members`，只保留 project 存在性、owner lock 和 project member upsert。
24. 已完成第二十四批：组织 usage API 的用户展示字段切到 AuthIdentity，`org.gormRepository.GetUsage` 只按 `usage_logs.user_id` 聚合成本和 tokens，不再 `JOIN users`；`OrgHandler.GetUsage` 通过 `AuthIdentity.UserProfile` 补 username，本地 users 表不再作为该读模型的信息源。
25. 已完成第二十五批：admin usage read model 的用户展示字段切到 AuthIdentity，`admin/usage.Service` 通过 `authidentity.Reader.UserProfile` 补齐 usage log/top user 的 `UserRef`，`admin/usage.gormRepository` 只保留 usage 聚合、catalog entry 和 route binding 读取，不再 `Preload("User")`、`fillUserRefs` 或查询本地 `users` 表。
26. 已完成第二十六批：project admin owner 校验切到 AuthIdentity，`project.Service` 增加 `NewServiceWithIdentity` 并通过 `authidentity.Reader.UserProfile` 校验 `AdminCreate` / `ForceSetOwner` 的 owner 存在性和 active 状态；`ProjectHandler` 构造 project service 时注入 `deps.AuthIdentity`；`project.gormRepository.ForceSetOwner` 和 `AdminCreate` 不再查询本地 `users` 表、不再使用 `userIsActive`。
27. 已完成第二十七批：project/admin-web read model 的 owner/member 展示字段切到 AuthIdentity enrichment，`project.Service` 对 `List`、`AdminList`、`AdminDetail`、`Get`、`GetByUID`、`AdminCreate`、`ForceSetOwner`、`AdminUpdate`、`AddMember`、`UpdateMemberRole` 和 `ListMembers` 的返回值统一通过 `authidentity.Reader.UserProfile` 补齐 `domainproject.UserRef`；`project.gormRepository` 不再 `Preload("Owner")`、`Preload("Members.User")` 或 `Preload("User")`。
28. 已完成第二十八批：model gateway 删除旧 signed backend token fallback，`ModelGatewayHandler` 不再持有 legacy token manager，gateway principal 只来自当前 `AuthContext` 用户或正式 Gateway API key；`NewModelGatewayHandler` 不再接收 `tokens`，`model_gateway_auth.go` 不再调用 `auth.LooksSigned` / `tokens.Verify` 或回查本地 `users` 表。
29. 已完成第二十九批：debug/LLM call log read model 的用户展示字段切到 AuthIdentity enrichment，`DebugHandler` 通过 router 注入 `deps.AuthIdentity`，`debug.Service` 通过 `authidentity.Reader.UserProfile` 补齐 `LLMCallLogUserRef`，`debug.gormRepository` 不再 `Preload("User")` 或读取本地 `users` 表拼用户展示信息。
30. 已完成第三十批：model gateway API key owner 校验切到 AuthIdentity，`ModelGatewayHandler` 通过 router 注入 `deps.AuthIdentity`，`gateway.Service.PrincipalForAPIKey` 使用 `authidentity.Reader.UserProfile` 校验 owner 存在且 active；`gateway.gormRepository` 删除 `UserExists`，不再读取 Data Service 本地 `users` 表决定 Gateway API key 是否可用。
31. 已完成第三十一批：admin overview 的用户/组织概览统计切到 AuthIdentity，`AdminOverviewHandler` 通过 router 注入 `deps.AuthIdentity`，`admin/overview.Service` 使用 `ListUsers`/`ListOrgs` 读取用户总数、active 用户数、非 active 用户数和 suspended 组织数；`admin/overview.gormRepository` 只保留 Data Service 业务资源统计，不再统计本地 `users` / `organizations` 表。
32. 已完成第三十二批：admin resource owner 展示字段切到 AuthIdentity enrichment，`ResourceAdminHandler` 通过 router 注入 `deps.AuthIdentity`，`admin/resource.Service` 使用 `authidentity.Reader.UserProfile` 补齐 storage stats username 和 resource owner `UserRef`；`admin/resource.gormRepository` 不再 `Preload("Owner")`、不再批量查询本地 `users` 表补 username。
33. 已完成第三十三批：组织成员列表和用户组成员 read model 切到 AuthIdentity enrichment，`OrgHandler` 通过 `orgapp.NewServiceWithIdentity(db, deps.AuthIdentity)` 构造 service，`org.Service` 使用 `authidentity.Reader.UserProfile` 补齐 member/group member `User` 展示对象；`org.gormRepository` 不再 `FindUserByID`、`Preload("User")` 或 `Preload("Members.User")`，成员关系仍由 Data Service 本地 org 业务表管理，但用户资料不再从本地 users 表读取。
34. 已完成第三十四批：admin org detail / rotate join code 返回中的 `member_count` 切到 AuthIdentity，`OrgAdminHandler` 使用 `adminorg.NewServiceWithIdentity(db, deps.AuthIdentity)` 构造 service，`admin/org.Service` 通过 `ListOrgMembers` 计算成员数量；`admin/org.gormRepository` 只保留本地 org detail、invitation、join-code、project/resource/usage/audit 聚合，不再从本地 `organization_members` 统计成员数量。
35. 已完成第三十五批：project repository 个人 owner 解析切到 AuthIdentity，`ProjectHandler` 使用 `projectrepoapp.NewServiceWithIdentity(db, workspaceProvider.Config, workspaceProvider.Adapter, deps.AuthIdentity)` 构造 repository service，`projectrepo.Service` 通过 `authidentity.Reader.UserProfile` 获取个人项目仓库 owner username；`projectrepo.gormRepository` 不再 `Preload("Owner")`，service 不再读取 `project.Owner.Username`。
36. 已完成第三十六批：entitlement org snapshot 切到 AuthIdentity，bootstrap 使用 `entitlementapp.NewServiceWithIdentity(database, cfg, authIdentity)` 构造权益服务，community entitlement runtime 通过 `ListOrgs(org_id)` 读取 org `is_personal/status`；`services/data-service/internal/app/entitlement/repository.go` 已删除，权益服务不再查询本地 `organizations` 表。
37. 已完成第三十七批：model gateway legacy personal org scope 判断切到 AuthIdentity，`PolicyService` 通过 `ListOrgs(org_id)` 判断 personal org 后决定是否包含历史个人 API key；`gateway.gormRepository` 删除 `IsPersonalOrg`，不再读取 Data Service 本地 `organizations` 表判断 Gateway API key 作用域。
38. 已完成第三十八批：resource/resource-folder legacy personal scope 判断切到 AuthIdentity，`ResourceHandler` 和 `ResourceFolderHandler` 通过 router 注入 `deps.AuthIdentity`，`resource.Service` / `resource/folder.Service` 使用 `NewServiceWithIdentity` 构造仓储，普通资源和资源文件夹仓储通过 `ListOrgs(org_id)` 判断 personal org；`resource.gormRepository` 和 `resource/folder.gormRepository` 不再读取 Data Service 本地 `organizations` 表判断历史个人资源作用域。
39. 已完成第三十九批：canvas/job legacy personal scope 判断切到 AuthIdentity，`CanvasHandler` 和 `JobHandler` 通过 router 注入 `deps.AuthIdentity`，`canvas.Service` / `job.Service` 使用 `NewServiceWithIdentity` 构造仓储，canvas 和 job 仓储通过 `ListOrgs(org_id)` 判断 personal org；`canvas.gormRepository` 和 `job.gormRepository` 不再读取 Data Service 本地 `organizations` 表判断历史个人作用域。
40. 已完成第四十批：project repository 组织 owner 解析切到 AuthIdentity，`projectrepo.Service` 的 identity 依赖扩展为 `projectRepoIdentity`，通过 `UserProfile` 读取个人 owner username，并通过 `ListOrgs(org_id)` 读取组织 owner 的 name/slug/is_personal；`projectrepo.gormRepository.GetProject` 不再 `Preload("Organization")`，service 不再依赖 `project.Organization`。
41. 已完成第四十一批：project admin create 的 org existence/status 校验切到 AuthIdentity，`project.Service` 的 identity 依赖扩展为 `projectIdentity`，通过 `ListOrgs(org_id)` 判断组织是否存在和是否 suspended；`project.gormRepository.AdminCreate` 不再读取本地 `organizations` 表或执行 `Select("id, status")`，repository 只负责创建 project/member 业务记录。
42. 已完成第四十二批：`org.Service.ResolveCurrentMember` 不再因为本地 membership 为空而调用 AuthIdentity profile 自动创建 Data Service personal org/member；本地模式的默认 workspace 只由 `LocalOwnerManager` 虚拟 read model 提供。`org.repository` 删除 `FindPersonalMember` 和 `CreatePersonalOrg` 能力，`personal_org_repository.go` 只保留 team org / join-code 需要的 join code 生成与补齐。
43. 已完成第四十三批：普通用户 `GET /orgs` 切到 `AuthIdentity.OrgMemberships(current_user)`，`OrgHandler.List` 直接返回 AuthIdentity membership 映射出的 org+role 列表；`org.Service.List`、`org.repository.List` 和本地 `organization_members -> organizations` 列表查询已删除，当前用户工作区列表不再以 Data Service 本地 membership 表为身份来源。
44. 已完成第四十四批：删除 `org.Service.ResolveCurrentMember` / `GetMemberForUser` 这组旧 app 级 current-membership 解析入口，并删除 `org.repository.ListUserMembers`；HTTP current workspace 解析只保留 middleware 通过 `AuthIdentity.OrgMemberships` 产生 `ContextOrgMember`。同时删除 `domain/org` 中本地 personal org factory（`NewPersonalOrg`、`PersonalOrgSlug`、`UserIdentity`、`UserIdentityFromModel`），避免 Data Service 重新拥有本地 personal org 创建语义。
45. 已完成第四十五批：`domain/org` 删除从 Data Service 本地 `persistencemodel.User` 构造 `domainorg.User` 的 model mapping，`OrganizationMemberFromModel` / `UserGroupMemberFromModel` 不再读取或写入嵌套 `User` 模型；组织成员和用户组成员展示字段只允许由 `org.Service` 的 AuthIdentity enrichment 补齐。
46. 已完成第四十六批：Data Service `domain/identity` 收缩为业务侧 `UserProfile` / system role / active status 值对象，删除旧 `RegisteredUser`、`PasswordHash`、`NewRegisteredUser`、`ProfileUpdateSpec`、`NormalizeEmail` 以及本地 `persistencemodel.User` mapping 文件；Data Service 不再保留本地账号注册/密码/profile update domain model。
47. 已完成第四十七批：`domain/project`、`domain/resource` 和 `domain/resource/folder` 删除从 Data Service 本地 `persistencemodel.User` 构造 `UserRef` 的 mapping helper；project owner/member、resource owner、resource folder owner 展示字段只允许由对应 service 的 AuthIdentity enrichment 补齐，domain model conversion 只保留 owner_id/user_id 等业务外键。
48. 已完成第四十八批：Data Service persistence schema 硬删除本地 `User` 模型和所有 GORM `User` 关系字段，`allModels()` 不再迁移 `users` 表，baseline 不再执行 `seedDefaultOrg` / super admin / local users 默认组织补齐；业务表只保留 `owner_id` / `user_id` / `created_by` 这类外部身份外键。相关测试 fixture 已改为 `testutil.ExternalUser` + AuthIdentity fake，`migrations_test` 和 `service-program-boundary.test.mjs` 增加反向守卫，防止 Data Service 重新拥有本地账号表或本地用户关系。
49. 已完成第四十九批：Data Service `internal/app/org` 的普通组织成员列表、新增、角色更新、删除、邀请接受、join-code 加入和用户组成员前置 membership 校验切到 AuthIdentity 的 `ListOrgMembers` / `AddOrgMember` / `UpdateOrgMember` / `RemoveOrgMember`。`org.repository` 不再提供本地 `organization_members` CRUD、owner count 或 join-code 写成员能力；邀请 repository 只消费本地 invitation，join-code repository 只查找本地 team org。组织成员身份写入权威收敛到 Auth Service / LocalOwnerManager。
50. 已完成第五十批：Data Service persistence schema 硬删除本地 `OrganizationMember` 模型和 `Organization.Members` GORM 关系，`allModels()` 不再迁移 `organization_members` 表；`domain/org` 删除 `OrganizationMemberFromModel` / `OrganizationMembersFromModels` 和本地 member `ToModel` mapping。测试 fixture 不再创建 Data Service 本地成员行，HTTP/project context 只使用 `domainorg.OrganizationMember` 作为 AuthIdentity membership 的请求 DTO。`service-program-boundary.test.mjs` 增加反向守卫，防止 Data Service 重新拥有本地组织成员身份表。
51. 已完成第五十一批：删除 `apps/admin` 应用形态，Admin Web 源码、Vite/TS/Tailwind/test 配置和现有 dist 产物归位到 `services/admin-web`，workspace package 改为 `@movscript/admin-web`；root/release/Desktop/Data Service Docker 和 admin asset copy 脚本都改为按 service package 构建并从 `services/admin-web/dist` 取产物。`services/admin-web/program.manifest.ts` 继续作为 `movscript.admin.web` 的独立 program manifest。
52. 已完成第五十二批：新增 `surface/project` workspace package，承接 `/agent/*` route 常量、动态 path helper、browser URL 构造、surface intent/entity contract 和 MCP proxy handoff contract；`packages/core/src/mcp/node/tools/surfaces.ts` 不再本地实现 surface URL 逻辑，只从 `@movscript/project-surface` 重导出；Desktop `projectRoutes.ts` 的 Agent Surface route 常量已切到共享 `AGENT_SURFACE_ROUTES`。`tests/scripts/frontend/mcp-agent-surfaces-boundary.test.mjs` 增加守卫，防止 route/URL contract 回流到 Core 或 Desktop。
53. 已完成第五十三批：`AgentSurfaceShell`、`AgentSurfacePanel`、`AgentSurfaceJson`、`AgentSurfaceKeyValues`、`AgentSurfaceLink` 和共享 CSS 已从 Desktop `/agent/*` 页面目录迁入 `surface/project/src/components`，并统一使用 `@movscript/theme` 的 `--ms-*` token；`@movscript/project-surface` root 入口保持纯 route/URL contract，React shell 通过 `@movscript/project-surface/react` 子入口导出，避免 Core/MCP typecheck 解析 TSX；Desktop `/agent/*` 页面全部改为消费 React 子入口。`services/local-surface-host` 从仅有 program manifest 的占位目录升级为 `@movscript/project-surface-web` workspace package，拥有 Vite/TS 构建入口、独立 `index.html` 和最小 service web shell。边界测试增加守卫，防止共享 UI shell 回流到 Desktop 或 local-surface-host 退化为空壳。
54. 已完成第五十四批：Go 侧 AuthIdentity contract/client/local-owner manager 从 Data Service 内部迁入 `services/auth-service/pkg/authidentity`，identity value contract 迁入 `services/auth-service/pkg/authidentity/identity`；Data Service 删除 `internal/app/authidentity` 和 `internal/domain/identity`，通过 `github.com/movscript/auth-service` + local replace 消费 Auth Service Go contract，并同步 vendor 元数据。边界测试改为守卫 Auth Service pkg 归属和 Data Service 内部旧目录不存在。
55. 已完成第五十五批：Go 侧 AuthProvider contract/local-owner/no-auth/opaque-key provider 从 Data Service 内部迁入 `services/auth-service/pkg/authprovider`；Data Service 删除 `internal/app/authprovider`，通过 `github.com/movscript/auth-service` + local replace 消费 Auth Service Go provider contract，并同步 vendor 元数据。边界测试改为守卫 Auth Service pkg 归属和 Data Service 内部旧目录不存在。
56. 已完成第五十六批：Data Service 删除旧 `internal/infra/auth`，将 Git proxy temporary clone URL 的 HMAC token helper 重命名为 `internal/infra/scopedtoken`；配置字段和环境变量硬迁移为 `GitProxyTokenSecret` / `GitProxyTokenTTLHours` 与 `GIT_PROXY_TOKEN_SECRET` / `GIT_PROXY_TOKEN_TTL_HOURS`，不保留旧 `AUTH_TOKEN_*` fallback。HTTP identity middleware 签名收缩为 `IdentityWithAuthProvider(provider)`，不再接收 DB、旧 token manager 或 encryption key。
57. 已完成第五十七批：`surface/project/src/data.ts` 承接 browser-neutral Agent Surface snapshot/action data adapter contract、`agentSurfaceParams`、query invalidation helper 和 record/array/string/number value helpers；Desktop `apps/desktop/src/pages/agent/agentSurfaceData.ts` 收缩为只绑定 Desktop `api` 的薄 wrapper，不再拥有 MCP proxy snapshot/action request 语义。`surface/project` 测试和前端/service 边界测试增加守卫，防止 data adapter 回流到 Desktop。
58. 已完成第五十八批：`surface/project/src/components/AgentProjectStatusSurface.tsx` 承接 Project Status route view 的 readiness lanes、recent candidates、selected resources、generation jobs 和 status summary rendering；`apps/desktop/src/pages/agent/AgentProjectStatusPage.tsx` 收缩为只绑定 Desktop MCP proxy、URL params、`fetchAgentSurfaceSnapshot('project-status')` 和共享 React surface 的薄 route wrapper。前端/service 边界测试增加守卫，防止 Project Status view 逻辑回流到 Desktop。
59. 已完成第五十九批：`surface/project/src/components/AgentImpactSurface.tsx` 承接 Impact route view 的 affected targets、decision semantics、review navigation、accept-stale affordance 和 raw regeneration plan rendering；`apps/desktop/src/pages/agent/AgentImpactPage.tsx` 收缩为只绑定 Desktop MCP proxy、URL params、`fetchAgentSurfaceSnapshot('impact')`、`postAgentSurfaceAction('impact', 'accept-stale')` 和 shared surface 的薄 route wrapper。前端/service 边界测试增加守卫，防止 Impact view 逻辑回流到 Desktop。
60. 已完成第六十批：`surface/project/src/components/AgentContentPromptSurface.tsx` 承接 Prompt route view 的 prompt source discovery、target path fallback、dirty/reset state、semantic ref editing form、prompt save affordance、impact/candidate navigation 和 runtime/dependency rendering；`apps/desktop/src/pages/agent/AgentContentPromptPage.tsx` 收缩为只绑定 Desktop MCP proxy、URL params、`fetchAgentSurfaceSnapshot('content-prompt')`、`postAgentSurfaceAction('content-prompt', 'save')` 和 shared surface 的薄 route wrapper。前端/service 边界测试增加守卫，防止 Prompt view 逻辑回流到 Desktop。
61. 已完成第六十一批：`surface/project/src/components/AgentContentCandidatesSurface.tsx` 承接 Candidates route view 的 candidate visibility rendering、selected stable dependency 状态、candidate decision buttons、candidate/job/resource navigation、resource preview slot 和 `agentContentCandidateResourceIds` resource adapter helper；`apps/desktop/src/pages/agent/AgentContentCandidatesPage.tsx` 收缩为只绑定 Desktop MCP proxy、URL params、`fetchAgentSurfaceSnapshot('content-candidates')`、resource preview query、Desktop `MediaViewer` render adapter、`postAgentSurfaceAction('content-candidates', 'decision')` 和 shared surface 的薄 route wrapper。前端/service 边界测试增加守卫，防止 Candidates view 逻辑回流到 Desktop。
62. 已完成第六十二批：`surface/project/src/components/AgentPreviewTimelineSurface.tsx` 承接 Preview Timeline route view 的 selected timeline clips、blockers、editing handoff、raw timeline data rendering、preview navigation 和 `agentPreviewTimelineResourceIds` media/resource adapter helper；`apps/desktop/src/pages/agent/AgentPreviewTimelinePage.tsx` 收缩为只绑定 Desktop MCP proxy、URL params、`fetchAgentSurfaceSnapshot('preview-timeline')`、resource preview query、Desktop `MediaViewer` render adapter 和 shared surface 的薄 route wrapper。前端/service 边界测试增加守卫，防止 Preview Timeline view 逻辑回流到 Desktop。
63. 已完成第六十三批：`surface/project/src/components/AgentGenerationJobSurface.tsx` 承接 Generation Job route view 的 job status、output resources、generation input、resource diagnostics、candidate write state、provider context 和 raw job rendering；`apps/desktop/src/pages/agent/AgentGenerationJobPage.tsx` 收缩为只绑定 Desktop route params、MCP proxy readiness、`GET /jobs/{id}` 轮询、Desktop `MediaViewer` render adapter 和 shared surface 的薄 route wrapper。前端/service 边界测试增加守卫，防止 Generation Job view 逻辑回流到 Desktop。
64. 已完成第六十四批：`surface/project/src/components/AgentResourceDetailSurface.tsx` 承接 Resource Detail route view 的 RawResource preview、metadata、copy actions、usage references、job/candidate navigation 和 raw resource rendering；`apps/desktop/src/pages/agent/AgentResourceDetailPage.tsx` 收缩为只绑定 Desktop route params、MCP proxy readiness、`GET /resources/{id}`、`GET /resources/{id}/usages`、Desktop `MediaViewer` render adapter 和 shared surface 的薄 route wrapper。前端/service 边界测试增加守卫，防止 Resource Detail view 逻辑回流到 Desktop。
65. 已完成第六十五批：`surface/project/src/components/AgentResourceLibrarySurface.tsx` 承接 Resource Library agent shell 的 readiness、URL query param restore、focus resource id parsing 和 `agentReferenceActions` render contract；`apps/desktop/src/pages/agent/AgentResourceLibraryPage.tsx` 收缩为只绑定 Desktop route redirect、MCP proxy readiness 和当前 Desktop `ResourceLibraryView` 注入。该批只完成 agent shell/params 迁移，resource browser 本体仍需后续抽成可复用 package/data adapter。
66. 已完成第六十六批：`surface/project/src/resourceLibrary.ts` 承接 Resource Library browser-neutral model/view props contract，包括 type/scope filters、page size、resource id helpers、adjacent resource、project scope filtering、pagination 和 URL param normalization；Desktop 旧 `resourceLibraryModel.ts` / `resourceLibraryViewTypes.ts` 已删除，`ResourcesPage`、`ResourcesPageToolbar`、`ResourcesPageExternalSearch` 和 `useResourceLibraryController` 改为从 `@movscript/project-surface` 消费共享 contract。前端/service 边界测试增加守卫，防止 Resource Library 纯模型回流到 Desktop feature。
67. 已完成第六十七批：`surface/project/src/resourceQueryKeys.ts` 承接 resource/resource binding/external resource/resource folder/share target/resource candidate/canvas resource/resource text query key contract；Desktop 旧 `features/resources/application/resourceQueryKeys.ts` 已删除，resource mutation/cache、ResourcesPage controller、external resource search、settings、canvas、agent 和 shared UI 全部改为从 `@movscript/project-surface` 消费共享 query key contract。边界测试同步增加旧文件不存在和共享包导出守卫，确保 Desktop 不再拥有可复用资源查询 contract。
68. 已完成第六十八批：`surface/project/src/resourceDragPayload.ts` 和 `surface/project/src/resourceInteraction.ts` 承接 resource drag/drop payload protocol、context menu positioning、interactive-target guard、drop accept/resolve 和 start drag helper；Desktop 旧 `features/resources/domain/resourceDragPayload.ts` / `resourceInteraction.ts` 及其旧单测已删除，Agent Composer、Canvas drop target、Canvas resource shelf、ToolDialog、ResourcePanelItems、Resource Library controller/items 改为直接消费 `@movscript/project-surface`。`packages/core/src/resources/dragPayload.ts` 只保留从 `@movscript/project-surface` re-export，避免 Core 和 Agent Surface 两份协议实现。新增 `surface/project/tests/resource-interaction.test.mjs` 承接原单测覆盖。
69. 已完成第六十九批：新增 `@movscript/project-surface/resource-browser` 子入口和 `surface/project/src/resource-browser.ts`，承接 Resource Library browser controller runtime、React Query query/mutation 状态机、Resource Library data adapter contract、current user/project/org context、notification hook、resource library/resource binding change callback、selection/page/search/filter/view mode/context menu/preview/share/revoke/upload/certify/clip lifecycle。Desktop `useResourceLibraryController` 已收缩为 API/store/toast/i18n adapter 和 invalidation bridge，不再拥有 `useQuery` / `useMutation` / `resourceKeys.libraryPage` / `resourceBindingKeys.projectLibraryScope` 状态机。`surface/project` package exports/tsup 增加 `./resource-browser` 独立 entry，避免 Core/MCP root 入口引入 React Query。
70. 已完成第七十批：`surface/project/src/resource-browser.ts` 增加 `createResourceLibraryDataServiceAdapter` 和 `ResourceLibraryHTTPClient`，把 resource folders/projects/resources/project resource bindings/focus resource/upload/remove/adopt/share/revoke/provider asset certify 的 Data Service REST 映射收敛到共享 Resource Browser adapter。Desktop `useResourceLibraryController` 不再手写 `URLSearchParams`、`/resources/upload`、project resource binding payload 或 provider certify endpoint，只负责把 Desktop `api` 注入共享 adapter，并保留 Desktop store/toast/i18n/invalidation bridge。`surface/project/tests/resource-browser.test.mjs` 覆盖共享 adapter URL/payload contract。
71. 已完成第七十一批：Data Service 残留的 admin auth settings 代码已硬删除，`internal/app/admin/settings` 不再定义 `AuthSettings`、registration/email verification、SMTP 或 Turnstile 设置模型，`AdminSettingsHandler` 不再暴露 `GetAuthSettings` / `UpdateAuthSettings`，对应旧 handler/service 单测已删除；Admin Web `SystemSettingsPage` 不再请求 `/admin/settings/auth`，系统设置页只保留部署状态和 Provider asset 管理引导。`tests/scripts/service-program-boundary.test.mjs` 增加 source-level 守卫，确保 Data Service/Admin Web 不重新拥有 auth settings surface。Auth Service 继续只承接 opaque key、identity、introspection 和管理 credential contract，社区版不引入 SSO/注册配置面。
72. 已完成第七十二批：`surface/project/src/resource-browser.ts` 增加 `ResourceLibraryBrowserView`、`ResourceLibraryBrowserViewSlots` 和 `ResourceLibraryBrowserController` contract，把 Resource Library browser view composition 顺序收敛到共享 package：upload input、toolbar、content、pager 和 dialogs 均通过 slots 注入，Desktop 只保留具体 UI primitive、MediaViewer、dialog 和 i18n 渲染。`apps/desktop/src/features/resources/components/ResourcesPage.tsx` 的 `ResourceLibraryView` 已改为消费 `ResourceLibraryBrowserView<RawResource, ResourceBinding, ResourceFolder, Project>`，并注入 Desktop slots；共享 package 单测覆盖 slot 顺序和 `variant` / `agentReferenceActions` 透传，前端/service 边界测试增加守卫，防止 Resource Library browser composition 回流到 Desktop。
73. 已完成第七十三批：`services/project-service` 和 `services/editing-service` 从 manifest-only 进入可独立运行的最小 HTTP service skeleton。`@movscript/project-service` 提供 `movscript-project-service serve`、`startProjectService`、`GET /health` 和 `GET /v1/project/capabilities`，声明 project read model、domain source、candidate view 和 interpret 能力；`@movscript/editing-service` 提供 `movscript-editing-service serve`、`startEditingService`、`GET /health` 和 `GET /v1/editing/capabilities`，声明 timeline、edit plan、preview timeline 和 render request 能力。两者都已有 package build/test 脚本、bin entry 和 source-level 边界测试，后续真实业务源码只能迁入这些 service program，不再在 Desktop 或 MCP host 保留兼容实现。
74. 已完成第七十四批：`services/admin-web` 从纯 Vite 静态包升级为可独立运行的 `movscript.admin.web` Web service/BFF 骨架。`@movscript/admin-web` 现在拥有 `movscript-admin-web` bin、`src/server.mjs`、`runAdminWebCLI`、`GET /health`、静态 app shell serving 和 server-side `/api/admin/auth/*` Auth management proxy；proxy 使用浏览器 bearer 做 Auth Service introspection + `super_admin` 校验，再由服务端 management token 调用 Auth Service user/org/member management API。`tests/scripts/service-program-boundary.test.mjs` 增加守卫，确保 Admin Web 保持 server/BFF runtime、浏览器源码不出现 management token，`services/admin-web/tests/server.test.mjs` 覆盖 health、static serving、management token 不泄露和非管理员拒绝。
75. 已完成第七十五批：Admin Web 用户/组织身份管理页面、ActiveUserSelect 和 ActiveOrgSelect 已切到 Admin Web BFF 的 `/api/admin/auth/*`，浏览器侧只携带当前用户 bearer，Auth Service management token 只存在于 `movscript.admin.web` 服务端。Data Service 已硬删除 `/api/v1/admin/users` list/create/update、`/api/v1/admin/orgs` list/create/update 和 org member management 代理路由及对应 handler 方法；Data Service 只保留 user/org detail、quota、invitation、join-code 等本地业务聚合。`tests/scripts/service-program-boundary.test.mjs` 增加守卫，防止身份管理入口回流到 Data Service 或绕过 Admin Web BFF。
76. 已完成第七十六批：Auth Service Go `authidentity` contract 增加细粒度 capability interface：`UserDirectory`、`UserWriter`、`UserCredentialWriter`、`OrgDirectory`、`OrgWriter`、`OrgMemberDirectory` 和 `OrgMemberWriter`，`Manager` 只作为这些 capability 的组合接口。Data Service 已把协作用户搜索 `UserHandler` 收窄到 `UserDirectory`，把 admin overview handler/service 收窄到 `UserDirectory + OrgDirectory`，并同步 vendor contract 与 boundary test，避免只读业务重新拿到身份写能力。
77. 已完成第七十七批：Data Service 中更多只读 AuthIdentity 使用点已从全量 `Manager` 收窄到 capability interface：resource/resource-folder/canvas/job/entitlement legacy personal org 判断只接收 `OrgDirectory`；admin user detail 只接收 `Reader`；admin org detail/join-code 只接收 `OrgMemberDirectory`，`admin/org.Service` 也改为使用共享 `OrgMemberDirectory` contract。边界测试同步翻转为禁止这些模块重新接收 `authidentity.Manager`。
78. 已完成第七十八批：Project Service 从纯 capability skeleton 前进到第一批真实本地 project source/read-model endpoint。`services/project-service` 现在依赖 `@movscript/workspace` 和 `@movscript/interpreter`，提供 `POST /v1/project/source/snapshot`、`POST /v1/project/source/inspect` 和 `POST /v1/project/source/overview`，分别通过共享 workspace adapter 和 interpreter node API 读取 source snapshot、inspect 诊断和 project overview read-model。Project Service 测试使用临时真实 project source 验证端点行为，边界测试守卫 Project Service 必须继续复用 workspace/interpreter 包而不是复制 source parser。
79. 已完成第七十九批：Project Service 继续承接真实 project source 写入型解释和 regeneration planning endpoint。`POST /v1/project/source/interpret` 通过 `interpretMovScriptWorkspace` 统一刷新 `.interpret/current/*` 派生产物，`POST /v1/project/source/regeneration-plan` 通过 `planMovScriptWorkspaceRegeneration` 返回统一 regeneration plan。Project Service 测试改为复用 interpreter 已验证的 domain source fixture，避免 service 层复制半套 source 规则；边界测试同步守卫新 endpoint、interpreter/regeneration API 和 `.interpret` 写入行为。
80. 已完成第八十批：新增 `packages/project` 作为 Project Service contract/client package，提供共享 endpoint constants、`ProjectServiceClient`、`MOVSCRIPT_PROJECT_SERVICE_URL` 和 MovScript Home runtime endpoint discovery；`services/project-service` 改为复用 `@movscript/project` contract。`packages/core/mcp/node/tools/domain/runtime.ts` 的 `domain_inspect`、`domain_review` alias、`domain_overview`、`domain_interpret` 和 `domain_regeneration_plan` 已经通过 `ProjectServiceClient` 调用独立 `movscript.project.service`，不再在 MCP runtime 里直接 import `@movscript/interpreter/node`。Core MCP 测试启动真实 Project Service 验证该路径，边界测试新增守卫，防止 MCP interpret/read-model 路径回退为隐形 Project Service。
81. 已完成第八十一批：Project Service 增加 `POST /v1/project/source/command`，以白名单 source command 形式承接 project standards、setting/state/asset、script、content unit、production/segment/scene_moment/storyboard/keyframe/audio_cue/expression_unit、edit prompt、transition、storyboard timeline 和 delete entity 等 source 写入。`@movscript/project` 增加 `ProjectSourceCommandName`、`ProjectSourceCommandRequest` 和 `ProjectServiceClient.sourceCommand`；`packages/core/mcp/node/tools/domain/runtime.ts` 的对应 source mutation 已经转发到 `ProjectServiceClient.sourceCommand`，MCP 不再直接在本进程执行这些 source 写入。Project Service 测试覆盖真实 command 写入和 unsupported command 拒绝，Core MCP 全量测试启动真实 Project Service 验证工具链。
82. 已完成第八十二批：Project Service 增加 `POST /v1/project/candidates/command` 和 `POST /v1/project/candidates/view`，通过 scoped Project Data decision store 承接 content-unit candidate create/select/decide 与 decision context 读取。`@movscript/project` 增加 `ProjectCandidateCommandName`、`ProjectDecisionStoreConfig`、`ProjectCandidateCommandRequest`、`ProjectCandidateViewRequest`、`ProjectServiceClient.candidateCommand` 和 `ProjectServiceClient.candidateView`；`packages/core/mcp/node/tools/domain/runtime.ts` 的 content-unit candidate mutation 已切到 `ProjectServiceClient.candidateCommand`，MCP 不再直接执行 backend decision candidate 写入/选择语义。Project Service 测试覆盖 candidate command/view 和缺失 decision store 的硬失败，Core MCP 全量测试启动真实 Project Service 验证工具链。
83. 已完成第八十三批：Project Service 增加 `POST /v1/project/prompt/context`，聚合 content-unit runtime panel、generation prompt、dependency report、selection validity 和 `@movscript/prompt` backend prompt compiler 输出；`@movscript/project` 增加 `PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT`、`ProjectPromptContextRequest`、`ProjectPromptContextResponse` 和 `ProjectServiceClient.promptContext`；`packages/core/mcp/node/tools/domain/runtime.ts` 的 `readContentUnitGenerationPrompt` 与 `buildContentUnitBackendPrompt` 已切到 `ProjectServiceClient.promptContext`，Agent Surface content-prompt snapshot 也通过 MCP 走同一 Project Service 路径。Project Service 测试覆盖 interpret 后的 prompt context 读取和缺失 contentUnitId 的硬失败，Core MCP 全量测试启动真实 Project Service 验证工具链。
84. 已完成第八十四批：`packages/editing` 承接 Editing Service contract/client，新增 `EDITING_SERVICE_NAME`、`EDITING_SERVICE_CAPABILITIES_ENDPOINT`、`EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT`、`EditingServiceClient`、`MOVSCRIPT_EDITING_SERVICE_URL` 和 MovScript Home runtime endpoint discovery；`services/editing-service` 新增 `POST /v1/editing/project/command`，承接纯 `MediaEditingProject` settings/assets/timeline/validate command，并声明 `editing-project-command` capability。`packages/core/mcp/node/tools/editing` 的 `editing_project_add_asset/remove_asset/update_settings` 和 `editing_timeline_*` 纯 mutation 已硬切到 `EditingServiceClient`，core 不再保留旧本地 timeline mutation helper；服务边界只接受 canonical `MediaEditingProject v1`，不再自动补齐缺失或历史形态的 `assets` registry。Core MCP 测试启动真实 Editing Service 验证该路径，边界测试新增守卫，防止 MCP editing 业务逻辑回流。
85. 已完成第八十五批：Editing Service 的 `POST /v1/editing/project/command` 新增 `createProject` 和 `createProjectFromEditPlan`，`createProjectFromEditPlan` 在 `movscript.editing.service` 进程内调用 `@movscript/editing` 的 edit-plan conversion。`packages/core/mcp/node/tools/editing` 的 `editing_project_create` 和 `editing_project_create_from_edit_plan` 已改为调用 `EditingServiceClient`，MCP 只在 service 返回 canonical `MediaEditingProject v1` 后按需调用 Electron runtime `saveProject` 持久化，不再在 MCP 进程里构造 project 或执行 edit-plan conversion。`projectId/project_id` 现在是 create 工具的正式输入，缺省才使用 `standalone`。Editing Service、Core MCP 和边界测试均覆盖该路径，并禁止 create/edit-plan conversion 逻辑回流到 MCP。
86. 已完成第八十六批：`packages/editing` 新增 `EDITING_SERVICE_TASK_REQUEST_ENDPOINT`、`EditingServiceTaskRequestType` 和 `EditingServiceClient.taskRequest`；`services/editing-service` 新增 `POST /v1/editing/task/request`，统一编排 `timeline_render`、`timeline_hls`、`media_transcode` 和 `media_reframe` 的 media pipeline task request，包括 timeline project/timeline 提取、output spec、resource cache/download、HLS variants、transcode/reframe 参数归一化和 `projectId`/`source` 校验。`packages/core/mcp/node/tools/editing` 的 `editing_task_render_create`、`editing_task_hls_create`、`editing_task_transcode_create` 和 `editing_task_reframe_create` 已改为先调用 `EditingServiceClient.taskRequest`，再把返回的 canonical request 交给 Electron runtime `createTask`；MCP 不再保留 `outputSpec`、`resourceRuntimeOptions`、`transcodeRuntimeOptions` 或 `reframeRuntimeOptions` 这类 request 编排 helper。Editing Service、Core MCP 和边界测试均覆盖该路径。
87. 已完成第八十七批：Data Service 配置面继续按 Auth Service 拆分目标净化，`Config` 删除旧 `MCPToken`、Data Service `AdminUsername` / `AdminPassword`、Turnstile、SCIM、OIDC、SAML 字段以及 `OIDCEnabled` / `SAMLEnabled` helper；`Load`、`ValidateStartup` 和 `SafeSummary` 不再读取或暴露这些身份入口。`services/data-service/.env.example` 硬迁移为 `GIT_PROXY_TOKEN_SECRET` / `GIT_PROXY_TOKEN_TTL_HOURS`，删除旧 `AUTH_TOKEN_*`、`MCP_TOKEN` 和 “legacy Data Service session/token flow” 文案；边界测试增加反向守卫，防止 Data Service 重新承接登录/SSO/MCP 鉴权配置。
88. 已完成第八十八批：Editing Service 继续承接 preview timeline 到剪辑项目的权威转换。`packages/editing` 新增 `MediaProductionTimelineClip` / `MediaProductionTimelineProjectOptions` 和 `createMediaEditingProjectFromProductionTimelineClips`，统一把 production preview timeline clips 转为 canonical `MediaEditingProject v1`；`services/editing-service` 的 `POST /v1/editing/project/command` 新增 `createProjectFromPreviewTimeline`，由 `movscript.editing.service` 进程内完成 production timeline project 组装。`packages/core/mcp/node/tools/domain` 的 scene moment timeline 和 production timeline handoff 已改为调用 `EditingServiceClient` 的 `createProjectFromEditPlan` / `createProjectFromPreviewTimeline`，Core 不再保留本地 `productionMediaEditingProject` builder；content source workspace snapshot 也改为复用 `@movscript/editing` 的 preview timeline 转换纯函数，避免第二套组装逻辑。Core MCP 主测试启动真实 Editing Service，边界测试新增守卫，禁止 preview timeline conversion 逻辑回流到 MCP/Core。
89. 已完成第八十九批：Project Service 新增稳定 project read-model contract。`packages/project` 新增 `PROJECT_SERVICE_READ_MODEL_ENDPOINT`、`ProjectReadModelRequest`、`ProjectReadModelResponse` 和 `ProjectServiceClient.readModel`；`services/project-service` 新增 `POST /v1/project/read-model`，由 `movscript.project.service` 进程内组合 `overviewMovScriptWorkspace`、可选 source snapshot 和可选 workspace inspection，返回 `movscript.project-read-model.v1`，让后续 Desktop/Plugin/Agent Surface/MCP 统一消费项目状态，而不是在调用侧拼装 overview/source/inspect。Project Service server/client/边界测试均覆盖该 endpoint，并明确该 read-model endpoint 不是历史 overview alias。
90. 已完成第九十批：Project Service 新增本地 project lifecycle command contract。`packages/project` 新增 `PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT`、`ProjectLifecycleCommandName`、`ProjectLifecycleCommandRequest`、`ProjectLifecycleCommandResponse` 和 `ProjectServiceClient.lifecycleCommand`；`services/project-service` 新增 `POST /v1/project/lifecycle/command`，承接 `openProject`、`createProject`、`importProject`，复用 `@movscript/workspace/node` 的 `initializeProject` 能力初始化 `workspace.json`、`project.json`、project standards 和 local control files，并返回统一 locator/project summary。该 contract 不执行 Data Service backend ensure，不保留旧 MCP 本地项目 helper 作为服务内兼容层；Project Service server/client/边界测试均覆盖该 endpoint。
91. 已完成第九十一批：MCP `system_project_init` / `system_project_open` 已硬迁移到 Project Service lifecycle command client。`packages/core/src/mcp/node/tools/project/projects.ts` 现在通过 `createProjectServiceClientFromRuntime().lifecycleCommand` 调用 `createProject` / `openProject`，并删除 MCP 层直接 `createNodeMovScriptWorkspaceService`、`mkdir`、metadata JSON 读取、`safeProjectId` 等重复 lifecycle 实现；MCP 只保留 backend project / project-data binding 这个 MCP/后端职责。Core MCP 主测试继续启动真实 Project Service 验证该路径，边界测试新增守卫，禁止本地 project lifecycle helper 回流到 MCP。
92. 已完成第九十二批：Project Service 新增 project locator/source-root resolution contract。`packages/project` 新增 `PROJECT_SERVICE_LOCATOR_RESOLVE_ENDPOINT`、`ProjectLocatorResolveRequest`、`ProjectLocatorResolveResponse` 和 `ProjectServiceClient.resolveLocator`；`services/project-service` 新增 `POST /v1/project/locator/resolve`，读取本地 project metadata 并组合显式 `workspaceDir` / `projectUid` fallback，返回 canonical locator。MCP `localProjectBinding` 已硬迁移到该 client，不再在 MCP 进程中直接读取 `workspace.json` / `project.json` 或维护 project manifest helper；边界测试守住 Project Service locator endpoint 和 MCP binding 的反向约束。
93. 已完成第九十三批：Project Service 新增 project resource view contract。`packages/project` 新增 `PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT`、`ProjectResourceViewKind`、`ProjectResourceViewRequest`、`ProjectResourceViewResponse` 和 `ProjectServiceClient.resourceView`；`services/project-service` 新增 `POST /v1/project/resources/view`，在 service 进程内通过 shared workspace service 读取 project summary、scripts（含 script source）、settings、assets、productions、segments、storyboards 和 content units。MCP `packages/core/src/mcp/node/tools/project/resources.ts` 已硬迁移到 `ProjectServiceClient.resourceView`，不再创建 domain runtime、`queryEntities` 或 `readScriptSource`；Core MCP 测试改为放行真实 Project Service 并继续禁止 Data Service backend entity fetch，边界测试守住该分层。
94. 已完成第九十四批：MCP domain runtime 的 scoped Project Data decision store 不再直接读取本地 `workspace.json`。`packages/core/src/mcp/node/tools/domain/runtime.ts` 删除 `readFileSync` / `readWorkspaceManifest` 路径，新增 lazy `ProjectDecisionStoreConfigResolver`：candidate overlay、candidate command 和 prompt context 需要 backend decision context 时，先调用 `ProjectServiceClient.resolveLocator`，再用 Project Service 返回的 canonical `projectUid` / `projectTitle` 组装 `ProjectDecisionStoreConfig`。Core MCP 测试覆盖“传入旧 projectUid fallback 但最终使用 Project Service locator 中的 project uid/title”，边界测试禁止 domain runtime manifest 直读回流。
95. 已完成第九十五批：Editing Service 新增 timeline view contract。`packages/editing` 新增 `EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT`、`EditingServiceTimelineViewKind`、`EditingServiceTimelineViewRequest`、`EditingServiceTimelineViewResponse` 和 `EditingServiceClient.timelineView`；`services/editing-service` 新增 `POST /v1/editing/timeline/view`，声明 `editing-timeline-view` capability，并在 service 进程内复用 `@movscript/workspace/node` 读取 `previewTimeline` 与 `sceneMomentEditPlan`。MCP `packages/core/src/mcp/node/tools/domain/actions.ts` 的 preview timeline 和 scene-moment edit plan 读取已硬迁移到该 endpoint；Editing Service server/client/边界测试均覆盖该 endpoint，并禁止 `service(args).readPreviewTimeline` / `service(args).readSceneMomentEditPlan` 回流到 MCP domain actions。
96. 已完成第九十六批：Editing Service 承接 production timeline bundle。`EditingServiceTimelineViewKind` 新增 `productionTimelineBundle`，`EditingServiceClient.timelineView` 可随请求传递可选 `decisionStore`，`services/editing-service` 在 service 进程内用 `@movscript/workspace/node` 读取 preview timeline / project context，并用 `@movscript/workspace/repository` 的 scoped Project Data overlay 合并后端候选和 selection，统一返回 `movscript.production-timeline-bundle.v1`：包含 `preview_timeline`、`clips`、`blockers`、canonical `media_editing_project`、production `edit_plan` 和 editing `context`。MCP `domain_read_production_timeline`、`domain_read_production_edit_plan` 和 production target `domain_create_editing_project_context` 已改为消费该 bundle；MCP domain actions 已删除 `productionTimelineClips`、`productionEditPlanFromBundle` 和 `createProjectFromPreviewTimeline` 二次组装链路。Editing Service server/client、Core MCP production timeline 子集和 service boundary 测试均覆盖该路径。
97. 已完成第九十七批：Editing Service 承接 scene moment timeline bundle，并把 compose inputs 变成 timeline bundle 的服务端输出。`EditingServiceTimelineViewKind` 新增 `sceneMomentTimelineBundle`，`services/editing-service` 的 `POST /v1/editing/timeline/view` 可返回 `movscript.scene-moment-timeline-bundle.v1`，包含 scene-moment `edit_plan`、canonical `media_editing_project`、editing `context`、`compose_inputs` 和 `blockers`；`productionTimelineBundle` 同步返回 `compose_inputs`。MCP `domain_read_scene_moment_timeline`、scene moment target `domain_create_editing_project_context` 和 production timeline compose inputs 已改为消费 service bundle；MCP domain actions 已删除 `createProjectFromEditPlan` handoff、editing context builder 和 compose inputs builder。Editing Service server/client、Core MCP timeline 子集和 service boundary 测试均覆盖该路径。
98. 已完成第九十八批：Editing Service 承接 media pipeline task action 归一化。`packages/editing` 新增 `EDITING_SERVICE_TASK_ACTION_ENDPOINT`、`EditingServiceTaskActionName`、`EditingServiceTaskActionInput`、`EditingServiceTaskActionResponse` 和 `EditingServiceClient.taskAction`；`services/editing-service` 新增 `POST /v1/editing/task/action`，统一把 `getTask`、`cancelTask`、`getTaskLogs` 的 `taskId` / `projectId` 解释为 `movscript.editing-task-action.v1` canonical runtime action，并在 capability / program manifest 中声明 `media-task-action`。MCP `editing_task_get`、`editing_task_cancel` 和 `editing_task_logs_get` 已改为先调用 Editing Service task action，再把 canonical action 交给 Electron runtime port；MCP editing actions 已删除本地 `taskIdValue` helper。Editing package client、Editing Service server、MCP editing runtime/tools 和 service boundary 测试均覆盖该路径。
99. 已完成第九十九批：Editing Service 继续承接 export handoff action 归一化。`EditingServiceTaskActionName` 新增 `importExportResource`、`saveLocalExport` 和 `publishHlsStream`；`services/editing-service` 的 `POST /v1/editing/task/action` 现在统一解释 `outputPath` / `taskId` / task snapshot、HLS manifest/segment、save path/directory、resource import derivative 和 publish metadata，返回 `ready` runtime request 或 `result` / `not_found` / `pending_output` / `unsupported_output` envelope。MCP `editing_export_import_resource`、`editing_export_save_local` 和 `editing_export_publish_hls` 已改为先通过 canonical `getTask` action 获取 task snapshot，再调用 Editing Service 生成 handoff request；MCP editing actions 已删除本地 `exportImportDerivativeRequest`、`exportDerivativePayload` 和 `isHlsTaskOutput` 等 export request 解释 helper。Editing package client、Editing Service server、MCP editing runtime/tools 和 service boundary 测试均覆盖该路径。
100. 已完成第一百批：`packages/editing` 承接 media pipeline runtime port contract。`packages/editing/src/runtime.ts` 新增并公开 `EditingMediaPipelineTaskRequest`、`EditingMediaPipelineTaskState`、`EditingRuntimePort`、runtime capability、export import/save local/HLS publish request/result 等端口类型；`packages/core/src/mcp/node/tools/editing/runtime.ts` 已收缩为只保存 MCP 进程内 runtime port 单例，并从 `@movscript/editing` re-export 类型。MCP 不再定义 media pipeline 端口 shape，Desktop、Plugin full-local、未来 `movscript.media.pipeline` sidecar 和 cloud media worker 必须共享同一套 editing runtime contract。Editing package runtime contract 测试和 service boundary 测试均覆盖该归属。
101. 已完成第一百零一批：`movscript.media.pipeline` 从 program manifest 骨架推进为可独立运行的 service skeleton。`services/media-pipeline` 新增 `@movscript/media-pipeline` workspace package、`movscript-media-pipeline` bin、`src/server.mjs`、health/capability/probe endpoint 和 server tests；`packages/editing` 新增 Media Pipeline service constants/client/discovery contract，使用 `MOVSCRIPT_MEDIA_PIPELINE_URL` 或 MovScript Home runtime endpoint 发现服务。`POST /v1/media-pipeline/probe` 返回 `movscript.media-pipeline-probe.v1`，默认在执行 runtime 未接入时返回 `available=false` 和 `media_pipeline_execution_not_configured`，为后续 Desktop adapter、Plugin full-local sidecar 和 cloud media worker 共享执行边界。Media Pipeline package 测试、Editing package client/discovery 测试和 service boundary 测试均覆盖该路径。
102. 已完成第一百零二批：`movscript.media.pipeline` 新增 task execution HTTP boundary。`packages/editing` 新增 `MEDIA_PIPELINE_TASK_CREATE_ENDPOINT`、`MEDIA_PIPELINE_TASK_ACTION_ENDPOINT`、task create/action request/response types 和 `MediaPipelineServiceClient.createTask/taskAction`；`services/media-pipeline` 现在可注入共享 `EditingRuntimePort`，通过 `POST /v1/media-pipeline/task/create` 转发 `createTask`，通过 `POST /v1/media-pipeline/task/action` 转发 `getTask`、`cancelTask`、`getTaskLogs`。未注入 runtime 时 endpoint 明确返回 `media_pipeline_runtime_unavailable`，保留 probe 的稳定 unavailable envelope。Media Pipeline server、Editing package client 和 service boundary 测试均覆盖该路径。
103. 已完成第一百零三批：Desktop bridge runtime 开始把 Electron mediaPipeline adapter 作为可发现的 `movscript.media.pipeline` capability 暴露给 Home discovery。`apps/desktop/electron/services/mediaPipelineRuntimePort.ts` 抽出 `createDesktopMediaPipelineRuntimePort`，Electron IPC 和 Desktop ApplicationRunner 共用同一套 `EditingRuntimePort` adapter；该 adapter 是 Desktop 增强能力，不改变本机 Project/Editing/Data/Canvas/Media 业务服务由 `movscript.local-node` daemon 拥有的原则。`services/media-pipeline` 补齐 typed package export 和 runtime-contracts 显式依赖；`packages/editing/src/browser.ts` 补齐 browser-safe pure editing entry，Desktop renderer alias 指向该入口，避免 Node runtime discovery 进入浏览器 bundle。Desktop typecheck、Desktop build、Media Pipeline package 测试、service boundary / runtime manifest 测试均覆盖该分层。
104. 已完成第一百零四批：Plugin App 接入 media-pipeline endpoint discovery，但 `plugin-basic` 语义已收敛为只启动 launcher + stdio MCP host，不再启动 Plugin-owned media pipeline。`plugin-desktop-compatible` 是当前 Desktop 兼容场景名；`plugin-desktop-owned` 只保留为 legacy alias：当 Home 中已有 Desktop bridge capability endpoint 时可以外连，但不能把 Desktop 解释为业务 sidecar owner；无 Desktop 时 `plugin-full-local` 负责 ensure/attach `movscript.local-node` daemon 并使用 daemon-owned `movscript.media.pipeline`。MCP Host `movscript_runtime_status` 新增 `mediaPipeline` 状态并把 Desktop probe 中的 `mediaPipeline/mediaPipelineEndpoint` 改为来自 Home discovery。Plugin launcher smoke、MCP host 和 Media Pipeline 边界测试覆盖该路径。
105. 已完成第一百零五批：Data Service handler/app 层继续按 Auth Service capability contract 净化，不再直接接收全量 `authidentity.Manager`。`ProjectHandler` 收窄为 `projectHandlerIdentity`（`Reader + OrgDirectory`），只用于 owner/member 校验、org membership 和 project repository owner/org 解析；`ModelGatewayHandler` 收窄为 `modelGatewayIdentity`（`Reader + OrgDirectory`），只用于 API key owner 校验和 personal org scope 判断；`OrgHandler` 收窄为 `orgHandlerIdentity`，显式列出 invitation/member 流程仍需的 `Reader`、`UserDirectory`、`UserWithPasswordCreator`、`OrgMemberDirectory` 和 `OrgMemberWriter`，并明确禁止拿到 `OrgWriter`。边界测试已经翻转为禁止 handler/app 层重新出现 `authidentity.Manager`，Go targeted tests 覆盖 handler、gateway、project、projectrepo 和 org package。
106. 已完成第一百零六批：匿名邀请注册的“创建用户 + 设置密码”组合能力先从 Data Service handler 编排抽到 Auth Service Go identity capability。`services/auth-service/pkg/authidentity` 新增 `UserWithPasswordCreator` 和 `CreateUserWithPassword`，`LocalOwnerManager` 明确拒绝该写能力。`OrgHandler.acceptInvitationWithNewIdentity` 现在只调用 `CreateUserWithPassword`，不再导入 `bcrypt`、不再直接调用 `CreateUser` / `SetUserPasswordHash`，也不接收 `UserWriter` / `UserCredentialWriter` capability。Data Service vendor contract 已同步，边界测试禁止 OrgHandler 重新出现 bcrypt/password_hash/两段密码写入，handler fake/test 验证邀请注册只走一次 `CreateUserWithPassword`。
107. 已完成第一百零七批：Auth Service 的 `CreateUserWithPassword` 已从 Go client convenience 下沉为服务端单一 HTTP contract。`POST /v1/auth/users/with-password` 由管理 token 保护，Auth Service app 层负责 bcrypt hash，`dbidentity.Store.CreateUserWithPassword` 在同一 DB transaction 内创建 user、写入 password hash 并创建 personal org；Go `authidentity.Client.CreateUserWithPassword` 只调用该 endpoint，不再本地 hash，也不再执行 `CreateUser` + `SetUserPasswordHash` 两步写入，从而避免网络失败导致“用户已创建但密码未设置”的局部成功。Data Service 仍只保留本地 invitation token、join-code 和业务审计聚合；Auth Service client/app/store/server 测试、Data Service org/handler 测试和 service boundary 测试覆盖该边界。
108. 已完成第一百零八批：Plugin `plugin-full-local` 进入真实启动阶段。`apps/plugin/src/agent-mcp.ts` 现在通过 ApplicationRunner 组合 launcher、stdio `movscript.mcp.host`、本地 `movscript.data.service`、`movscript.project.service`、`movscript.editing.service`、`movscript.local-surface.host` 和 required `movscript.media.pipeline`；Data Service 作为 Go binary 进程启动并使用 local sqlite/local-owner profile，Project/Editing/Media Pipeline 作为 HTTP service 进程启动，Project Surface Host 通过静态 HTTP server 提供 `/health` 和 web endpoint。启动成功后每个 program 都写入 `$MOVSCRIPT_HOME/runtime/services/**` 与 `$MOVSCRIPT_HOME/runtime/endpoints/*.json`；`MOVSCRIPT_PLUGIN_MODE=full-local` 可显式选择该场景。`plugin-basic` 已修正为只保留 launcher + stdio MCP host，不再启动 media pipeline。
109. 已完成第一百零九批：Media Pipeline 补齐第一版 headless runtime adapter。`services/media-pipeline/src/headlessRuntime.mjs` 现在实现 `EditingRuntimePort` 的 `getCapabilities/createTask/getTask/cancelTask/getTaskLogs`，CLI 默认通过 `createHeadlessMediaPipelineRuntimePort` 装配该 adapter，`MOVSCRIPT_MEDIA_PIPELINE_RUNTIME=none` 可显式保留无 runtime 诊断模式。Headless runtime 会 probe `MOVSCRIPT_FFMPEG_PATH` / `FFMPEG_PATH` / PATH 中的 `ffmpeg`，支持 `media_transcode`、`media_reframe` 和最小本地媒体 clip 的 `timeline_render` / `timeline_hls` ffmpeg task lifecycle、HLS variants、workspace output、task logs 和缺 ffmpeg 时的 failed task 状态；复杂多轨叠加、字幕烧录等 Desktop 级 timeline materialization 仍等待后续 headless compositor 或云渲染 adapter，不再把 Plugin full-local 的 media-pipeline 停留在纯 unavailable 空壳。
110. 已完成第一百一十批：Plugin 无 Desktop 的默认启动路径已从 `plugin-basic` 改为 `plugin-full-local`，使 Agent Plugin 在本机没有 Desktop runtime record 时直接作为 local full node 启动；`plugin-basic` 只保留为显式 `MOVSCRIPT_PLUGIN_MODE=basic` / `MOVSCRIPT_PLUGIN_SCENARIO=plugin-basic` 的诊断或外连模式。Full-local smoke test 不再设置 `MOVSCRIPT_PLUGIN_MODE`，直接验证默认场景可完成 `initialize`、`tools/list`、`movscript_runtime_status` 和 `domain_inspect`，并确认 Data/Project/Editing/Project Surface Host/Media Pipeline endpoint records 写入 `$MOVSCRIPT_HOME/runtime/endpoints/*.json`。本地数据持久化由 Data Service 承接到 `$MOVSCRIPT_HOME/data-service/movscript.db`；本地 gateway/control 能力也归 local Data Service 负责；本地模式不启动 `movscript.auth.service`，测试明确守住没有 Auth Service endpoint record。
111. 已完成第一百一十一批：Plugin full-local 的服务生命周期从 Codex stdio MCP 会话中拆出为后台 `movscript.local-node` daemon。默认无 Desktop 时，`apps/plugin/src/agent-mcp.ts` 先 ensure local-node，等待 `movscript.local-node.control`、Data/Project/Editing/Project Surface Host/Media Pipeline 全部 ready，再启动 session-scoped stdio `movscript.mcp.host`；Codex 会话结束只停止 `movscript.agent-plugin` 的 launcher/MCP host 记录，不停止 local-node。local-node 默认不启用 idle timeout，支持显式 `MOVSCRIPT_LOCAL_NODE_IDLE_TIMEOUT=30m` 等开发/测试配置，并通过 `/touch` 刷新 activity/status。local-node status 写入 `pluginRoot/pluginVersion`，新插件发现后台 daemon 来自旧版本或旧安装根时会先 stop 旧 daemon 再启动当前版本。新增 CLI `movscript-agent-mcp local-node status|stop|restart` 和 MCP tools `runtime_local_node_status`、`runtime_local_node_stop`、`runtime_local_node_restart`；`install-plugin.sh` 在替换 `current` 链接前也会尝试 stop 既有 local-node。Plugin smoke test 已覆盖无 Desktop 下会话退出后 local-node 服务仍 ready，以及 stop 能触发关闭。
后续继续推进 Resource Library 更细 UI primitive/slot contract 收敛，以及 Project/Editing Service 的真实业务源码拆分；Project Service 后续应继续收敛 project discovery 和 workspace config；Media Pipeline 后续应补齐 Desktop 级 timeline materialization/headless compositor 或云渲染 adapter。
112. Data/Project/Editing/MCP host 全部改为依赖 `AuthProvider`；cloud/managed-local 用 `OpaqueKeyAuthProvider`，本地默认用 `LocalOwnerAuthProvider`。
113. Desktop、Plugin、CLI 的 runtime discovery 在 cloud/external profile 先发现 Auth endpoint，再发现 Data/Project/Editing endpoint；local profile 不 probe、启动或依赖 Auth Service。
114. Cloud deployment manifest 把 Auth Service 放在 Data/Project/Editing 前置依赖；local full runtime 先初始化 LocalOwnerAuthProvider，再启动 Data/Project/Editing。
115. Desktop 本地项目 lifecycle 入口开始收敛到 Project Service。`apps/desktop/electron/services/localProject.ts` 的 create/open/metadata resolution 现在通过 `ProjectServiceClient.lifecycleCommand` 和 `resolveLocator` 访问 `movscript.project.service`，不再直接 `createNodeMovScriptWorkspaceService` 或在 Desktop 内维护 project identity 读取逻辑；Desktop 仍保留文件选择前的本机路径/影响检查和 `.movscript/config.json` backend binding 兼容层。Desktop localProject 测试启动真实 Project Service 验证该路径，Electron boundary check 增加守卫，禁止 localProject lifecycle 回流到 `@movscript/workspace/node`。

## Capability Gating

`movscript.mcp.host` 需要维护 capability snapshot，供工具调用和 `tools/list` 结果使用。

建议 capability 分组：

```ts
type MovScriptRuntimeCapabilities = {
  dataService: {
    available: boolean
    selectedMode?: 'local' | 'cloud'
    local?: {
      available: boolean
      baseURL: string
      authenticated: boolean
    }
    cloud?: {
      available: boolean
      baseURL?: string
      authenticated: boolean
    }
    baseURL?: string
    authenticated: boolean
  }
  workspace: {
    cwd?: string
    projectDir?: string
    localProjectDir: boolean
    cloudSourceAPI: boolean
    isMovScriptProject: boolean
  }
  media: {
    ffmpeg: boolean
    desktopMediaPipeline: boolean
    cloudRender: boolean
  }
  surfaces: {
    frontendOrigin?: string
    cloudFrontendOrigin?: string
  }
  recommendedMode?:
    | 'local_data_local_source'
    | 'cloud_data_local_source'
    | 'cloud_data_cloud_source'
  requiresUserChoice: boolean
}
```

说明：这里统一使用 `dataService` 表示 Data Service local/cloud profile，不再把 Data Service 命名为 backend。

工具不可用时，返回结构化结果：

```json
{
  "status": "unavailable",
  "code": "capability_missing",
  "required": ["workspace.localProjectDir"],
  "message": "This domain source tool requires a local projectDir or Cloud Workspace Source API."
}
```

## 改造阶段

### 阶段 1：MovScript Agent Plugin App 脱离 Desktop-only MCP

- 新增 `packages/mcp-host`。
- 为 core MCP 增加 stdio transport 或在 mcp-host 中包装 core JSON-RPC handler。
- `plugins/movscript/.mcp.json` 作为分发物启动 `movscript-agent-mcp`。
- 移除插件对 `http://127.0.0.1:18765/mcp` 的强依赖。
- Desktop App、Agent Plugin App 和 CLI 都 attach 到 `movscript.local-node`，不再各自拥有 full local sidecar。
- 插件分发物提供 `bin/movscript daemon start|status|stop|restart`，并用 `bin/movcli` 保持兼容。
- 增加 `movscript_runtime_status`，用于检测 local daemon、Data Service local/cloud/external profile、project source 和 Desktop App 增强能力。
- 增加 smoke test：不启动 Desktop App 时 `initialize`、`tools/list`、`movscript_runtime_status`、`system_model_list` 有明确结果。

### 阶段 2：核心工具可用性收敛

- 确认 project/domain/generation/resource/candidate 工具全部走 core。
- 移除插件内复制的静态 tool schema。
- 补齐 capability gating。
- 让 Desktop App-only editing task 返回明确 `render_runtime_required`。
- 更新 skills，说明不启动 Desktop App 和 Desktop App 增强模式的差异。

### 阶段 3：Project Surface Host 化

- 抽象 surface descriptor 契约。
- Surface URL 支持 Surface Host program local/cloud deployment 和 Desktop App embed。
- `/agent/...` 页面不依赖 Electron IPC。
- `movscript.mcp.host` 根据运行环境补 `frontend_origin`、API mode 和 auth mode。
- MovScript Agent Plugin App 工具结果返回 surface。

### 阶段 4：云端 project source

- 设计 Cloud Workspace Source API。
- 支持 cloud source read/upsert/update/delete。
- 支持 source snapshot/version。
- 支持云端 inspect/interpret，或通过 worker 队列执行解释。
- `movscript_project_fetch` 支持从云端/Git provider 同步项目。

### 阶段 5：云渲染或 headless media runtime

- 抽象 editing runtime port。
- Desktop App mediaPipeline、headless ffmpeg runtime、cloud service render runtime 实现同一接口。
- `editing_task_*` 根据 capability 路由到可用 runtime。
- Surface 支持远程预览 render/HLS 输出。

## 验收标准

第一阶段完成时，应满足：

- 安装 MovScript Agent Plugin App 后，不启动 MovScript Desktop App 也能看到 MovScript MCP tools。
- `tools/list` 来自 core tool registry，而不是插件内手写静态列表。
- `movscript daemon status/start/stop/restart` 可从插件分发物直接运行；兼容 `movcli` 仍可使用。
- 多个 Agent/MCP/CLI 会话复用同一个 `movscript.local-node` daemon，不会各自启动 full local。
- `system_model_list` 能访问 Data Service local/cloud/external profile。
- `MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE=cloud|external` 时不启动本地 Data Service，但 Project/Editing/Canvas/Surface/Media 服务仍可启动并连接远端或外部 Data Service。
- `movscript_runtime_status` 能明确返回 local daemon、data plane、缺失项和 surface URL。
- local/cloud 同时可用且会影响写入目标时，MCP host 能标记 `requiresUserChoice`。
- `movscript_project_init/open` 能绑定本地 project source。
- `domain_inspect`、`domain_interpret` 能在本地 project source 上运行。
- generation submit/job polling 能走 Data Service API。
- Desktop App-only 增强能力返回结构化 runtime missing 结果。
- README 明确 local daemon、cloud/external data plane、不启动 Desktop、Desktop 增强四种模式。

Surface 阶段完成时，应满足：

- generation submit/job get 返回 job surface。
- prompt blocked 返回 prompt workbench surface。
- candidate create/select 返回 candidate review surface。
- regeneration plan 返回 impact review surface。
- resource query/open 返回 resource library/detail surface。
- Surface 页面在非 Electron Web 环境可打开，并通过 Data Service API 或 MCP proxy 读取数据。

## 当前代码对齐点

当前仓库已经具备以下基础：

- `@movscript/core/mcp/node` 已有 HTTP MCP handler、JSON-RPC handler、tool registry 和 tool router。
- `packages/core/src/mcp/node/tools/*` 已经承载 domain、generation、resource、editing、artifact 等 tool actions。
- CLI 入口已经合并进插件分发物：`bin/movscript` 负责 daemon-first 管理，`bin/movcli` 作为兼容命令名继续承载 auth/workspace 等命令。
- 当前 backend 已有 auth、resource、project、job、generation gateway 等 API；目标结构中 auth 能力迁移到 `services/auth-service`，业务 gateway 留在 `services/data-service`。
- `docs/codex-creative-surfaces-design.zh-CN.md` 已经定义了 Agent Surface 的第一版体验方向。
- Desktop Project Surface 的 overview/settings route 已收缩为 thin wrapper；Desktop-only 的 store、Electron API、Data Service API、Git action 和 endpoint 注入集中在 `apps/desktop/src/legacy/project-surface/runtime/desktopProjectSurfaceRuntime.tsx`，页面本身只挂载共享 `surface/project` 组件。
- `@movscript/project-surface` 的 `/studio/:projectId/*` route contract 已包含 `scripts`、`standards` 和 `content`；Desktop 已把这些 studio aliases 接到当前 legacy 页面，Local Surface Host 则通过同一套 route definition 暴露 host-neutral resource view surface，使用 Project Service `resourceView` 读取 scripts/settings/content-units。

需要调整的关键点：

- `plugins/movscript/bin/mcp-stdio-bridge.mjs` 不进入目标分发物；目标入口只能是 `movscript-agent-mcp`，并直接启动 `movscript.mcp.host`。
- 插件当前没有独立 package/build 形态，需要补成标准可构建插件 runtime。
- Agent Surface 当前设计仍偏 Desktop-only MCP proxy，需要扩展到 provider-neutral Surface Host program。
- Cloud Workspace Source API 尚未建立，云端完整 domain source 编辑需要分阶段推进。

## 最终形态

不安装 Desktop App 的用户可以通过 Agent 或插件 CLI 完成：

- 创建或打开项目。
- 规划和修改 domain source。
- 运行 inspect/interpret。
- 构建 content unit prompt。
- 提交图片、视频、音频、字幕生成任务。
- 查看 job 状态和资源输出。
- 创建、注册、选择候选。
- 打开 Agent Surface 进行资源查看、提示词编辑、任务监控、候选评审和影响确认。

安装 Desktop App 的用户在同一套 MCP/core 能力之上获得：

- 完整桌面工作台。
- 本地预览。
- timeline 编辑。
- Desktop bridge 增强能力；render/HLS/transcode/reframe 默认仍通过 daemon-owned media pipeline 或明确的 Desktop adapter capability。
- 桌面窗口和项目管理体验。

这套体系的核心判断是：MovScript 的产品内核不是 Desktop App，也不是 MovScript Agent Plugin App，而是一套可被多种应用容器和 service 共同驱动的 Agent-native 创作系统。

## 本地项目 Surface 数据通道决策

本地项目 Surface 不能只靠云端提供完整数据；它必须有一个本地 runtime 参与。本地 runtime 由 `movscript.local-node` daemon 承担，Desktop App 是可视化宿主和增强 capability provider。

| Project source 位置 | Surface 容器 | 数据通道 |
| --- | --- | --- |
| 本地项目 + Desktop App 已启动 | Desktop App embed 或打开 daemon-owned `movscript.local-surface.host` | Desktop bridge 增强能力 + daemon-owned `movscript.project.service`；Agent 入口经本地 `movscript.mcp.host` |
| 本地项目 + 不启动 Desktop App | daemon-owned `movscript.local-surface.host` 或 Agent 返回 JSON | daemon-owned `movscript.project.service` 提供 project read model；Agent 入口经本地 `movscript.mcp.host` |
| 云端 project source | Surface Host program cloud deployment | cloud `movscript.project.service` + cloud service profile |
| cloud service profile + 本地 source | Surface Host program local/cloud deployment | 本地 `movscript.project.service` 聚合本地 source 和云端 candidate/resource/job |
