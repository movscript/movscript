# Agent Settings Concept Design

## 目标

这份文档先梳理 Agent 设置功能应该支持哪些概念，不讨论 Goal，也不要求立刻改代码。

核心目标是把用户需要理解的概念压到最低，同时让工程实现保留足够扩展性。

## 结论

Agent 设置页不应该让用户感觉自己在“修改 Agent 本体”。它应该表达为：

```text
我在管理 Agent 的配置文件、已安装能力、可执行工具和运行权限。
```

因此，当前 Agent 设置里的 `profile` 概念应删除，统一改成“配置文件”。`workflow` 不应继续作为 Agent 设置或 skill 系统概念出现；过去归在 workflow 下的内容统一表达为普通 skill 加加载方式、触发条件和工具授权。

系统核心只需要理解：

```text
Config File
Pack
Skill
Tool
Run Snapshot
```

已确认的产品约束：

- 配置文件允许用户创建多个，但同一时间只能激活一个。
- Skill 允许用户编辑 instruction；系统仍不需要理解 instruction 属于哪类说明。
- Pack 短期是本地安装和发布单元，长期要能接到插件市场。
- Tool approval 属于配置文件；系统可以提供基础审批默认值，具体配置文件可以覆盖。
- 已存在 Run 必须保存创建时的完整配置快照。

## 设计原则

1. 系统不要过度理解 skill 的内容类型。

   Runtime 不应该关心一个 skill “是什么内容分类”。Runtime 只需要关心这个 skill 什么时候加载、优先级多少、是否冲突、是否授予工具、是否进入上下文。

2. Skill 的用途说明属于作者心智，不是系统概念。

   作者可以在 instruction、metadata 或目录组织中表达写作意图，但系统和设置页不应把说明用途做成概念、配置项或运行时分支。

3. 配置文件不是 Agent 身份。

   用户切换或编辑配置时，应该明确知道影响的是后续运行默认设置，而不是不可逆地改变 Agent。

4. 设置页管理静态默认值，运行页解释实际发生了什么。

   设置页回答“默认允许什么”。Run 详情回答“这一次实际加载了什么、为什么”。

5. 业务审阅不进入 Agent 设置页。

   草稿、候选素材、项目设定采纳等业务动作仍应在对应业务工作台完成。

## 概念收敛

| 当前概念 | 建议产品概念 | 系统是否需要一等理解 | 说明 |
| --- | --- | --- | --- |
| 配置文件 | 配置文件 | 是 | 一个可保存、复制、导入导出的运行配置；多个配置文件中同一时间只有一个激活。 |
| Pack | 能力包 / 安装包 | 是 | 安装和发布单元，注册一组 skills、tools、schemas、reference。 |
| Skill | 能力说明 / 技能模块 | 是 | 给 Agent 的说明模块，核心是加载方式和 instruction。 |
| Tool | 工具 / 动作 | 是 | Agent 真正可执行的动作，有授权、审批和风险属性。 |
| Run Snapshot | 运行快照 | 是 | 某次 Run 创建时保存的完整配置事实，用于解释实际加载、可用、裁剪、审批和调用的结果。 |
| Goal | 暂不处理 | 暂不处理 | 本轮先不引入。 |

## Config File

配置文件是用户最应该理解的设置对象。

它应该支持：

- 查看当前激活配置文件。
- 创建多个配置文件。
- 同一时间只激活一个配置文件。
- 复制当前配置生成新配置。
- 切换激活配置文件。
- 导入和导出配置。
- 查看配置 diff。
- 回滚到上一个配置快照。
- 明确显示“影响后续新 Run，不追溯修改已完成 Run”。

配置文件可以包含：

```text
id
name
description
enabledPackIds
skillIds
toolGrants
model
runtimeLimits
approvalDefaults (按工具风险设置的默认审批，单个工具授权可以覆盖)
metadata
```

工程实现也应使用 config file 命名，避免 profile 继续作为 Agent 设置的一等概念残留。

`model` 是配置文件的公开模型绑定，用来描述后续新 Run 默认使用的 provider、model、API 模式和用途路由。运行时内部仍可以有本地 model-config 存储凭证状态和连接细节，但设置页不应把它表达成独立于配置文件之外的用户配置对象。

## Pack

Pack 是安装和发布单元。

它应该支持：

- 查看已安装 packs。
- 查看 pack 来源：内置、本地、插件、团队发布。
- 查看 pack 注册了哪些 skills 和 tools。
- 安装或卸载 pack。
- 未来从插件市场安装或更新 pack。
- 重新加载本地 catalog。
- 显示 pack 缺失依赖或版本不兼容。

Pack 不应该让用户直接理解复杂运行逻辑。用户只需要知道：

```text
安装这个能力包，会让某些 skills 和 tools 出现在可配置列表中。
```

## Skill

Skill 是通用说明模块。系统只需要理解加载方式，不需要理解它“是什么类型的说明”。

Skill 应该支持的字段：

```text
id
name
description
version
source
tags
instruction
loadMode
triggers
dependencies
conflicts
toolGrants
priority
contextBudget
metadata
```

`tags` 是自由文本，只用于作者组织、搜索和说明，不用于 runtime 分支，也不作为设置页的一等筛选概念。

Runtime 真正需要的字段是：

- `loadMode`：核心加载、按需加载、手动加载。
- `triggers`：什么输入或上下文下建议加载。
- `dependencies`：依赖哪些 skills。
- `conflicts`：和哪些 skills 冲突。
- `toolGrants`：加载后授予哪些 tools。
- `priority`：预算不足时的保留优先级。
- `contextBudget`：进入 prompt 的预算策略。

设置页应允许用户查看并编辑 Skill instruction。编辑后的 instruction 仍只是 Skill 自身的数据，不应把说明用途提升成系统概念。

## Tool

Tool 是实际动作，用户可以理解。

Tool 设置应该支持：

- 查看已发现 tools。
- 查看 tool 来源：runtime、plugin、MCP、本地能力包。
- 查看是否注册成功。
- 查看是否被当前配置授权。
- 设置 allow / deny。
- 设置 approval：never、on write、always。
- 使用配置文件默认 approval，并允许单个工具授权覆盖。
- 查看风险：read-only、write、destructive、project-scoped。
- 查看运行属性：concurrency safe、interrupt behavior、result projection。

Tool 是设置页里最适合显式治理的对象，因为它会产生真实副作用。

## Run Snapshot

每次 Run 应该保存创建时的配置快照。

它用于解释：

- 这次 Run 使用了哪个配置文件。
- 当时启用了哪些 packs。
- 当时配置文件启用了哪些 skills。
- 当时授权了哪些 tools。
- 当时模型和预算是什么。
- 当时 Skill instruction、tool approval、pack 来源和配置文件覆盖是什么。
- 后续配置变更为什么没有影响这次 Run。

Run 快照应把 active config file id 作为顶层字段保存；manifest metadata 只能作为当时 manifest 的完整副本存在，Run 详情不应靠当前设置反推。

这能降低用户心理负担：设置页改的是未来默认值，Run 详情看的是本次事实。

## 设置页应该支持的一级功能

### 1. 配置文件

面向用户的主入口。

应该包含：

- 当前激活配置文件。
- 配置文件列表。
- 复制、重命名、删除。
- 设为激活。
- 导入、导出。
- diff 和影响范围说明。

### 2. 已安装能力

展示 packs 和 catalog 来源。

应该包含：

- 已安装 packs。
- 每个 pack 注册的 skills 和 tools。
- 本地 catalog reload。
- 插件来源和路径。
- 版本、依赖、缺失项。

### 3. Skills

展示和配置通用 skill。

应该包含：

- 搜索和筛选。
- 按来源和加载方式筛选；tags 只作为搜索信息。
- 查看 instruction 摘要。
- 设置当前配置文件启用 / 禁用。
- 查看依赖、冲突、授予工具。
- 查看为什么当前配置文件会加载或不加载。

不建议在主 UI 中按说明用途给 skills 分组。

### 4. Tools

展示和配置可执行动作。

应该包含：

- 授权状态。
- 审批规则。
- 风险和副作用说明。
- 来源和注册状态。
- 运行可用性。
- 批量授权和批量审批规则。

### 5. 模型与运行限制

配置当前激活配置文件的模型和预算。

应该包含：

- provider / model。
- API 模式。
- 用途路由，例如 chat / planner。
- context budget。
- history budget。
- skill/context projection budget。

这一区域保存后应写入当前激活配置文件。已存在 Run 继续使用创建时保存的快照，不被后续模型或预算改动影响。

### 6. 设置快照

用于可回滚和可迁移。

应该包含：

- 导出当前配置。
- 导入配置。
- 预览导入影响。
- 只导入模型、skills、tools 或 limits 的局部能力。

## 设置页不应该承担的功能

- 不审阅 Agent 生成的业务草稿。
- 不展示完整 run trace。
- 不解释某次 run 的 prompt 裁剪细节。
- 不承担素材候选采纳或正式写入。
- 不把说明用途做成用户必须理解的独立设置对象。

这些应该放到业务页面或 Run 详情页。

## Run 详情页应该解释的内容

Run 详情页应该从设置页分离出来，专门回答“这次实际发生了什么”：

- 使用了哪个配置快照。
- 实际加载了哪些 skills。
- 哪些 skills 被 omit，原因是什么。
- 哪些 tools 出现在 prompt 中。
- 哪些 tools 被调用、失败、等待审批或被拒绝。
- prompt/context 如何被预算裁剪。
- 用户审批如何影响后续执行。

## 推荐的信息架构

```text
Agent 控制台
  概览
  配置文件
    当前配置
    配置列表
    导入 / 导出 / Diff
  已安装能力
    Packs
    Catalog reload
    插件来源
  Skills
    配置文件启用状态
    依赖 / 冲突 / 工具授予
    来源和搜索
  Tools
    授权
    审批
    风险
    运行可用性
  模型与运行限制
  运行记录
  高级诊断
```

其中“配置文件”应该比 “Skills / Tools” 更靠前，因为它是用户理解设置的入口。

Agent 控制台的职责是配置控制面：

- 组织配置文件、已安装能力、Skills、Tools、模型与运行限制。
- 解释当前激活配置文件会怎样影响后续新 Run。
- 提供运行记录入口和高级诊断入口。

Agent 控制台不应该发明新的 Agent 设置概念。尤其不应该重新引入 Profile、Workflow、Policy 这类和 Skill 内容用途绑定的分类。需要分类时，优先使用已有系统字段：配置文件、加载方式、触发条件、工具授权、审批默认值和运行快照。

## 对现有实现的整理方向

短期不需要重写 runtime。

可以先做这些概念层收敛：

1. UI 文案把 `profile` 改成“配置文件”。
2. 文档明确废弃 `workflow` 作为 Agent 设置概念；任务做法统一落到普通 skill 的触发条件和加载方式。
3. 设置页继续保留 Skills 和 Tools 管理，但不再暴露说明用途分类。
4. Runtime 解释继续显示 skill omissions，但原因用加载方式语言表达，而不是类型语言表达。
5. 工具权限覆盖按配置文件隔离保存；切换激活配置文件时使用目标配置文件自己的授权和审批规则覆盖。
6. 模型配置写入当前激活配置文件，同时运行时内部可以同步所需的 model-config 连接状态。
7. 新建 Run 时保存完整配置快照，而不是只保存配置文件 id 或关键 diff。
