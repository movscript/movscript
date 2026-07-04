# Movscript 产品转型计划

状态：实施追踪

本文记录当前公开产品面的落地基线。Movscript 的本机安装形态以 Agent Package、Desktop App、CLI 共享同一个 Home 和同一个 runtime bundle 为准。

## Agent Package And Provider Targets

实现基线位于 `packages/plugins/src/agentPackage.ts` 和 `packages/plugins/src/node/agentProviderRegistration.ts`。

- Agent Package 是安装单元，schema 为 `movscript.agent-package.v1`，随插件包放在 `.agent-package/package.json`。
- Provider target 是宿主投影，不再把 Codex plugin 当作唯一包格式。
- 默认 target 覆盖 Codex、Harness Worker Agent、OpenClaw 和 Claude Code；旧称 `xiaolongxia` 归一到 `openclaw`。
- Codex target 写 marketplace；Claude Code target 写 `.mcp.json`；OpenClaw target 写 MCP registry JSON；Harness target 写 Worker Agent export。
- 统一安装仍落到 Home current/previous，并让每个 provider target 通过 symlink 指向同一个 Home current。

## Home Plugin Store

实现基线位于 `packages/plugins/src/node/homePluginStore.ts`。

- Agent Package/Agent Plugin 安装、Desktop 启动种子包、Desktop provider target 安装都写入 Home plugin store。
- Codex marketplace 和其他 provider target projection 都通过 symlink 指向 Home current。
- Desktop-to-provider target link 指向同一个 Home current。
- `current.identity` 记录 version、bundleHash、apiVersion、minDaemonApiVersion 和 pluginRoot。

## Desktop Runtime

- Desktop 启动时通过 `runtimeBundleStatus` 判断当前 Home bundle 状态。
- 下载、更新、回滚和修复动作集中到 `runtimeBundleAction.ts`。
- Desktop 只负责可视化工作台和用户触发的 runtime bundle 操作；本机服务所有权仍由 local-node daemon 承担。

## Installer Baseline

状态：Node installer library 已落地

Node installer library 负责安装、保留 previous、回滚 current，并维护 provider target registration/projection；其中 Codex target 保持 marketplace 兼容输出。发布前的 smoke test 必须验证 Home current、previous、current.identity 和 runtime descriptor 的一致性。
