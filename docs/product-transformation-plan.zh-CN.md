# Movscript 产品转型计划

状态：实施追踪

本文记录当前公开产品面的落地基线。Movscript 的本机安装形态以 Agent Plugin、Desktop App、CLI 共享同一个 Home 和同一个 runtime bundle 为准。

## Home Plugin Store

实现基线位于 `packages/plugins/src/node/homePluginStore.ts`。

- Agent Plugin 安装、Desktop 启动种子包、Codex marketplace 安装都写入 Home plugin store。
- Codex marketplace 通过 symlink 指向 Home current。
- Desktop-to-Codex marketplace link 指向同一个 Home current。
- `current.identity` 记录 version、bundleHash、apiVersion、minDaemonApiVersion 和 pluginRoot。

## Desktop Runtime

- Desktop 启动时通过 `runtimeBundleStatus` 判断当前 Home bundle 状态。
- 下载、更新、回滚和修复动作集中到 `runtimeBundleAction.ts`。
- Desktop 只负责可视化工作台和用户触发的 runtime bundle 操作；本机服务所有权仍由 local-node daemon 承担。

## Installer Baseline

状态：Node installer library 已落地

Node installer library 负责安装、保留 previous、回滚 current，并维护 Codex marketplace link。发布前的 smoke test 必须验证 Home current、previous、current.identity 和 runtime descriptor 的一致性。
