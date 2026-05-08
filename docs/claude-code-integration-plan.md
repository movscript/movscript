# Movscript Claude Code Integration Plan

本文档记录 Movscript 向 Claude Code 宿主迁移的规划。目标不是把现有 `apps/agent` 原封不动搬进 Claude Code，而是把 Movscript 的 MCP、skills、tools、draft、memory、approval 和项目实体能力包装成 Claude Code 可直接消费的插件化能力。

## 目标

让用户可以：

1. 直接在 Claude Code 中运行 Movscript 工作流。
2. 不打开 Movscript 前端，也能完成常见项目操作。
3. 通过 MCP 访问 Movscript 的正式能力边界。
4. 通过 commands、agents、skills、hooks 把 Movscript 的工作方式嵌入 Claude Code。

## 迁移原则

- Claude Code 作为宿主，负责会话、推理、工具调度和交互壳层。
- Movscript 作为领域能力提供方，负责项目语义、MCP 工具、草稿、审批、记忆和正式写入。
- 前端不再是该路径的必需入口，但仍保留给可视化审阅和精细编辑场景。
- 现有 `apps/agent` 不应被简单视为“可删除”，它承载的领域规则需要迁移到可复用的能力层。

## 可迁移资产

### 1. MCP 工具

Movscript 的项目读取、实体搜索、草稿创建、记忆读写、资源查询、结构化分析等能力，应以 MCP tool 形式暴露给 Claude Code。

### 2. Skills

现有 agent skills 应重写为 Claude Code 可加载的 skill 定义，保留：

- 任务边界
- 行为约束
- 输出契约
- 工具使用偏好

### 3. Subagents / Agents

将 Movscript 的高层工作流拆成若干 Claude Code agent：

- 项目分析
- 剧本结构化
- 角色/设定查重
- 草稿整理
- 写入前审阅

### 4. Hooks

用于自动注入：

- 当前项目上下文
- 当前目录或 workspace 标识
- 运行日志
- 审计信息

### 5. Commands

把常见入口做成 Claude Code 命令，例如：

- 初始化项目上下文
- 读取当前项目
- 分析剧本
- 生成 production draft
- 校验草稿冲突

## 推荐架构

```
Claude Code
  -> plugin / commands / hooks / subagents
  -> Movscript MCP server
  -> Movscript domain services
  -> backend entities / storage / audit
```

## 需要补的工作

1. 把现有 agent 能力拆出一个稳定的领域核心，避免只绑定 `apps/agent` HTTP runtime。
2. 为 Claude Code 定义 Movscript 插件目录结构和 manifest。
3. 把现有 tools 归类为 read / draft / write / destructive。
4. 重新整理 skills，按 Claude Code 的消费方式输出。
5. 补一份从前端 agent 到 Claude Code plugin 的迁移说明。
6. 保留原有桌面端路径，作为可视化审阅和高级调试入口。

## 阶段划分

### Phase 1

先打通最小闭环：

- 连接 MCP
- 读取项目上下文
- 执行只读工具
- 生成草稿

### Phase 2

补齐可编辑能力：

- 草稿修改
- 结构化校验
- 冲突检查
- 审批流

### Phase 3

平台化：

- 多 agent 分工
- hooks 自动化
- 命令入口
- 版本化发布

## 非目标

- 不把 Claude Code 变成 Movscript 的唯一运行形态。
- 不强迫前端在短期内退场。
- 不把已有 runtime 逻辑直接塞成黑盒插件。

