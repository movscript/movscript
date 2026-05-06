# Agent 动态更新架构

本文档定义 MovScript agent 的动态更新边界。目标是在用户不愿频繁升级完整客户端时，仍能交付必要的安全修复、prompt/policy 修复、工具目录修复和技能目录修复，同时保留审计、回滚和管理员控制。

## 设计原则

- **运行时代码和行为策略分离**：`apps/agent` 的 Node.js runtime 不做任意远程代码热替换；动态更新优先作用于 manifest、policy、prompt、tool catalog、skill catalog。
- **强制更新只用于关键修复**：安全、越权、错误写入、严重崩溃等修复可 `force_apply`。新增能力和重大行为变化必须可灰度、可审批。
- **每次 run 记录有效版本**：Run trace 至少记录 manifest version、runtime version、update policy version，便于问题追溯。
- **远程更新必须可验证**：远程包必须签名；未签名远程更新直接拒绝。
- **所有更新可回滚**：策略默认保留最近 5 个可回滚版本；关键修复也要保留上一个可运行版本。

## 更新分级

| Severity | 默认决策 | 适用范围 |
| --- | --- | --- |
| `critical` | `force_apply` | 安全修复、越权风险、错误写入、严重不可用 |
| `normal` | `auto_apply` | 兼容的 prompt、policy、tool、skill 修复 |
| `feature` | `require_approval` | 新工具、新技能、新能力、默认行为扩展 |
| `major` | `require_approval` | 重大行为变化、权限模型变化、迁移性更新 |

代码级更新的默认策略更保守：即使是 `critical`，`runtime_code` 也会被标记为 `defer`，交给签名应用更新器处理，而不是 agent 动态策略通道处理。

## 组件边界

```
Update Source
  -> signature / schema validation
  -> update policy evaluation
  -> catalog / manifest / prompt state
  -> AgentRuntime capabilities
  -> Run setup trace
```

当前第一版已经落地：

- `apps/agent/src/updates/updatePolicy.ts`
  - 定义 `AgentUpdatePolicy`
  - 定义 `AgentUpdateCandidate`
  - 评估 `force_apply | auto_apply | defer | require_approval | reject`
- `apps/agent/src/bootstrap/agentServerContext.ts`
  - 构造当前 `AgentUpdateState`
  - 在 `/runtime/capabilities` 和 `/health` 暴露更新策略状态
- `apps/agent/src/state/types.ts`
  - `AgentCapabilitiesResponse.updates`
  - `AgentRuntimeOptions.updateState`

## 第一阶段范围

第一阶段只支持本地/builtin 动态更新状态表达和策略评估：

- builtin catalog 加载
- local skill/tool catalog 加载
- 当前 manifest version 记录
- 默认 update policy 暴露
- pending candidate 的决策评估

第一阶段不做：

- 远程拉取
- 自动下载
- runtime code 热替换
- 后台静默重启

这些能力需要在签名校验、审计日志、回滚存储和企业策略控制完成后再接入。

## 后续实施路线

1. 增加 update manifest 文件：
   - `.movscript-agent/updates/policy.json`
   - `.movscript-agent/updates/applied.json`
   - `.movscript-agent/updates/pending.json`
2. 增加远程 index 拉取：
   - 只接受 HTTPS
   - 校验签名和 digest
   - 按 channel 过滤 `stable | beta | dev`
3. 增加应用器：
   - `policy/prompt/tool_catalog/skill_catalog` 可动态应用
   - `runtime_code` 只生成“需要应用更新器处理”的状态
4. 增加审计：
   - 记录 update id、version、source、signature、decision、appliedAt、rollbackFrom
5. 增加 UI/管理员控制：
   - critical 显示已强制应用
   - normal 显示自动应用历史
   - feature/major 进入待审批列表

## 安全约束

- 远程更新默认 `requireSignatureForRemoteUpdates: true`。
- 动态策略默认 `allowRuntimeCodeUpdates: false`。
- 工具权限变化必须通过 manifest/tool grant diff 展示。
- 新增 write/generate/destructive 工具不能绕过现有 approval 和 sandbox。
- 用户 run 中使用的有效版本必须可追溯，不能只保留“最新状态”。
