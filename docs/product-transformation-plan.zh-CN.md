# MovScript 产品化改造计划

状态：规划稿  
日期：2026-07-02  
适用范围：Community 版本的 Desktop、Agent Plugin、CLI、本机 daemon、构建与分发机制。

## 1. 目标产品形态

MovScript 最终对用户暴露两个主要产品入口：

- Desktop App：视觉工作台、项目管理、素材和生成配置、剪辑预览、系统托盘、更新和诊断入口。
- Agent Plugin：给 Codex 或其他 Agent provider 使用的能力包，提供 MCP 工具、技能、CLI 入口和本地运行时启动能力。

CLI 和 daemon 是支撑层，不作为第三个面向用户的独立下载产品：

- CLI 是 Home 中的稳定命令入口，负责 `movscript mcp stdio`、`movscript daemon ...`、`movscript runtime ...`、`movscript admin ...` 等操作。
- `movscript.local-node` daemon 是每个 MovScript Home 的本机运行时 owner，负责 Project、Editing、Canvas、Local Surface Host、Media Pipeline，以及本地数据面下的 Data Service。

关键原则是“两个入口，一个 Home，一个本机运行时 owner”：

- 同一个 `MOVSCRIPT_HOME` 下只允许一个 active daemon。
- Desktop、Agent Plugin、CLI 都 attach 到同一个 daemon，而不是各自启动业务 sidecar。
- 多个 Home 可以并存，例如 Community Home、Enterprise Home、测试 Home；daemon 单例范围是 Home，不是物理机器。
- 云端或外部数据面只替换 Data Service 所在位置，不改变 Desktop/Plugin/CLI 的产品安装形态。

## 2. 当前基线

主仓库当前已经具备以下基础：

- `docs/install.md` 已经把 Desktop App 与 Agent Plugin 分成两个发布入口，并说明二者复用同一个 `movscript.local-node` daemon。
- `install-plugin.sh` 已经安装插件到 `$MOVSCRIPT_HOME/plugins/movscript/<version>`，维护 `current`、`previous`、`current.identity`，并支持 rollback。
- `apps/plugin/src/agent-mcp.ts` 已经把 `bin/movscript` 作为统一产品 CLI，并在 ensure daemon 时传入 `pluginVersion`、`pluginRoot` identity。
- `packages/local-daemon/src/index.ts` 已经提供 `/v1/runtime/descriptor`，descriptor 包含 `runtime.identity`、`gateway.canonicalPrefix`、`dataConnection` 和 capabilities。
- `package.json` 已经有 `check:plugin-distribution`、`runtime:registry`、`verify:package-resources`、`release:package:plugin`、`release:package:*` 等基础质量门。
- `package-resources.manifest.json` 已经把 Desktop 内置 provider plugin 作为打包资源，位置是 `provider-plugins/movscript`。

仍需收口的部分：

- Desktop 的内置插件和 Home 中的 `plugins/movscript/current` 之间还缺少明确的升级、降级和修复规则。
- Desktop 的“安装 Codex 插件”路径当前复制到 `~/.movscript/codex-marketplace`，还没有完全复用 Home 中的 `plugins/movscript/current` 作为唯一 runtime truth。
- Desktop runtime config 仍保留 `apiBaseURL`、`apiV1BaseURL` 等兼容字段，需要逐步把产品 contract 收到 daemon descriptor。
- README 的文档索引指向若干当前仓库内不存在的设计文档，需要在产品改造文档体系中统一清理。

## 3. Runtime Ownership 规则

daemon 单例以 Home 为边界：

- Community 默认 Home：macOS/Linux 为 `~/.movscript`，Windows 为 `%LOCALAPPDATA%\MovScript\Home`。
- Enterprise 必须使用独立 Home，例如 `~/.movscript-enterprise` 或 `%LOCALAPPDATA%\MovScript Enterprise\Home`。
- 显式设置 `MOVSCRIPT_HOME` 表示用户希望创建独立运行时和数据根。

启动顺序：

1. 如果 Home 中已有 ready 的 `movscript.local-node`，Desktop、Plugin、CLI 直接 attach。
2. 如果没有 ready daemon 且需要本机能力，由当前入口 ensure daemon。
3. ensure 时必须读取 Home 的 `plugins/movscript/current` 或当前 bundle identity，并把 `pluginVersion`、`pluginRoot`、可选 `runtimeVersion` 写入 daemon metadata。
4. 如果 descriptor identity 与期望 bundle 不兼容，入口应提示升级、切换 current、重启 daemon，而不是启动第二个 daemon。

daemon descriptor 是所有入口的握手协议：

```json
{
  "schema": "movscript.runtime-descriptor.v1",
  "runtime": {
    "owner": "movscript.local-node",
    "appId": "movscript.local-node",
    "identity": {
      "pluginVersion": "0.1.30",
      "pluginRoot": "/Users/me/.movscript/plugins/movscript/0.1.30"
    }
  },
  "gateway": {
    "baseURL": "http://127.0.0.1:8766",
    "canonicalPrefix": "/v1"
  },
  "dataConnection": {
    "kind": "local",
    "authMode": "local-owner",
    "status": "connected"
  }
}
```

兼容策略：

- `runtime.owner` 必须是 `movscript.local-node`。
- `gateway.canonicalPrefix` 必须是 `/v1`。
- `pluginRoot` 应该指向当前 Home 的 canonical current bundle，或者被明确标记为 Desktop embedded repair source。
- 客户端可以跨 patch version 复用 daemon；跨 minor 或 schema 变化需要兼容矩阵判断。
- 不兼容时先停止旧 daemon，再由 current bundle 启动新 daemon。

## 4. Desktop 与 Agent Plugin 共存

### 4.1 用户只安装 Agent Plugin

安装结果：

- 下载 `movscript-agent-plugin-<version>.zip`。
- 写入 `$MOVSCRIPT_HOME/plugins/movscript/<version>`。
- `current` 指向该版本，`previous` 保留上一版本。
- 写入 Home CLI shim。
- 注册 Codex provider marketplace。

运行结果：

- Codex 调用 `movscript mcp stdio`。
- MCP host 先查 daemon descriptor。
- 没有 daemon 时，插件用 `plugins/movscript/current/bin/movscript.mjs daemon run` 启动本机 daemon。
- daemon identity 与 current bundle 对齐。

### 4.2 用户只安装 Desktop

安装结果：

- Desktop App 作为 GUI 产品安装。
- Desktop 包内带一个 provider plugin bundle，作为“安装候选”和“修复源”。
- 首次启动时 Desktop 准备 MovScript Home，并检查 Home 中是否已有 `plugins/movscript/current`。

运行结果：

- 若 Home current 不存在，Desktop 将内置 bundle 安装到 Home plugin store，并设置 current。
- 若 Home current 存在且版本大于或等于 Desktop 内置 bundle，Desktop 复用 Home current。
- 若 Home current 存在但缺失、损坏或 daemon 启动失败，Desktop 可以用内置 bundle执行 repair，但必须保留 previous。
- Desktop attach 或 ensure 同一个 `movscript.local-node` daemon。

### 4.3 用户先装 Desktop，再点“安装 Codex 插件”

目标行为：

- 这不是安装第二套 MovScript runtime。
- Desktop 应把 Codex marketplace 指向 Home 中的 `plugins/movscript/current`。
- Codex 插件使用同一个 Home、同一个 current、同一个 daemon descriptor。

建议改造：

- `apps/desktop/electron/services/codexPluginInstaller.ts` 不再复制 Desktop 内置 bundle 到独立 marketplace runtime。
- 它应调用统一的 Home plugin store 安装器，确保 `plugins/movscript/current` 已存在。
- Codex marketplace 的插件路径使用 symlink 或轻量 wrapper 指向 Home current。
- 安装结果展示 current version、pluginRoot、daemon status，而不是仅展示 marketplaceRoot。

### 4.4 用户先装 Agent Plugin，再装 Desktop

目标行为：

- Desktop 尊重已有 Home current。
- Desktop 内置 bundle 只作为候选版本。
- 如果 Desktop 内置版本更新，Desktop 可以提示“升级 Home plugin 到随 Desktop 附带版本”。
- 用户确认后，Desktop 走同一套 install-plugin 逻辑：写 `<version>`、切 current、保留 previous、重启 daemon。

### 4.5 Desktop 自身更新

Desktop 更新分两层：

- App binary 更新：由 Desktop updater 或平台安装器完成。
- Home plugin runtime 更新：由 Home plugin store 完成，不能隐式降级。

规则：

- Desktop 内置 bundle 版本高于 Home current：提示升级，或按设置自动升级。
- Desktop 内置 bundle 等于 Home current：无需动作。
- Desktop 内置 bundle 低于 Home current：不降级；仅作为 repair source，且 repair 前需要明确说明会切到较旧版本。
- Desktop 更新前应尝试停止 daemon；更新后读取 descriptor，发现 identity 不一致时提示或自动重启 daemon。

## 5. Bundle 与版本治理

Home plugin store 是运行时 bundle 的唯一事实来源：

```text
$MOVSCRIPT_HOME/
  bin/
    movscript
    movscript.mjs
  plugins/
    movscript/
      current -> 0.1.30
      previous -> 0.1.29
      current.identity
      0.1.30/
      0.1.29/
  runtime/
    apps/
    endpoints/
    services/
```

`current.identity` 至少包含：

- `schema=movscript.agent-plugin-bundle.v1`
- `version`
- `pluginRoot`
- `currentLink`
- `previousRoot`
- `installedAt`
- `reason`
- `release`
- `asset`
- `provider`

需要新增或固化的规则：

- 所有写 current 的路径使用同一个 installer library 或 CLI 子命令，避免 Desktop 和 shell installer 各写各的。
- current 切换必须是原子 symlink/junction 替换。
- current 切换后必须写 identity。
- daemon 启动失败时允许自动 rollback 到 previous。
- rollback 后 descriptor identity 必须显示 rollback 后的 pluginRoot。
- release 需要生成 bundle manifest，包含 version、apiVersion、minDaemonApiVersion、capabilities、bundleHash。

## 6. 构建与分发机制改造

### 6.1 Release 产物

GitHub Release 保持两个用户入口：

- `movscript-agent-plugin-<version>.zip`
- Desktop packages：macOS DMG、Windows installer/portable、Linux AppImage

daemon 不单独发布为第三个资产。daemon 随 plugin bundle 和 Desktop 内置 bundle 分发。

### 6.2 插件包内容

插件 zip 必须包含：

- `.codex-plugin/plugin.json`
- `.provider-plugin/plugin.json`
- `.mcp.json`
- `bin/movscript`
- `bin/movscript.mjs`
- compatibility shim：`bin/movscript-agent-mcp`
- `manifest.runtime.json`
- `runtime/services/**`
- `skills/**`
- `assets/**`
- `README.md`

`check:plugin-distribution` 应继续作为插件包门禁，并补充：

- `manifest.runtime.json` schema 校验。
- bundleHash 生成与校验。
- `/v1/runtime/descriptor` 兼容矩阵校验。
- current/previous/rollback smoke test。

### 6.3 Desktop 包内容

Desktop 包继续携带 provider plugin bundle：

- 打包位置：`provider-plugins/movscript`
- 作用：安装候选、离线修复源、首次启动 seed。
- 不作为运行时事实来源直接被 Codex 使用。

`verify:package-resources` 应补充：

- Desktop 内置 provider plugin 与同版本 agent plugin zip 的 manifest/runtime 文件一致。
- Desktop 内置 bundle 的 `manifest.runtime.json` 与 release tag/version 一致。
- Desktop 内置 bundle 通过同一套 plugin distribution checks。

### 6.4 安装脚本

`install-plugin.sh` 继续负责 plugin-only 安装，但应抽出共享 installer contract：

- Shell installer、Desktop installer、Desktop “安装 Codex 插件”按钮使用同一套版本比较和 current 切换规则。
- `install-desktop.sh` 只安装 Desktop，不直接覆盖 Home current。
- Desktop 首启和更新时再按规则 seed/upgrade/repair Home plugin store。

### 6.5 发布门禁

发布前需要通过：

- `pnpm run check`
- `pnpm run release:package:plugin`
- `pnpm run release:package:unsigned` 或 signed package
- 插件安装 smoke：全新 Home、已有 Home、rollback、Codex marketplace register。
- Desktop smoke：全新 Home、已有 plugin current、Desktop 更新后 daemon identity、安装 Codex 插件按钮。
- 运行时 smoke：`movscript daemon status`、`GET /v1/runtime/descriptor`、`movscript mcp stdio`。

## 7. 服务边界改造

产品 contract 统一收口到 daemon gateway：

- public gateway 前缀：`/v1`
- runtime：`/v1/runtime/descriptor`、`/v1/runtime/status`、`/v1/runtime/configure`
- context：`/v1/context`、`/v1/context/sessions`
- MCP：`/v1/mcp`
- project/canvas/editing/media/resource 请求通过 daemon gateway 转发或编排。

Desktop、surface、plugin 不应把以下内部 URL 作为产品 contract：

- `dataServiceBaseURL`
- `projectServiceBaseURL`
- `canvasServiceBaseURL`
- `editingServiceBaseURL`
- `mediaPipelineBaseURL`
- `/local-api`

兼容字段可以短期保留，但要满足：

- 标记 deprecated。
- 只由 descriptor 派生。
- 不写入用户设置作为权威配置。
- 不出现在新 UI、新文档和新 API 设计中。

## 8. 分阶段实施计划

### P0：统一产品事实源

交付物：

- 新增 bundle manifest schema：`manifest.runtime.json` 包含 version、apiVersion、minApiVersion、capabilities、bundleHash。
- daemon descriptor 增加 `apiVersion`、`bundleHash`、`compatibility` 字段。
- 建立版本比较规则：newer、same、older、incompatible、repair-only。
- 将 README 文档索引改为真实存在的文档。

验收：

- Desktop、Plugin、CLI 读取同一份 descriptor。
- descriptor 能判断当前 daemon 是否由 Home current 启动。
- 文档中不再把 daemon 当第三个用户下载产品。

### P1：Home Plugin Store 统一安装器

交付物：

- 将 current/previous/current.identity 操作抽成 Node installer library 或 `movscript plugin install` 子命令。
- `install-plugin.sh` 调用该统一逻辑，shell 只负责下载和校验。
- Desktop 首启 seed、Desktop 更新升级、Desktop 安装 Codex 插件按钮都走同一套 install/repair path。

验收：

- plugin-only 安装、Desktop-only 安装、Desktop 安装 Codex 插件三条路径得到相同 Home layout。
- 任一入口切换 current 后，daemon descriptor identity 与 current.identity 一致。
- daemon 启动失败自动 rollback 到 previous。

### P2：Desktop 与 Plugin 共存体验

交付物：

- Desktop 设置页和托盘展示 runtime owner、data plane、plugin current version、daemon status。
- Desktop 安装 Codex 插件按钮展示使用的 Home、current version、Codex marketplace path。
- Desktop 更新后检查 Home current 与内置 bundle 版本关系，并给出升级、保持、修复三种状态。

验收：

- 已装 Desktop 后安装 Codex 插件，不产生第二个 daemon。
- 已装 Agent Plugin 后安装 Desktop，不覆盖较新的 Home current。
- Desktop 更新不会把 Home current 降级。
- 用户可以从 UI 或 CLI 触发 rollback。

### P3：Gateway Contract 收口

交付物：

- Desktop renderer 新代码只使用 `runtime.gateway.baseURL` 和 `/v1`。
- local-surface-host bootstrap 输入只包含 daemon descriptor 或 same-origin gateway root。
- project surface runtime 不再接收内部 service base URL。
- `/local-api` 只作为 daemon 内部兼容 alias 保留。

验收：

- 新代码和新文档不再引入 `projectServiceBaseURL`、`dataServiceBaseURL` 等字段。
- Desktop 切换 local/cloud/external data plane 时，UI contract 不变。
- 404 或诊断信息不暴露内部 service topology 作为用户行动路径。

### P4：Release 与回归矩阵

交付物：

- release workflow 产出 plugin zip、Desktop packages、checksums、bundle manifest。
- release smoke 覆盖插件安装、Desktop 首启、Codex 插件安装、daemon descriptor、rollback。
- package resources 校验 Desktop 内置 plugin 与 plugin zip 兼容。

验收：

- 同一 release tag 下的 Desktop 内置 plugin 与 agent plugin zip 可互相校验。
- 所有平台的 Desktop 包都能在全新 Home 上 seed current。
- 已有 Home current 不会被 Desktop 包自动降级。

## 9. 关键用户场景判定表

| 场景 | 期望结果 |
| --- | --- |
| 同一 Home 下同时打开 Desktop 和 Codex 插件 | 复用同一个 daemon |
| Desktop 运行时 Codex 插件启动 | 插件读取 descriptor，attach 到 daemon |
| Codex 插件先启动，Desktop 后启动 | Desktop 读取 descriptor，attach 到 daemon |
| Desktop 内置版本新于 Home current | 提示或自动升级 Home current，之后重启 daemon |
| Desktop 内置版本旧于 Home current | 不降级，只作为 repair source |
| Home current 启动 daemon 失败 | rollback previous，重写 current.identity，再重试 |
| 用户显式设置另一个 MOVSCRIPT_HOME | 这是另一套 Home，可以有自己的 daemon |
| cloud/external data plane | daemon 仍是本机 Project/Editing/Canvas/Media owner，Data Service 可在远端 |

## 10. 风险与设计取舍

- 只允许一个 Desktop 还是一个 daemon：不要求物理机器只能有一个 Desktop 进程，但同一 Home 的业务 sidecar owner 只能是一个 daemon；多窗口 Desktop 只是同一个 daemon 的多个 client。
- 插件与 Desktop 谁更权威：Home current 更权威；Desktop 内置 bundle 是候选和修复源。
- 自动升级还是用户确认：Community 可以默认提示确认；patch 版本可提供自动升级设置；minor 或 schema 变化需要显式确认。
- 兼容窗口：至少保留 previous 一个版本；release smoke 必须覆盖 current/previous rollback。
- Codex marketplace 形态：推荐 marketplace 只指向 Home current 或 wrapper，避免复制出另一套 runtime。

## 11. 下一轮实现顺序

建议按以下顺序拆实现任务：

1. 定义 `manifest.runtime.json` 完整 schema 和 bundle compatibility 规则。
2. 扩展 daemon descriptor，返回 apiVersion、bundleHash、compatibility。
3. 抽出 Home plugin store installer library，复用 current/previous/identity/rollback 操作。
4. 改造 Desktop Codex plugin installer，让它指向 Home current。
5. 改造 Desktop 首启和更新流程，按版本关系 seed/upgrade/repair Home current。
6. 增加 smoke tests：plugin-only、desktop-only、desktop-to-codex、plugin-to-desktop、rollback。
7. 收口 Desktop/surface runtime contract，逐步删除内部 service URL 依赖。
8. 清理 README 文档索引，把本计划和真实存在的 docs 作为入口。

完成这些改造后，MovScript 的安装和运行模型会变成：用户可以只装 Desktop、只装 Agent Plugin，或者两者都装；同一 Home 下始终只有一个 daemon 作为本机运行时 owner，Desktop 与 Agent Plugin 通过 descriptor 协商版本和能力，构建分发通过同一份 bundle contract 保持一致。
