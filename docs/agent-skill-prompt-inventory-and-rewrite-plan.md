# apps/agent/catalog 提示词逐文件改写清单

本文只盘点和规划 `apps/agent/catalog/skills` 下的提示词改造。

## 一、覆盖范围

当前范围包含：

- `apps/agent/catalog/skills/agent-core`
- `apps/agent/catalog/skills/drafts`
- `apps/agent/catalog/skills/movscript`

当前提示词文件类型：

- `instruction.md`
- `*.persona.md`
- `*.persona.json`
- `skill.policy.json`
- `skill.workflow.json`

其中真正需要重写正文的是 Markdown instruction/persona 文件；JSON manifest 只需要同步 name、description、outputContract、priority、trigger 等元信息。

## 二、统一改写标准

每个 Markdown prompt 都应按以下结构重写：

1. 目标
2. 适用场景
3. 输入锚点
4. 前置条件
5. 缺口回退
6. 执行步骤
7. 输出合同
8. 禁止事项

每个 JSON manifest 都应检查：

1. `description` 是否准确触发该 skill。
2. `outputContract` 是否和 instruction 一致。
3. workflow trigger 是否过宽或过窄。
4. workflow priority 是否符合总路由。
5. toolRefs 是否和 instruction 需要一致。

## 三、agent-core

### `apps/agent/catalog/skills/agent-core/policy/agent-core/instruction.md`

职责：

- agent 自身运行能力边界。

应强化：

- 当前 profile、active workflows、可见工具是能力边界。
- 工具 schema 是合法输入和稳定输出字段来源。
- 默认上下文很小，需要时通过窄工具读取。
- 缺上下文时先请求用户输入。
- catalog reload 不是安装或启用能力。
- planner subagent 只用于 planner run。
- 审批 pending 时不能声称已执行。

不应包含：

- MovScript 业务流程。
- draft kind 字段解释。
- 生成模型业务策略。

### `apps/agent/catalog/skills/agent-core/policy/agent-core/skill.policy.json`

检查：

- description 应强调这是运行能力层，不是业务层。
- priority 应高于普通 workflow。
- outputContract 应要求保留可续跑锚点和状态边界。

### `apps/agent/catalog/skills/agent-core/persona/default/default.persona.md`

职责：

- 默认人格和回复方式。

应强化：

- 使用用户语言。
- 区分事实、建议、假设。
- 对业务变更优先产出本地审阅草稿。
- 没有正式工具结果时不声称写入。

### `apps/agent/catalog/skills/agent-core/persona/default/movscript-default.persona.json`

检查：

- description 不应写成业务 workflow。
- outputContract 应保持“小而可续跑”。

### `apps/agent/catalog/skills/agent-core/workflow/planner-subagents/instruction.md`

职责：

- planner run 的并行任务分发规则。

应强化：

- 只在任务边界清晰、依赖明确、可以等待结果时使用 subagent。
- 不把当前立即阻塞的关键任务外包。
- worker 输出必须能回到主流程整合。

### `apps/agent/catalog/skills/agent-core/workflow/planner-subagents/skill.workflow.json`

检查：

- trigger 不应覆盖普通聊天。
- toolRefs 应只包含 planner/subagent 相关工具。

## 四、drafts

### `apps/agent/catalog/skills/drafts/policy/drafts/instruction.md`

职责：

- draft 生命周期和事实边界。

应强化：

- draft 是本地审阅 artifact。
- draft 不等于正式项目数据。
- 未 apply 时不能声称正式写入。
- 创建或修改 draft 后必须报告 `draftId`、`kind`、`status`、下一步 review/apply 动作。

### `apps/agent/catalog/skills/drafts/policy/drafts/skill.policy.json`

检查：

- description 应指向草稿安全边界。
- outputContract 应要求明确 local review state。

### `apps/agent/catalog/skills/drafts/workflow/draft-lifecycle/instruction.md`

职责：

- draft 创建、读取、更新、复用、状态汇报。

应强化：

- 优先复用现有相关 draft。
- 创建新 draft 前判断目标和 seed 是否明确。
- patch draft 时说明变更范围。
- 不写具体 MovScript 业务策略。

### `apps/agent/catalog/skills/drafts/workflow/draft-lifecycle/skill.workflow.json`

检查：

- trigger 应围绕 draft 生命周期，而不是所有业务请求。
- outputContract 应包含 draftId、status、review route 或下一步动作。

## 五、movscript policy 和 persona

### `apps/agent/catalog/skills/movscript/policy/instruction.md`

职责：

- MovScript 业务总控规则。

这是最重要的一条 prompt。它应承载：

- Project、Production、Content Unit、Asset Need、Draft、Generation Job 的层级解释。
- project 级制作标准、setting、asset、production、content-unit、generation 的职责边界。
- 缺上下文时的标准回退链。
- 事实来源和状态边界。

应加入的核心运行逻辑：

```text
缺项目制作标准 -> project-proposal
缺可复用设定 -> setting-proposal / setting-prep
缺素材需求或素材槽 -> asset-proposal
缺候选方向 -> asset-candidate-generation
需要真实生成 -> visual-generation
缺 production 结构 -> production-proposal
缺内容单元/情绪/钩子/媒体计划 -> content-unit-proposal / content-unit-media-proposal / storyboard-gap-review
```

### `apps/agent/catalog/skills/movscript/policy/skill.policy.json`

检查：

- priority 应保证它作为业务总控层稳定进入 prompt。
- description 应明确它是 MovScript 领域总规则。
- outputContract 应要求说明当前层级、状态和缺口。

### `apps/agent/catalog/skills/movscript/persona/project-orchestrator.persona.md`

职责：

- 项目设定层思考视角。

应强化：

- 区分项目制作标准、creative references、asset slots。
- 只保留项目级可复用名称、归属关系、合并候选。
- 不进入 production 编排。

### `apps/agent/catalog/skills/movscript/persona/production-orchestrator.persona.md`

职责：

- production 编排层思考视角。

应强化：

- production 结构、scene moment、content unit、media plan 分离。
- 只引用上游项目设定，不在 production 中新造项目级设定。
- 缺上游时回退。

### `apps/agent/catalog/skills/movscript/persona/visual-director.persona.md`

职责：

- 视觉候选和生成层思考视角。

应强化：

- 把视觉意图转成 prompt、参考、模型能力、比例、时长、验收标准。
- 生成结果只作为候选，直到用户接受或工具绑定结果证明状态改变。

### `apps/agent/catalog/skills/movscript/persona/movscript-personas.persona.json`

检查：

- 各 persona description 不应互相抢职责。
- outputContract 应分别对应项目层、production 层、视觉层。

## 六、project / setting workflows

### `apps/agent/catalog/skills/movscript/workflow/proposal/project/project-proposal/instruction.md`

职责：

- 项目级制作标准 proposal。

只管：

- 画幅
- 镜头大小体系
- 摄影语言
- 视觉风格
- 灯光色彩
- 节奏规则
- 负面约束

不管：

- creative references
- asset slots
- production segments
- content units
- generation jobs

### `apps/agent/catalog/skills/movscript/workflow/proposal/project/project-proposal/skill.workflow.json`

检查：

- trigger 应围绕项目制作标准。
- outputContract 应要求 draftId、projectId、preview/validation 状态。

### `apps/agent/catalog/skills/movscript/workflow/proposal/project/setting-proposal/instruction.md`

职责：

- 可复用设定 proposal。

只管：

- 人物
- 地点
- 道具
- 产品
- 世界规则
- 关系
- 风格参考
- creative reference 合并、修订、退休

不管：

- asset slot 需求
- production 编排
- 真实生成任务

### `apps/agent/catalog/skills/movscript/workflow/proposal/project/setting-proposal/skill.workflow.json`

检查：

- trigger 应覆盖 setting / creative reference 相关 intent。
- outputContract 应包含设定缺口和 review 状态。

### `apps/agent/catalog/skills/movscript/workflow/proposal/project/setting-prep/instruction.md`

职责：

- 轻量设定准备和缺口识别。

应强化：

- 判断当前 creative reference 是否足够 production-ready。
- 只列最小缺失事实。
- 若需要正式落地，交接到 setting-proposal。

### `apps/agent/catalog/skills/movscript/workflow/proposal/project/setting-prep/skill.workflow.json`

检查：

- trigger 不应覆盖所有 project proposal。
- outputContract 应强调 missing facts 和下一步 proposal。

## 七、asset workflows

### `apps/agent/catalog/skills/movscript/workflow/proposal/asset/asset-proposal/instruction.md`

职责：

- 素材需求和 asset slot proposal。

只管：

- 需要什么素材
- 归属和用途
- 复用边界
- 优先级
- 验收标准
- 候选计划

不管：

- 真实生成任务
- 已生成资源绑定
- project creative reference 定义

### `apps/agent/catalog/skills/movscript/workflow/proposal/asset/asset-proposal/skill.workflow.json`

检查：

- trigger 应区分素材需求、素材槽、候选计划。
- outputContract 应包含 assetSlotId 或 target、candidate count、risks、review status。

### `apps/agent/catalog/skills/movscript/workflow/proposal/asset/asset-candidate-generation/instruction.md`

职责：

- 为 asset slot 生成可审阅候选。

应强化：

- 先确认 asset slot 和上下文。
- 生成前说明候选依据。
- 生成后必须等待工具结果。
- 成功后报告 `jobId`、`status`、`output_resource_id`。

### `apps/agent/catalog/skills/movscript/workflow/proposal/asset/asset-candidate-generation/skill.workflow.json`

检查：

- trigger 应覆盖“生成素材候选”而非普通素材方案。
- toolRefs 应包含生成 job 和 attach candidate 所需工具。

## 八、production workflow

### `apps/agent/catalog/skills/movscript/workflow/proposal/production/production-proposal/instruction.md`

职责：

- 单个 production 的执行结构 proposal。

只管：

- segments
- scene moments
- content-unit organization hints
- project references 的使用
- production-local unresolved requirements

不管：

- 新建 project 级设定
- 新建 asset slot
- 真实媒体生成

缺上游时：

- 缺 setting -> setting-proposal
- 缺 asset slot -> asset-proposal
- 缺项目制作标准 -> project-proposal

### `apps/agent/catalog/skills/movscript/workflow/proposal/production/production-proposal/skill.workflow.json`

检查：

- trigger 应聚焦 production proposal / production orchestration。
- outputContract 应包含 draftId、projectId、productionId、preview 状态、segments 和 scene moments 数量。

## 九、content-unit workflows

### `apps/agent/catalog/skills/movscript/workflow/proposal/content-unit/content-unit-proposal/instruction.md`

职责：

- 内容单元结构 proposal。

只管：

- 镜头
- 旁白
- 字幕
- 转场
- 音乐节拍
- 画面意图
- prompt intent
- 情绪推进
- 钩子

不管：

- project 级设定定义
- asset slot 定义
- 真实生成任务

### `apps/agent/catalog/skills/movscript/workflow/proposal/content-unit/content-unit-proposal/skill.workflow.json`

检查：

- outputContract 应包含 content unit count、productionId、结构缺口。

### `apps/agent/catalog/skills/movscript/workflow/proposal/content-unit/content-unit-media-proposal/instruction.md`

职责：

- 内容单元媒体计划 proposal。

只管：

- keyframe 需求
- 媒体类型
- reference usage
- prompt intent
- 模型需求
- open decisions

不管：

- 直接生成媒体。

### `apps/agent/catalog/skills/movscript/workflow/proposal/content-unit/content-unit-media-proposal/skill.workflow.json`

检查：

- trigger 应覆盖媒体计划、关键帧、content-unit media。
- outputContract 应包含 target content units、planned media/keyframe count、open decisions。

### `apps/agent/catalog/skills/movscript/workflow/proposal/content-unit/storyboard-gap-review/instruction.md`

职责：

- 分镜、关键帧、媒体规划缺口审阅。

应强化：

- 只列事实缺口。
- 按 scene/content unit/media target 分组。
- 不直接替用户生成缺失内容。
- 给出下一步 proposal 或 generation 动作。

### `apps/agent/catalog/skills/movscript/workflow/proposal/content-unit/storyboard-gap-review/skill.workflow.json`

检查：

- trigger 应围绕 gap review。
- outputContract 应要求 grouped gaps 和 next step。

## 十、generation workflow

### `apps/agent/catalog/skills/movscript/workflow/generation/visual-generation/instruction.md`

职责：

- 创建和监控图片/视频生成任务。

应强化：

- 收集 prompt、references、aspect ratio、duration、output type、model capability。
- 模型能力不确定时先查模型。
- 创建 job 必须走生成工具。
- 只有工具结果包含输出资源或媒体时，才报告媒体存在。

### `apps/agent/catalog/skills/movscript/workflow/generation/visual-generation/skill.workflow.json`

检查：

- trigger 应覆盖 image/video generation。
- toolRefs 应只包含模型查询、生成 job、job 监控、取消等生成相关工具。
- outputContract 应包含 final status、jobId、output resource、fit rationale。

## 十一、planning / workspace workflows

### `apps/agent/catalog/skills/movscript/workflow/planning/proposal-first/instruction.md`

职责：

- 宽泛请求的 proposal 路由。

应强化：

- 先判断缺口属于 project、setting、asset、production、content-unit、generation 哪一层。
- 只选择下一步 proposal，不抢具体业务工作。
- 如果目标不明确，问窄问题。

### `apps/agent/catalog/skills/movscript/workflow/planning/proposal-first/skill.workflow.json`

检查：

- trigger 应围绕 broad proposal/draft routing。
- outputContract 应返回推荐 draft kind 和下一步 review action。

### `apps/agent/catalog/skills/movscript/workflow/workspace/project-progress/instruction.md`

职责：

- 项目进度、阻塞、未关闭 draft 总结。

应强化：

- 只总结已验证事实。
- 区分正式状态、本地 draft、建议、未知项。
- 给出下一步，不替用户做缺失决策。

### `apps/agent/catalog/skills/movscript/workflow/workspace/project-progress/skill.workflow.json`

检查：

- trigger 应围绕 status/progress。
- outputContract 应包含 verified progress、open drafts、blockers、recommended next step。

## 十二、最终替换顺序

建议按以下顺序手动替换：

1. `apps/agent/catalog/skills/agent-core/policy/agent-core/instruction.md`
2. `apps/agent/catalog/skills/drafts/policy/drafts/instruction.md`
3. `apps/agent/catalog/skills/movscript/policy/instruction.md`
4. `apps/agent/catalog/skills/agent-core/persona/default/default.persona.md`
5. `apps/agent/catalog/skills/movscript/persona/*.persona.md`
6. project / setting workflows
7. asset workflows
8. production workflow
9. content-unit workflows
10. visual-generation workflow
11. proposal-first / project-progress workflows
12. draft-lifecycle / planner-subagents workflows
13. 对应 JSON manifest 的 description、outputContract、trigger、toolRefs

## 十三、验收清单

每个 instruction 改完后确认：

1. 只服务一个任务。
2. 开头能说明当前层级。
3. 有明确缺口回退。
4. 有清楚输出合同。
5. 不把 draft 说成正式数据。
6. 不把 generation job 说成媒体结果。
7. 不在没有工具结果时声称 apply、生成、绑定、接受已经完成。

整套改完后确认：

- `movscript/policy/instruction.md` 能解释完整运行逻辑。
- 每个 workflow 都知道自己的上游缺口该交给谁。
- persona 只给思考视角，不写操作流程。
- draft、proposal、candidate、generation job、formal write 的状态边界一致。
