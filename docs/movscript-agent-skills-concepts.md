# MovScript Agent Skills Concepts

本文定义 MovScript Agent 的 skills 工作概念。目标是废弃旧的“workflow 子定位”设计，把 Agent 行为拆成清晰的三层：MovScript 核心概念、MovScript 工作流程、每一种工作需求的工作流程。

本文优先级高于旧的 mode / workflow prompt 说明。旧文档若把 workflow 当成子人格、入口模式或宽上下文包，应按本文修正。

## 1. MovScript 的核心概念

### Agent

Agent 是运行时执行者，只负责理解用户目标、选择合适 skill、调用工具、维护草稿和交接状态。Agent 不直接拥有业务知识全集，也不默认加载项目全量上下文。

### Focus

Focus 是本轮任务的最小锚点，不是上下文包。

Focus 只回答：

- 当前 route
- 当前 project id / name / status
- 当前 production id
- 当前 selected entity type / id / label
- 当前 user
- 当前 run / plan 的必要执行锚点

Focus 不包含项目列表、脚本正文、draft 列表、资源列表、memory 内容或实体详情。这些内容必须通过对应窄工具显式读取。

旧的宽上下文读取工具废弃。新的基础读取工具是 `movscript_get_focus`。

### Skill

Skill 是 Agent 行为模块，不是 UI mode，也不是角色入口。

MovScript 只保留三类 skill：

- Persona：Agent 的稳定工作姿态。每个 profile 至多一个。
- Policy：跨任务边界，如审批、草稿安全、写入边界。
- Workflow：某一类任务的 runbook，只在被 focus / intent / keyword 触发时注入。

Workflow 不再承担“子定位”。它不是“项目编排 Agent”“素材 Agent”“生成 Agent”的身份切换，而是完成一个明确业务任务时的操作规程。

### Tool

Tool 是一个可执行动作。Tool 只声明自己能做什么、参数是什么、风险和审批是什么。

Tool 不写业务流程，不判断何时使用，不携带 proposal schema 说明。

### Draft

Draft 是可审阅的本地方案。Draft 不是正式项目数据，也不是最终写入结果。

Agent 可以创建和修改 draft；正式 apply 必须经过 validate / preview / 用户确认 / 后端写入路径。

### Proposal

Proposal 是一种带 schema 的 draft，用于表达可审阅的业务变更或生成计划。

MovScript 当前核心 proposal kind：

- `project_proposal`
- `production_proposal`
- `content_unit_proposal`
- `asset_proposal`
- `content_unit_media_proposal`
- `script_split_proposal`

Proposal producer 可以是 Agent workflow、插件、批处理或未来自动化任务。Producer 不重要，重要的是 proposal kind、schema、review/apply 边界一致。

## 2. MovScript 的工作流程

### 默认执行顺序

Agent 每轮应该按这个顺序工作：

1. 读取 focus，确认当前任务锚点。
2. 根据用户目标和 focus 触发最少必要 workflow。
3. 只读取完成任务所需的窄上下文，例如 scripts、drafts、memories、generation jobs。
4. 产出或修改 local draft / proposal。
5. 校验 draft，必要时执行 preview apply。
6. 最终回复保留可继续工作的稳定引用。

### 上下文读取规则

默认 prompt 只放 focus。其他信息按需读取：

- 需要选择项目时，调用 `movscript_list_projects`。
- 需要剧本事实时，调用 `movscript_read_project_scripts`。
- 需要继续或审阅方案时，调用 draft 工具。
- 需要历史偏好或决策时，调用 memory 工具。
- 需要生成状态时，调用 generation job 工具。
- 缺少必要锚点时，调用 `movscript_request_user_input`。

不要重新引入“读取当前上下文包”的概念。

### Skill 分层用法

Persona 只提供稳定语气和判断姿态。

Policy 只提供通用边界，例如：

- tool result 是事实来源
- draft 不是正式写入
- 生成任务需要审批
- 删除和 catalog mutation 需要审批

Workflow 只负责一个任务类，例如：

- 创建 project proposal
- 创建 production proposal
- 创建 asset proposal
- 执行 visual generation
- 审阅 storyboard gap

Workflow 必须写清：

- Goal
- Inputs
- Boundary
- Allowed tools
- Process
- Validation
- Output
- Never

### 废弃规则

以下设计应停止新增：

- UI mode 直接选择 runtime 行为。
- workflow 作为“子定位”或“子 Agent 身份”。
- 宽泛的当前上下文包工具。
- skill 内复制 tool 参数或 schema 大段 JSON。
- 在 profile 里重复维护 pack 已经注册的 workflow/policy/tool 清单。
- proposal workflow 直接提交生成 job 或正式写入。

## 3. 每一种工作需求的工作流程

本层只定义“用户要做什么时，应该进入哪个 workflow”。具体 schema 形状来自 draft schema，具体可执行能力来自 tool 定义。

### 工作需求选择规则

按业务意图选择最窄 workflow：

- 项目级设定、creative references、asset slots、素材需求归属或复用合并：`project_proposal`
- production 级 segments、scene moments、引用使用状态、production-ready 缺口：`production_proposal`
- 同时维护 project 层基础和 production 层编排：`dual_orchestration`
- 宽泛变更先变成可审阅方案：`proposal_first`
- 场景、镜头节拍、旁白、字幕、转场、音乐节拍或内容单元结构：`content_unit_proposal`
- 关键帧、视频候选、媒体计划、content unit 的生成约束：`content_unit_media_proposal`
- 素材候选计划、asset slot 的 prompt、参考资源、模型能力需求、风险和验收标准：`asset_proposal`
- 准备可生成的素材候选方向但不提交任务：`asset_candidate_generation`
- 真正创建图片或视频生成任务：`visual_generation`
- 审阅分镜、关键帧或媒体规划缺口：`storyboard_gap_review`
- 总结项目进度、完成度、阻塞项和未关闭 drafts：`project_progress`
- 准备或改进一个已选 creative reference：`setting_prep`

如果用户请求跨多个层级，优先拆成多个 proposal 或使用 `dual_orchestration`，不要做一个混合职责的大 draft。

### Proposal 如何完成

### 通用完成标准

一个 proposal 完成，不是指模型说“完成”，而是满足以下条件：

1. Proposal kind 正确。
2. Draft schema 正确。
3. 内容只写本 proposal 的职责范围。
4. 已基于 focus 和必要窄上下文补齐关键锚点。
5. 本地 validation 通过，或错误被明确反馈。
6. 支持 preview apply 的 proposal 已运行 preview apply。
7. 最终回复包含 draftId / proposalRef / projectId / productionId 等稳定引用。

### Proposal 选择规则

按写入语义选择 proposal kind：

- 项目级设定、素材需求、重复合并：`project_proposal`
- 制作级情绪段、场景时刻、引用缺口：`production_proposal`
- 情景表达成内容单元、分镜节拍：`content_unit_proposal`
- 可复用素材候选生成计划：`asset_proposal`
- 内容单元关键帧或视频生成计划：`content_unit_media_proposal`
- 长剧本或 brief 切分成多个制作候选：`script_split_proposal`

如果用户请求跨多个层级，优先拆成多个 proposal，而不是做一个大 draft。

### Proposal 工作流

标准步骤：

1. 调用 `movscript_get_focus`。
2. 判断 proposal kind；不确定时询问用户。
3. 读取相关已有 draft，优先继续可复用草稿。
4. 只读取必要的项目脚本、实体、memory 或 generation job。
5. 创建或 patch proposal draft。
6. 校验 draft schema 和业务边界。
7. 如支持，执行 preview apply。
8. 汇报当前 draft 状态、阻塞项、下一步 review/apply 动作。

### Proposal 边界

`project_proposal` 只写：

- creative references
- asset slots
- merge candidates
- asset slot ownership

`production_proposal` 只写：

- segments
- scene moments
- creative reference usages / states
- unresolved reference / asset requirements

`content_unit_proposal` 只写：

- content units
- shot / narration / caption / transition / music beat 等表达单元
- 时长、画面意图、prompt intent

`asset_proposal` 只写：

- asset slot 的候选生成计划
- prompt
- input resource refs
- model capability needs
- risks
- acceptance criteria

`content_unit_media_proposal` 只写：

- content unit 的 keyframe / video candidate plans
- reference constraints
- model capability recommendations
- acceptance criteria

`script_split_proposal` 只写：

- 源内容摘要和范围
- production 候选
- create / update / skip 决策

### 完成后交接

最终回复必须留下可继续工作的锚点：

- draftId 或 proposalRef
- proposal kind
- projectId / productionId / contentUnitId / assetSlotId
- validation / preview apply 状态
- 用户已确认的决策
- 未解决问题
- 下一轮应该继续修改的对象

不要把 tool trace 原样倒给用户；只保留可执行的结论和稳定引用。
