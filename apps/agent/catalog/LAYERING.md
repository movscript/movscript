# Agent Catalog 分层

这个 catalog 是本地 Agent 的运行时行为面。每一层都应保持窄边界，这样能力可以组合，而不会产生隐藏副作用。

## 产品层

内置 MovScript catalog 拆成以下面向产品的层：

| 产品层 | 拥有 | 示例 |
| --- | --- | --- |
| Agent Core | Agent 拥有的 memory、用户输入、catalog inspection 和 planner subagents | `movscript.pack.agent-core`, `tools/agent-core/`, `skills/agent-core/` |
| Drafts | 本地审阅 draft CRUD、校验和 preview 工具 | `movscript.pack.drafts`, `tools/drafts/` |
| MovScript | 当前任务 focus、项目读取、可审阅 proposal workflows 和视觉生成任务 | `movscript.pack.movscript`, `tools/movscript/`, `skills/movscript/` |

业务 proposal 继续按领域拆分：

| 业务 Proposal 层 | 拥有 | 不拥有 |
| --- | --- | --- |
| Project Proposal | Creative references，以及绑定到 creative references 的 asset slots | Production segments、生成任务 |
| Production Proposal | 绑定到 segments 的情绪段和场景时刻；引用项目设定/资产 | 项目级设定创建、生成媒体绑定 |
| Asset Proposal | 独立素材候选计划、引用、风险、验收标准、生成准备度 | Project proposal 的 asset-slot 归属、任务创建 |
| Content Unit Proposal | 分镜/content-unit/keyframe/media 规划 proposals；可由未来 skills 扩展 | 直接执行生成、正式后端 apply |

## 层职责

| 层 | 拥有 | 不拥有 |
| --- | --- | --- |
| Schema | Draft payload 形状、prompt summary、examples、validation target | Tool 选择、workflow 顺序、运行时激活 |
| Tool | 一个可执行动作、input schema、permission、risk、默认 approval | 何时使用动作、业务流程、draft schema 说明文本 |
| Skill Persona | 稳定角色、沟通姿态、始终成立的行为倾向 | Workflow 步骤、tool 参数、schema 细节 |
| Skill Policy | 跨任务 guardrails、审批/写入边界、平台概念 | 有序任务流、tool catalog 归属 |
| Skill Workflow | 某一任务类型的 runbook：trigger、boundary、allowed tools、process、output | Persona 文本、复制 tool schemas、越界正式写入 |
| Pack | 可发布的 schema/tool/skill id 注册单元；linter 校验所列资源存在，并校验包含的 skills 的 tool/schema refs 被此 pack 或其 required packs 覆盖 | Prompt 内容、业务流程文本、tool 参数说明 |
| Profile | 运行时绑定：enabled packs、persona、limits，以及可选的收窄 overrides | Skill bodies、schema bodies、tool descriptions、重复的 workflow/policy/tool 清单 |

运行时可用性由 pack 驱动。Tool 和 skill 文件会加载进 catalog 用于发现，但只有被已启用 pack 注册后，才对默认运行时可用。loader 会从 `profile.enabledPacks` 推导 candidate workflows、policies 和 tool grants；显式的 `enabledWorkflows`、`enabledPolicies` 和 `toolGrants` 只是兼容性的收窄字段。

## Workflow 类别

每个 workflow skill 都应严格写成以下类别之一。

| 类别 | 可创建 Drafts | 可创建生成任务 | 可写正式实体 | 典型工具 |
| --- | --- | --- | --- | --- |
| Planning / Proposal | 是 | 否 | 否 | focus、draft、input |
| Generation Execution | 否，除非记录本地 notes | 是，需要审批 | 否 | model list、create job、inspect job |
| Review / Selection | 否，除非记录本地 notes | 否 | 否 | focus、read drafts/resources |
| Apply / Formal Write | 否，audit drafts 除外 | 否 | 是，需要审批或 UI apply | backend write/apply tools |

不要在一个 workflow 中混合 planning 和 generation。Planning workflow 可以准备 prompt candidates 和验收标准。Generation workflow 可以提交并监控任务。Review workflow 可以比较输出。正式写入或绑定必须显式发生，并受审批控制。

## Workflow 模板

Catalog 资源目录采用 pack-first 结构。`skills/` 或 `tools/` 下的第一层文件夹应匹配拥有该资源的产品层；`skills/` 下的 kind 文件夹控制 prompt 注入语义。

```text
skills/
  agent-core/
    persona/
      movscript-default.persona.json
      mode-personas.persona.json
    policy/
      agent-core/
        skill.policy.json
        instruction.md
  drafts/
    policy/
      drafts/
        skill.policy.json
        instruction.md
  movscript/
    persona/
      movscript-personas.persona.json
    policy/
      movscript/
        skill.policy.json
        instruction.md
    workflow/
      proposal/
        project/
          project-proposal/
            skill.workflow.json
            instruction.md
      generation/
        visual-generation/
          skill.workflow.json
          instruction.md
tools/
  agent-core/
  drafts/
  movscript/
    workspace/
    visual-generation/
```

每个 pack 都应拥有一个 policy skill，用来表达该能力层的跨任务 guardrails：

```text
skills/
  agent-core/
    policy/
      agent-core/
        skill.policy.json
        instruction.md
  drafts/
    policy/
      drafts/
        skill.policy.json
        instruction.md
  movscript/
    policy/
      movscript/
        skill.policy.json
        instruction.md
```

Workflow skills 仍应保持每个 workflow 一个目录：

```text
skills/
  movscript/
    workflow/
      proposal/
        production/
          production-proposal/
            skill.workflow.json
            instruction.md
```

运行时行为来自 enabled packs 中注册的 skill ids；目录名只是归属和维护信号，不是传给模型的语义输入。

非平凡 workflow Markdown 文件使用这个结构：

```md
目标：
输入：
边界：
允许的工具：
流程：
校验：
输出：
绝不：
```
只有当边界可以从 profile 和 tool grants 中显然看出时，才允许短 workflow。如果 workflow 提到生成媒体、正式实体、审批或审阅状态，必须显式写出边界。

## 边界规则

- Project proposal skills 只管理项目级 setting references 和有归属的 asset slot requirements。
- Production proposal skills 只管理 production segments 和 scene moments。
- Asset proposal skills 是独立业务层。它们创建或编辑本地 asset proposal drafts 和 generation-ready candidate plans，但不提交图片/视频任务。
- Content-unit proposal skills 只管理 storyboard、keyframe 和 media planning draft units。
- Visual generation skills 是内置 skills 中唯一能创建并监控图片/视频生成任务的部分。
- Generated media 在用户通过显式 UI/后端动作接受或绑定前，始终只是审阅候选。
- Local drafts 不是正式项目数据。正式写入必须由工具结果或 UI apply 流程证明。
