# Agent Catalog 分层

这个 catalog 是本地 Agent 的运行时行为面。每一层都应保持窄边界，这样能力可以组合，而不会产生隐藏副作用。

## 产品层

内置 MovScript catalog 拆成以下面向产品的层：

| 产品层 | 拥有 | 示例 |
| --- | --- | --- |
| Agent Core | Agent 拥有的 memory、用户输入、catalog inspection、planner subagents 和 generation job 提交 | `core.pack.agent`, `tools/core/`, `skills/core/` |
| Workspace | 本地 workspace open、validate 和 apply 工具；validate 内置 validation | `workspace.pack.lifecycle`, `tools/workspace/` |
| MovScript | 当前任务 focus、项目读取和可审阅 workspace Skills | `movscript.pack.workspace`, `tools/movscript/workspace/`, `skills/movscript/` |
| Candidate | 生成输出加入候选集，以及围绕候选写入的执行保护 | `tools/candidate/`, `skills/candidate/` |
| Generation Tools | 模型发现和 provider-level generation job contract；提交任务的 skill 归属 Agent Core | `tools/generation/`, `skills/core/generation/` |

业务 workspace 继续按领域拆分：

| 业务 Workspace 层 | 拥有 | 不拥有 |
| --- | --- | --- |
| Project Workspace | Creative references，以及绑定到 creative references 的 asset slots | Production segments、生成任务 |
| Production Workspace | 绑定到 segments 的情绪段和场景时刻；引用项目设定/资产 | 项目级设定创建、生成媒体绑定 |
| Asset Workspace | 素材需求清单、独立素材候选计划、引用、风险、验收标准、生成准备度 | Project standards workspace 的 asset-slot 归属、任务创建 |
| Content Unit Workspace | 分镜/content-unit/keyframe/media 规划 workspaces；可由未来 skills 扩展 | 直接执行生成、正式后端 apply |

## 层职责

| 层 | 拥有 | 不拥有 |
| --- | --- | --- |
| Schema | Workspace payload 形状、prompt summary、examples、validation target | Tool 选择、Skill 顺序、运行时激活 |
| Tool | 一个可执行动作、input schema、permission、risk、默认 approval | 何时使用动作、业务流程、workspace schema 说明文本 |
| Skill | 可加载 instruction：稳定行为倾向、跨任务规则、任务 runbook 或专业知识 | 复制 tool schemas、越界正式写入、承担 pack/config file 的注册职责 |
| Pack | 可发布的 schema/tool/skill id 注册单元；linter 校验所列资源存在，并校验包含的 skills 的 tool/schema refs 被此 pack 或其 required packs 覆盖 | Prompt 内容、业务流程文本、tool 参数说明 |
| Config File | 运行时绑定：enabled packs、skills、limits，以及可选的收窄 overrides | Skill bodies、schema bodies、tool descriptions、重复的 skill/tool 清单 |

运行时可用性由 pack 驱动。Tool 和 skill 文件会加载进 catalog 用于发现，但只有被已启用 pack 注册后，才对运行时可用。loader 会从 `configFile.enabledPackIds` 推导候选 skills 和 tool grants；`configFile.skillIds` 和 `toolGrants` 是配置文件的显式选择。

## Skill 编写模式

Skill 的用途不进入系统分类。系统只读取 manifest 里的加载方式、触发条件、依赖/冲突、tool grants 和 instruction 内容；下面只是给 Skill 作者维护边界时使用的编写模式。

| 类别 | 可创建 Workspaces | 可创建生成任务 | 可写正式实体 | 典型工具 |
| --- | --- | --- | --- | --- |
| Planning / Workspace | 是 | 否 | 否 | focus、workspace、input |
| Generation Execution | 否，除非记录本地 notes | 是，需要审批 | 否 | model list、create job、inspect job |
| Review / Selection | 否，除非记录本地 notes | 否 | 否 | focus、read workspaces/resources |
| Apply / Formal Write | 否，audit workspaces 除外 | 否 | 是，需要审批或 UI apply | backend write/apply tools |

不要在同一个业务 runbook 中混合 planning 和 generation。Planning instruction 可以准备 prompt candidates 和验收标准。Generation instruction 可以提交并监控任务。Review instruction 可以比较输出。正式写入或绑定必须显式发生，并受审批控制。

## Skill 模板

Catalog 资源目录采用 pack-first 结构。`skills/` 或 `tools/` 下的第一层文件夹应匹配拥有该资源的产品层。`skills/` 下的子目录只是作者维护和检索信号，不是系统必须理解的 Skill 类型。

```text
skills/
  core/
    base/
      default/
        skill.json
        instruction.md
    rules/
      runtime/
        skill.json
        instruction.md
    generation/
      visual_execution/
        skill.json
        instruction.md
  workspace/
    rules/
      lifecycle/
        skill.json
        instruction.md
  candidate/
    asset_planning/
      skill.json
      instruction.md
  movscript/
    orchestrator/
      skill.json
    rules/
      workspace/
        skill.json
        instruction.md
    workspace/
      project/
        project_standards_workspace/
          skill.json
          instruction.md
tools/
  core/
  workspace/
  candidate/
  generation/
  reference/
  movscript/
    workspace/
```

需要跨任务生效的规则应写成普通 Skill，并由 pack/config file 显式启用；系统不需要知道这条 Skill 的说明用途：

```text
skills/
  core/
    rules/
      runtime/
        skill.json
        instruction.md
  workspace/
    rules/
      lifecycle/
        skill.json
        instruction.md
  movscript/
    rules/
      workspace/
        skill.json
        instruction.md
```

业务 runbook 仍应保持一项职责一个目录：

```text
skills/
  movscript/
    workspace/
      production/
        production_workspace/
          skill.json
          instruction.md
```

运行时行为来自 enabled packs 中注册的 skill ids、skill manifest 的加载方式/触发条件、tool grants 和 instruction；目录名只是归属和维护信号，不是传给模型的语义输入。

非平凡业务 instruction 使用这个结构：

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
只有当边界可以从 configFile 和 tool grants 中显然看出时，才允许短 Skill。如果 task 提到生成媒体、正式实体、审批或审阅状态，必须显式写出边界。

## 边界规则

- Project standards workspace skills 只管理项目级 setting references 和有归属的 asset slot requirements。
- Production workspace skills 只管理 production segments 和 scene moments。
- Asset workspace skills 是独立业务层。它们创建或编辑本地 asset workspace workspaces 和 generation-ready candidate plans，但不提交图片/视频任务。
- Content-unit workspace skills 只管理 storyboard、keyframe 和 media planning workspace units。
- Visual generation skills 是内置 skills 中唯一能创建并监控图片/视频生成任务的部分。
- Generated media 在用户通过显式 UI/后端动作接受或绑定前，始终只是审阅候选。
- Local workspaces 不是正式项目数据。正式写入必须由工具结果或 UI apply 流程证明。
