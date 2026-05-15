# apps/agent/catalog 提示词改造总规范

本文只覆盖当前 `apps/agent/catalog` 里的提示词。后续手动替换时，应只参考 `apps/agent/catalog/skills/**` 下的 persona、policy、workflow instruction 和对应 manifest。

## 一、改造目标

当前 agent catalog 已经表达了 MovScript 的主要能力，但提示词之间的职责边界还需要更清晰。改造目标是：

1. 让 agent 知道自己当前处在哪一层。
2. 让 agent 知道缺上下文时该回退到哪一个上游 prompt 对应的工作流。
3. 让 proposal、draft、generation、apply、review 的边界稳定。
4. 让每个 instruction 都只承担一个明确职责。

核心原则：

> 总控逻辑放在 policy，身份倾向放在 persona，具体操作顺序放在 workflow instruction。

## 二、agent catalog 当前提示词范围

本文覆盖这些目录：

- `apps/agent/catalog/skills/agent-core`
- `apps/agent/catalog/skills/drafts`
- `apps/agent/catalog/skills/movscript`

## 三、总运行逻辑

所有 MovScript 业务请求都按以下顺序理解：

```text
识别用户目标
  -> 识别当前层级
    -> 读取最小必要上下文
      -> 判断是否缺上游信息
        -> 缺项目制作标准，回到 project-proposal
        -> 缺可复用设定，回到 setting-proposal 或 setting-prep
        -> 缺素材需求或素材槽，回到 asset-proposal
        -> 缺候选图/视频方向，回到 asset-candidate-generation
        -> 需要真实图片/视频生成，进入 visual-generation
        -> 缺剧情结构、情绪、钩子、内容单元，回到 content-unit-proposal 或 storyboard-gap-review
        -> 目标不明确，问一个窄问题
```

任何 workflow 发现上游缺失时，都应先交接到正确的上游 proposal 或补齐工作流，不要在当前 workflow 里硬编。

## 四、提示词分层

### 1. agent-core

`agent-core` 是运行能力认知层。

它应该说明：

- 当前 profile、active workflows、可见工具是能力边界。
- 工具 schema 和工具结果是事实来源。
- 默认上下文很小，需要时用窄工具读取。
- 缺上下文时先请求用户输入，不要编造。
- subagent 只用于 planner run 中的清晰并行任务。
- 审批 pending 时不能说动作已经完成。

它不应该承载 MovScript 业务流程。

### 2. drafts

`drafts` 是草稿边界层。

它应该说明：

- draft 是本地审阅 artifact。
- draft 不等于正式后端数据。
- 未 apply 时不能声称项目已改。
- 创建或修改 draft 后必须报告 `draftId`、`kind`、`status`、下一步 review/apply 动作。

它不应该描述具体业务字段含义。

### 3. movscript policy

`movscript/policy/instruction.md` 应成为 MovScript 业务总控层。

它应该说明：

- Project、Production、Content Unit、Asset Need、Draft、Generation Job 的层级关系。
- project 级制作标准、设定资料、素材需求、production 编排的边界。
- 缺上下文时的固定回退链。
- 工具结果、draft 状态、生成结果、apply 结果的事实边界。

这条 policy 是最适合承载“运行逻辑”的位置。

### 4. movscript personas

persona 只定义思考视角，不写流程。

- `project-orchestrator.persona.md`：站在项目设定层思考。
- `production-orchestrator.persona.md`：站在 production 编排层思考。
- `visual-director.persona.md`：站在视觉生成和候选评估层思考。

persona 不应该重复 workflow 细节，也不应该替代 policy。

### 5. movscript workflows

workflow instruction 只写单个任务的操作顺序。

每个 workflow 都应包含：

1. 目标
2. 输入锚点
3. 前置条件
4. 缺口判断
5. 回退路径
6. 执行步骤
7. 输出合同
8. 禁止事项

## 五、标准回退链

### 缺项目级标准

回到：

- `movscript/workflow/proposal/project/project-proposal/instruction.md`

适用缺口：

- 画幅
- 镜头大小体系
- 摄影语言
- 视觉风格
- 灯光色彩
- 节奏规则
- 负面约束

### 缺可复用设定

回到：

- `movscript/workflow/proposal/project/setting-proposal/instruction.md`
- `movscript/workflow/proposal/project/setting-prep/instruction.md`

适用缺口：

- 人物
- 地点
- 道具
- 产品
- 世界规则
- 关系
- 风格参考
- creative reference 合并或修订

### 缺素材需求或素材槽

回到：

- `movscript/workflow/proposal/asset/asset-proposal/instruction.md`

适用缺口：

- asset slot 是否存在
- 素材归属
- 素材用途
- 复用边界
- 验收标准
- 候选方向

### 缺候选图/视频方向

回到：

- `movscript/workflow/proposal/asset/asset-candidate-generation/instruction.md`

适用缺口：

- prompt 方向
- 参考资源
- 模型能力
- 风险
- 候选评估标准

### 需要真实生成

进入：

- `movscript/workflow/generation/visual-generation/instruction.md`

规则：

- 生成任务必须依赖工具。
- 没有工具结果就不能说生成成功。
- 没有输出资源就不能说媒体已存在。

### 缺 production 编排

回到：

- `movscript/workflow/proposal/production/production-proposal/instruction.md`

适用缺口：

- segment
- scene moment
- production-local unresolved requirement
- production 对 project 级引用的使用方式

### 缺内容单元、情绪、钩子或媒体计划

回到：

- `movscript/workflow/proposal/content-unit/content-unit-proposal/instruction.md`
- `movscript/workflow/proposal/content-unit/content-unit-media-proposal/instruction.md`
- `movscript/workflow/proposal/content-unit/storyboard-gap-review/instruction.md`

适用缺口：

- 镜头节拍
- 旁白
- 字幕
- 情绪推进
- 钩子
- 关键帧
- 媒体规划缺口

## 六、输出口径

所有 agent catalog prompt 都应统一以下口径：

- draft 是本地审阅草稿。
- proposal 是结构化 draft。
- candidate 是候选，不是已接受结果。
- generation job 是任务，不是媒体结果。
- apply 必须有工具结果证明。
- 生成成功必须有输出资源或媒体结果证明。
- 缺上下文时先补齐上游，不要伪造下游完成。

## 七、推荐改造顺序

1. `agent-core/policy/agent-core/instruction.md`
2. `drafts/policy/drafts/instruction.md`
3. `movscript/policy/instruction.md`
4. `movscript/persona/*.persona.md`
5. `movscript/workflow/proposal/project/*/instruction.md`
6. `movscript/workflow/proposal/asset/*/instruction.md`
7. `movscript/workflow/proposal/production/*/instruction.md`
8. `movscript/workflow/proposal/content-unit/*/instruction.md`
9. `movscript/workflow/generation/visual-generation/instruction.md`
10. `movscript/workflow/workspace/project-progress/instruction.md`
11. `drafts/workflow/draft-lifecycle/instruction.md`
12. `agent-core/workflow/planner-subagents/instruction.md`

## 八、验收标准

每条 prompt 改完后检查：

1. 是否只负责一个职责。
2. 是否明确当前层级。
3. 是否说明缺上下文时该回退到哪里。
4. 是否明确何时问用户。
5. 是否区分 draft、proposal、candidate、generation job、formal write。
6. 是否禁止无工具结果时声称完成。

整套 agent catalog 改完后检查：

- `movscript/policy/instruction.md` 能解释总运行逻辑。
- persona 不重复 workflow。
- workflow 不重复总 policy。
- project / setting / asset / production / content-unit / generation 边界清晰。
- 所有下游 workflow 都知道上游缺失时该交接到哪里。
