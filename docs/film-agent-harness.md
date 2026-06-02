# Film Agent Harness

## 1. 定义

在 MovScript 里，影视领域的 Agent Harness 不是一个单独的 Agent、prompt 或工具集合，而是一套让 Agent 能在影视生产语境中稳定工作的运行框架。

它负责定义：

- Agent 面对的影视任务是什么。
- Agent 能读取哪些项目上下文。
- Agent 以什么身份判断问题。
- Agent 可以调用哪些工具。
- Agent 产出的内容应当落在哪个业务层。
- Agent 什么时候必须停下来等待用户确认。
- Agent 的结果如何被审阅、追踪和评估。

一句话概括：

> Film Agent Harness 是影视 Agent 的生产级约束外壳。它把通用大模型约束成一个懂项目、懂工种、懂流程、懂格式、会用工具、能持续协作的影视行业助手。

这里的 Harness 不是为了让 Agent 显得更聪明，而是为了让 Agent 在真实项目里不乱写、不越权、不混层、不把候选当成事实。

## 2. 为什么影视领域需要 Harness

影视项目天然不是一次性问答。它包含长期状态、多角色协作、多版本材料、多种成果物和高成本执行链路。

如果没有 Harness，Agent 很容易出现几类问题：

- 把用户随口说的方向当成已确认项目事实。
- 把创意建议写成正式设定。
- 把 production 层的临时安排污染到 project 层。
- 把生成候选图、prompt 或任务结果说成已被接受的资产。
- 只做文学分析，无法服务制片、导演、分镜、宣发等实际工作流。
- 在没有依据时补全剧情、角色、场景或制作条件。
- 输出漂亮但不可审阅、不可应用、不可追踪的内容。

Harness 的核心价值是把 Agent 的行为变成可解释、可审阅、可恢复、可追踪的生产行为。

## 3. Harness 的边界

Film Agent Harness 负责运行规则，不负责替代所有业务实现。

它拥有：

- 任务边界：当前 run 是剧本阅读、项目设定、production 编排、素材规划，还是视觉生成执行。
- 身份边界：Agent 此刻站在项目策划、制作统筹、视觉导演或审阅助手的位置工作。
- 输入边界：哪些内容是项目事实，哪些是候选，哪些只是用户意图。
- 输出边界：结果应当是分析、proposal draft、candidate plan、generation job，还是正式 apply 请求。
- 工具边界：哪些工具可见，哪些工具可调用，哪些调用需要审批。
- 状态边界：哪些东西进入长期项目记忆，哪些只属于当前 run。
- 证据边界：Agent 对事实性结论必须能指向来源、工具结果或用户确认。

它不直接拥有：

- 具体模型提供商。
- 后端正式项目写入实现。
- 图像或视频生成模型内部能力。
- UI 组件布局。
- 某个单点工具的业务细节。

换句话说，Harness 是“Agent 如何在影视生产系统里工作”的协议层，而不是“某个工具怎么实现”的代码层。

## 4. MovScript 当前的领域分层

MovScript 现有 catalog 已经出现三类关键领域说明，它们可以作为 Film Agent Harness 的第一批协作边界。

### 4.1 Project Orchestrator

Project Orchestrator 站在项目层思考。

它关注：

- 项目制作标准。
- 画幅、镜头体系、摄影语言、视觉风格、灯光色彩、节奏规则。
- 可复用设定：人物、地点、道具、产品、世界规则、风格参考。
- asset slots 的归属、用途、优先级和复用边界。

它必须区分：

- project standards
- creative references
- asset slots
- local proposal drafts
- 正式项目数据

它不能把 production 编排写进 project 层，也不能把素材候选图、prompt 或生成任务写成项目规范。

### 4.2 Production Orchestrator

Production Orchestrator 站在一次具体制作的执行结构里工作。

它关注：

- segments
- scene moments
- content units
- production-local gaps
- 场景节奏、情绪推进、钩子、转场和内容组织

它必须复用上游 project-level references。缺少项目级设定或素材槽时，它应该回退到 setting proposal 或 asset proposal，而不是在 production 层硬写新设定。

它不能把 content unit 的媒体计划说成已生成资源，也不能把 production draft 说成正式 production 已改变。

### 4.3 Visual Director

Visual Director 把视觉意图转成可执行候选或生成任务。

它关注：

- prompt
- 参考资源
- 模型能力
- 画幅比例
- 时长
- 参数约束
- 验收标准
- 人物、场景、风格一致性

它必须在生成前检查当前设定材料是否已有角色、场景或 asset slot 参考。

它不能凭空声称参考素材已存在，不能用未验证模型能力创建任务，也不能把生成候选说成已接受、已锁定或正式绑定。

## 5. Harness 的核心组成

### 5.1 Task Contract

Task Contract 定义这次 Agent run 到底在完成什么任务。

典型任务包括：

- 剧本阅读与结构分析。
- 项目标准整理。
- 人物、地点、道具、世界规则提案。
- production segment 拆解。
- scene moment 组织。
- content unit 或分镜规划。
- asset slot 缺口识别。
- 视觉生成 prompt 准备。
- 图片或视频生成任务执行。
- 候选结果审阅。
- draft apply 前的变更检查。

每类任务都应当明确：

- 输入是什么。
- 可使用的工具是什么。
- 允许创建什么类型的 draft 或 job。
- 不能写入什么层。
- 何时需要用户确认。
- 输出格式是什么。

### 5.2 Role Contract

Role Contract 定义 Agent 当前以什么专业身份判断问题。

影视 Agent 不应该永远用同一个声音回答所有问题。剧本分析、制片判断、视觉执行、宣发判断的评价标准不同。

初始角色可以包括：

- Project Orchestrator：负责项目级基础、长期设定和可复用标准。
- Production Orchestrator：负责一次具体制作的结构、节奏和执行缺口。
- Visual Director：负责视觉候选、prompt、参考资源和生成任务。
- Review Assistant：负责对 draft、候选资产或生成结果做审阅对比。

Role Contract 的重点不是角色包装，而是判断标准。它决定 Agent 在遇到不确定信息时该保守、追问、提案，还是执行。

### 5.3 Context Contract

Context Contract 定义 Agent 能把哪些信息视为事实。

影视项目里的上下文至少分成：

- Project facts：已确认的项目事实。
- Project standards：已确认或待审阅的项目制作标准。
- Creative references：人物、地点、道具、风格、世界规则等可复用引用。
- Asset slots：可复用素材需求和归属。
- Production structure：某次制作的 segment、scene moment、content unit。
- Candidate assets：待审阅的候选图片、视频、prompt 或计划。
- Drafts：本地 proposal 或待 apply 的变更。
- User intent：用户在当前对话里表达的目标、偏好或临时要求。
- Tool evidence：工具读取、生成、查询或执行后的结果。

Context Contract 应当坚持一个原则：

> transcript 和项目数据是事实来源，model prompt 只是预算内投影。

也就是说，Agent 可以在当前 prompt 里看到压缩后的上下文，但它不能因为压缩、遗漏或推断而虚构事实。

### 5.4 Tool Contract

Tool Contract 定义 Agent 如何使用工具。

工具不是“能调用就调用”。影视 Harness 需要知道每个工具的性质：

- 是否只读。
- 是否会写 draft。
- 是否会写正式项目数据。
- 是否会创建外部生成任务。
- 是否会产生费用或长时间运行。
- 是否需要用户审批。
- 是否能并发执行。
- 结果是否可放入 prompt，还是必须存成 ref。

在影视工作流中，尤其要区分：

- 读取项目上下文。
- 创建 proposal draft。
- 创建 candidate plan。
- 创建 generation job。
- 查询 job 状态。
- 接受或绑定候选资产。
- 正式 apply 项目变更。

这些动作的风险不同，不能混在同一层处理。

### 5.5 Output Contract

Output Contract 定义 Agent 的结果应该是什么形态。

常见输出包括：

- 阅读分析。
- 风险清单。
- proposal draft。
- 分场或 segment 拆解。
- scene moment 表。
- content unit 计划。
- asset slot 缺口列表。
- prompt candidates。
- 生成任务参数。
- 候选资产对比。
- apply preview。
- 用户确认问题。

Harness 要求输出必须能被下一步工作消费。

例如：

- 给编剧的输出要指出结构、动机、人物弧光和对白问题。
- 给制片的输出要指出场景、角色、周期、成本和执行风险。
- 给视觉导演的输出要形成可执行 prompt、参考约束和验收标准。
- 给项目系统的输出要是可审阅 draft，而不是散文式建议。

### 5.6 State Contract

State Contract 定义哪些内容能跨 run 留存。

影视项目会持续迭代，所以 Harness 必须管理：

- 当前项目阶段。
- 当前 production 或 thread。
- 当前剧本、设定、分镜或素材版本。
- 已确认的项目事实。
- 已否决的方向。
- 用户偏好。
- 历史 draft 和 apply 记录。
- 生成候选状态。
- 审阅和批准记录。

关键规则是：

> 长期状态只能来自明确来源：项目数据、用户确认、工具结果、已 apply 的 draft 或显式 memory。不能来自模型一次回答里的自由发挥。

### 5.7 Evaluation Contract

Evaluation Contract 定义什么叫“做得好”。

影视 Agent 的质量不能只看语言流畅。更重要的是：

- 是否忠于原始材料。
- 是否区分事实、推断、建议和候选。
- 是否符合当前 role 的专业判断标准。
- 是否保持 project / production / asset / generation 分层。
- 是否避免无依据扩写。
- 是否给出可执行的下一步。
- 是否正确使用工具和审批。
- 是否留下可审阅证据。
- 是否降低用户推进项目的成本。

一个合格结果不一定最长，但必须能让用户继续推进工作。

## 6. 影视生产中的关键状态词

Harness 需要特别保护以下状态词，避免 Agent 乱用。

| 状态词 | 含义 | Agent 约束 |
| --- | --- | --- |
| fact | 已确认事实 | 必须来自项目数据、用户确认或工具证据 |
| intent | 用户意图 | 可以用于提案，不能当作事实 |
| proposal | 可审阅提案 | 不能说成已正式生效 |
| draft | 本地待审阅变更 | 只有 apply 后才可能进入正式数据 |
| candidate | 候选资源或候选方案 | 未被接受前不能说成正式资产 |
| asset slot | 项目级素材需求槽 | 不是具体生成结果 |
| generation job | 外部生成任务 | 创建任务不等于生成成功 |
| output resource | 工具返回的生成资源 | 存在不等于被接受或绑定 |
| accepted asset | 已接受资产 | 必须有用户或系统确认 |
| formal write | 正式写入 | 必须通过受控工具或 UI apply 流程 |

这些状态词应该成为 Harness 的硬边界。

## 7. 推荐的运行流程

一个影视 Agent run 可以按以下顺序运行。

1. 识别任务类型。
2. 选择当前 role。
3. 读取必要上下文。
4. 区分事实、意图、候选和缺口。
5. 判断是否需要补充输入。
6. 选择允许的 Skill。
7. 通过 tool policy 判断工具权限。
8. 生成分析、proposal、candidate plan 或 generation job。
9. 标注证据、风险和未决问题。
10. 给出下一步可执行动作。

这不是要求每次都机械执行十步，而是要求 Harness 能解释 Agent 为什么这么做。

## 8. 与现有 Agent Runtime 的关系

现有 Agent Runtime 已经有一些可承载 Harness 的基础能力：

- tool contract：工具元数据、权限、审批、执行风险、结果投影。
- context contract：durable transcript 与 model context projection 分离。
- skill contract：catalog、config file、runtime activation、omission reason。
- runtime visibility：运行时状态、审批、tool result、context projection 可观察。
- draft lifecycle：本地 draft、preview、apply 边界。
- work lifecycle：长任务、generation job、subagent run 的观察与续跑。

Film Agent Harness 应该在这些通用能力之上增加影视领域协议，而不是重新造一套 runtime。

建议映射如下：

| Harness 概念 | Runtime 承载点 |
| --- | --- |
| Task Contract | Skill、run manifest、thread intent |
| Role Contract | skill instruction、active skill state |
| Context Contract | context manager、project focus、tool evidence |
| Tool Contract | tool catalog、tool policy、execution pipeline |
| Output Contract | proposal draft schema、candidate plan schema、assistant response shape |
| State Contract | thread/run records、draft store、project backend、memory |
| Evaluation Contract | trace/debug ledger、review checklist、tests |

## 9. 第一阶段要定义的协议

后续如果要把 Film Agent Harness 真正落地，建议先定义以下文档或 schema，而不是先写大量代码。

### 9.1 Task Taxonomy

定义影视 Agent 支持的任务类型。

至少包括：

- script_reading
- project_standards_proposal
- setting_proposal
- production_proposal
- asset_proposal
- content_unit_proposal
- storyboard_gap_review
- visual_generation_execution
- candidate_review
- project_progress_review

每个 task type 都要写清：

- 触发条件。
- 所属 role。
- 可用 context。
- 可用 tools。
- 输出 artifact。
- 审批要求。
- 完成标准。

### 9.2 Context Taxonomy

定义项目上下文类型。

至少包括：

- project fact
- project standard
- creative reference
- asset slot
- production segment
- scene moment
- content unit
- media plan
- candidate asset
- draft
- generation job
- accepted asset

每类 context 都要写清生命周期和能否被 Agent 修改。

### 9.3 Artifact Taxonomy

定义 Agent 可以产出的成果物。

至少包括：

- analysis note
- risk checklist
- proposal draft
- candidate plan
- prompt candidate
- generation request
- generation result summary
- review decision
- apply preview

每种 artifact 都要能回答：

- 谁使用它。
- 它是不是正式数据。
- 它是否需要用户确认。
- 它能否被 apply。
- 它引用哪些证据。

### 9.4 State Vocabulary

定义 Agent 允许使用的状态词，并绑定到系统事实。

例如：

- proposed
- drafted
- pending_review
- approved
- rejected
- generated
- accepted
- bound
- applied
- superseded

如果系统里没有对应状态，Agent 不应自由使用这些词描述项目事实。

### 9.5 Review Rubric

定义影视 Agent 输出的审阅标准。

建议初始 rubric：

- faithful：是否忠于输入材料。
- grounded：是否有证据。
- layered：是否保持项目/制作/生成分层。
- actionable：是否能推进下一步。
- reversible：是否通过 draft/candidate 保持可审阅。
- safe：是否没有越权、无依据承诺或版权风险。
- concise：是否避免无效长篇。

## 10. 设计原则

Film Agent Harness 应遵循以下原则。

### 10.1 事实优先

Agent 可以提案，但不能把提案说成事实。

### 10.2 分层优先

Project、Production、Asset、Generation、Review 必须保持边界。缺少上游信息时，应该创建缺口或提案，而不是在下游层硬补。

### 10.3 Draft 优先

高影响变更先进入可审阅 draft。正式写入必须通过明确 apply 或受控工具。

### 10.4 证据优先

事实判断、状态判断、生成结果判断都应能追溯到来源。

### 10.5 审批优先

会产生费用、外部任务、正式写入或不可逆影响的动作，默认需要审批。

### 10.6 可恢复优先

长任务、生成任务、subagent run 和 interrupted run 都应该能被观察、恢复和解释。

### 10.7 输出可消费

Agent 输出不是为了展示表达能力，而是为了让编剧、导演、制片、视觉、宣发或系统本身能继续使用。

## 11. 非目标

第一阶段不要把 Film Agent Harness 做成大而全的系统。

明确非目标：

- 不直接重写 Agent Runtime。
- 不一次性覆盖所有影视工种。
- 不把所有创作方法论硬编码进 prompt。
- 不让 Agent 自动正式改项目数据。
- 不把生成模型能力当作已验证事实。
- 不把影评式分析当作生产级输出。

第一阶段的目标应该是定义边界和协议，让后续每个业务流程都能按同一套规则扩展。

## 12. 一个可执行的最小版本

最小可用的 Film Agent Harness 可以先只覆盖四件事：

1. Task Taxonomy：明确当前 run 属于哪类影视任务。
2. Role Contract：明确当前 Agent 以哪个身份工作。
3. Context Contract：明确哪些上下文能被当成事实。
4. Output Contract：明确结果是分析、draft、candidate plan 还是 generation job。

只要这四件事稳定，后面的 tool policy、runtime debug、review rubric 和 UI 表达都能逐步接上。

## 13. 后续讨论问题

下一步需要做的不是立刻实现，而是确认几个产品级决策：

- MovScript 的默认 Agent 到底是一个总控角色，还是多个专业角色按任务切换。
- 用户在 UI 里是否需要看到当前 role 和 task type。
- 哪些影视状态必须成为系统字段，哪些只保留在文本说明里。
- proposal draft 和 candidate plan 的 schema 是否需要统一。
- generation job 的创建、观察、接受、绑定是否要拆成四个明确协议步骤。
- Agent 输出是否需要固定的 review checklist。
- 项目长期记忆应保存哪些偏好，哪些内容只能留在线程里。

这些问题定清楚后，Film Agent Harness 才能从概念定义进入可执行协议。
