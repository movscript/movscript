# Movscript 影视 Hardness Kernel

本文定义 Movscript 当前阶段需要先硬化的最小生产内核。它用于约束 Agent 调试、影视对象建模、草稿审阅、生成任务和交付验收的后续设计。

## 核心结论

AI 影视生产的完整概念体系还没有行业共识，Movscript 也不应该假设“场、镜头、分镜、制作项、内容单元、资产、生成任务”的边界已经一次性收敛。Agent 要操作的对象也不是代码文件，不能照搬 Codex 那套 `file -> diff -> test -> git` 的硬反馈链。

因此 Movscript 当前要做的不是先硬化整个 AI 影视 ontology，而是先建立一层 **Agent 可操作的 production kernel**。这层 kernel 要服务的影视生产主链路是：

```text
感觉 -> 描述 -> 确认 -> 产物 -> 确认
```

影视创作通常不是从结构化对象开始，而是从人的感觉、意图、审美判断和模糊目标开始。Movscript 的 hardness 不是消灭这种柔软性，而是让它经过两次确认后变成可生产、可追踪、可修改的产物。

> AI 影视世界可以继续演进和保持柔软，但 Agent 的写入、生成、审阅和应用动作必须穿过一层稳定对象、稳定动作、稳定收据和最低验收。

Movscript 的 Agent 调试目标不是解释模型为什么“这样想”，而是证明一次 Agent 动作是否正确穿过了这层 kernel；如果没有，定位它断在对象、约束、状态、血缘、后果、生成执行还是验收判断上。

## 问题陈述

Codex 之所以容易形成 hardness，是因为代码世界已经天然有很多硬对象和硬反馈：

```text
代码文件 -> 函数/类型/AST -> 测试 -> diff -> git -> CI
```

AI 影视生产现在更接近：

```text
感觉 -> 描述 -> 确认 -> prompt/参考/生成 -> 产物 -> 确认 -> 制作版本
```

这条链有两个根本问题：

- 影视概念本身还在变化。一个“场”可能是剧本场、拍摄场、内容段落、生成单元或审阅范围。
- Agent 的操作对象不是代码文件。它不能依赖文件 diff、类型检查和单元测试来获得天然反馈。

所以 Agent 不能直接把“压抑感”“电影感”“这一场”“节奏更快”这些软意图当成正式生产动作。它必须先把感觉转成描述，让用户或系统确认描述，再把确认后的描述转成产物，最后对产物再次确认。

## Production Kernel

Production kernel 是 Movscript 给 Agent 暴露的最小硬化层。它不要求影视 ontology 完整稳定，只要求 Agent 每次动作都能落到“感觉 -> 描述 -> 确认 -> 产物 -> 确认”的稳定接口。

## 主链路

### 1. 感觉

感觉是用户的原始创作意图，通常是模糊、审美化、上下文依赖的。

例子：

- “这一场要更压抑。”
- “女主这里要有一种快撑不住但还在忍的感觉。”
- “画面不要那么广告，要像偷拍到的真实瞬间。”
- “节奏再狠一点。”

最低要求：

- Agent 可以接收感觉，但不能把感觉直接当成正式写入。
- Debug 必须保留原始感觉文本和来源。

### 2. 描述

描述是系统把感觉转成可操作语言的第一层硬化。

描述可以是：

- 剧本修改描述。
- 镜头调度描述。
- 表演指导描述。
- prompt 描述。
- 参考图/风格说明。
- production unit 或 content unit 的改动说明。

最低要求：

- 描述必须绑定到目标范围，哪怕目标范围只是 proposal 级别。
- 描述应区分“用户原话”和“Agent 转译”。

### 3. 确认

第一次确认用于确认描述是否准确表达了感觉。

确认可以来自：

- 用户明确批准。
- review panel 中接受 proposal。
- 系统规则确认结构完整。
- Agent 请求澄清后得到用户补充。

最低要求：

- 未确认描述不能直接覆盖正式对象。
- 如果跳过人工确认，必须说明采用了哪条系统确认规则。

### 4. 产物

产物是确认后的描述进入生产系统后的结果。

产物可以是：

- draft/proposal。
- preview diff。
- prompt。
- generation job。
- candidate image/video/audio。
- applied backend record。
- delivery item。

最低要求：

- 产物必须有 lineage，能回到感觉、描述和确认。
- 产物必须能被审阅，而不是只返回“完成”。

### 5. 确认

第二次确认用于判断产物是否真的满足原始感觉和生产要求。

确认可以是：

- 用户采纳或驳回候选。
- apply receipt 被接受。
- acceptance checklist 通过。
- 返工意见进入下一轮“感觉 -> 描述”。

最低要求：

- 产物确认要同时看“是否符合感觉”和“是否能进入下一步生产”。
- 不通过时要记录下一轮修复方向。

## Kernel 实现接口

下面的接口是主链路在系统里的落点。

### 1. Entity Snapshot

Entity Snapshot 是 Agent 操作前看到的对象快照。

它回答：

- 当前对象是什么类型？
- 它的 ID、标题、状态、来源和更新时间是什么？
- 它和项目、剧本、生产项、资源、生成任务之间有什么关系？
- 这个快照来自 live backend、UI focus、本地 draft、run context、memory 还是 cache？

最低要求：

- Agent 不能直接写一个未绑定对象。
- 如果用户语言无法绑定到明确对象，只能创建 proposal 或请求用户补充信息。

### 2. Operation Intent

Operation Intent 是 Agent 准备执行的生产动作。

它回答：

- Agent 想读、写、生成、审阅、应用、取消还是等待？
- 目标对象和目标字段是什么？
- 依据的用户意图、项目约束和上下文来源是什么？
- 这个动作在当前状态下是否允许？

最低要求：

- write、generate、apply、destructive 动作必须有 intent。
- intent 中的目标对象如果来自模型推断，必须显式标记。

### 3. Draft / Proposal

Draft / Proposal 是软创作进入硬生产链路的缓冲层。

它回答：

- Agent 提议改什么？
- 为什么改？
- 改动面向哪个对象、字段或生产范围？
- 用户或系统能否预览差异后再应用？

最低要求：

- 在影视概念或目标绑定不稳定时，默认 proposal-first。
- Agent 不应跳过 review/apply gate 直接改正式数据。

### 4. Preview Diff

Preview Diff 是正式写入前的可检查差异。

它回答：

- 应用前是什么？
- 应用后会变成什么？
- 哪些字段、下游候选、生成任务或交付状态会受影响？
- 是否存在不可回滚风险？

最低要求：

- apply 前必须可预览。
- 如果无法生成 diff，必须把原因显示给用户和 debug view。

### 5. Apply Receipt

Apply Receipt 是动作后果的硬收据。

它回答：

- 实际写了哪个对象、哪个字段？
- backend 返回了什么？
- 是否创建了新资源、候选、生成任务或状态转换？
- 是否可回滚，或只能人工修复？

最低要求：

- Agent 不能只说“已应用”。必须有 receipt。
- destructive 或不可回滚动作必须在审批和调试中同时显式标记。

### 6. Lineage

Lineage 是产物血缘。

它回答：

- 这个 draft、proposal、generation job、candidate asset 来自哪个 run、thread、message、prompt、reference 和项目约束？
- 后续正式对象是否保留了这条来源？
- 现在读取的是 live 数据还是过期上下文？

最低要求：

- 每个 Agent 产物都必须能回到产生它的 run。
- 每个生成候选都必须能回到 prompt、reference 和目标对象。

### 7. Acceptance Checklist

Acceptance Checklist 是最低验收。

它回答：

- 结构是否完整？
- 目标绑定是否明确？
- 项目约束是否覆盖？
- 生成参数和资源引用是否可用？
- 产物是否能进入下一步生产？

最低要求：

- 不要求自动判断审美好坏。
- 先判断是否满足进入下一步生产的最低条件。

## Hardness 定义

在 Movscript 当前阶段，影视 hardness 指：

> 任何 Agent 动作都必须把感觉转成描述，经过确认后生成产物，再对产物确认；同时留下对象快照、动作意图、草稿或预览、应用收据、产物血缘和最低验收。影视概念可以继续演进，但 Agent 的生产后果必须可追踪、可审阅、可解释。

换句话说，系统先把这条链变硬：

```text
feeling -> description -> confirmation -> artifact -> confirmation
```

系统实现层再把它落到：

```text
entity snapshot -> operation intent -> draft/proposal -> preview diff -> apply receipt -> lineage -> acceptance
```

而不是试图一次性把完整 AI 影视制作方法论定死。

## 为什么调试要围绕 Kernel

通用 Agent 调试通常关注：

- 模型请求和响应。
- 工具调用输入和输出。
- trace 时间线。
- 错误、重试、审批和人工输入。

这些只能回答“Agent 做了什么”。Movscript 的影视生产调试还必须回答：

- Agent 当时把用户意图绑定到了哪个 kernel entity？
- 这个判断来自用户当前页面、项目事实、剧本、草稿、记忆，还是模型猜测？
- 它使用了哪些项目标准、角色设定、视觉规范、镜头语言和负面规则？
- 当前对象状态是否允许这个动作？
- 这个动作生成了 proposal、draft、job、asset、prompt 还是正式后端写入？
- 下游哪些对象、任务和交付件被影响？
- 如果结果不对，失败属于语义错位、约束遗漏、流程越权、血缘断裂、工具误用、生成失败还是验收标准缺失？

如果这些问题没有显式答案，Agent 调试会退化成日志考古。

## 七个诊断维度

以下七个维度不是完整影视 ontology，而是围绕 production kernel 的调试断点。它们用于判断 Agent 动作穿过 kernel 时哪一层变软了。

### 1. 影视语义硬度

影视语义硬度要求系统稳定绑定用户语言、UI 焦点和 kernel entity。

需要硬化的对象包括：

- 项目、剧集、分集、场、镜头、内容单元、分镜、制作项。
- 角色、关系、地点、时代、道具、服化、视觉资产。
- prompt、参考图、关键帧、生成任务、候选素材、交付物。
- proposal、draft、review、apply、backend record。

典型软点：

- 用户说“这一场”，Agent 不知道绑定的是剧本场、内容单元、分镜段落还是制作项。
- 用户说“把女主这段改得更压抑”，Agent 只改 prompt，没有识别角色、段落范围和视觉连续性。
- Agent 把后端正式脚本 ID 当成本地 Agent draft ID 使用。

调试应记录：

- `filmTarget` 或 `targetEntityType`、`targetEntityId`、`targetField`、`targetLabel`。
- `sourceOfBinding`: `ui_focus`、`explicit_user_ref`、`backend_lookup`、`draft_source`、`model_inference`。
- 绑定置信度和歧义项。
- 是否发生对象类型纠错或上游读取修复。

最低验收：

- 每个写动作、生成动作、审阅动作都必须能指出目标影视对象。
- 如果目标对象来自推断而不是显式选择，debug view 必须标记为推断。

### 2. 创作约束硬度

创作约束硬度要求 Agent 在创作和生成前显式加载、引用并遵守项目约束。

需要硬化的约束包括：

- 项目类型、题材、受众、平台规格、画幅和交付规则。
- 角色设定、人物关系、台词口吻、行为边界。
- 世界观、场景设定、时间线、连续性。
- 视觉风格、镜头语言、光色、构图、节奏。
- 禁用规则、负面 prompt、安全边界和品牌边界。

典型软点：

- Agent 产出看似合理，但没有使用项目标准。
- 生成图符合 prompt，却破坏角色连续性或场景调度。
- 项目标准里有 style reference resource ids，但生成工具调用没有传入。

调试应记录：

- `constraintSources`: project standards、script、character bible、style reference、user override、skill。
- 每个约束是否进入 prompt、工具参数或验收清单。
- 约束是否被截断、降级、覆盖或冲突。
- 约束缺失时的补救路径。

最低验收：

- 项目范围内的创作、prompt、生成和审阅动作都要有约束来源摘要。
- 如果没有项目标准，Agent 应明确记录“约束缺失”，而不是静默创作。

### 3. 流程状态硬度

流程状态硬度要求系统清楚表达每个 kernel entity 当前处于什么阶段，以及该阶段允许哪些动作。

需要硬化的状态包括：

- 草稿、待审、需修改、已批准、已应用。
- 生成中、生成失败、生成完成、候选待选、已采纳。
- 已锁定、已交付、需返工、已废弃。
- 子任务运行中、等待审批、等待用户输入、被取消。

典型软点：

- Agent 跳过 proposal review，直接写正式后端数据。
- 对已锁定或已交付内容继续生成新草稿。
- 审阅面板和 Agent run 状态不一致，用户不知道下一步该处理哪边。

调试应记录：

- `workflowStateBefore` 和 `workflowStateAfter`。
- `allowedActions` 和被拒绝动作。
- 审批、人工输入、apply gate 的阻塞原因。
- 状态转换的触发事件和责任方。

最低验收：

- 每个会改变状态的动作必须有状态前后对照。
- 被阻塞动作必须说明是权限、流程、数据缺失还是人工审批导致。

### 4. 产物血缘硬度

产物血缘硬度要求每个产物都能追溯来源、版本和下游影响。

需要硬化的血缘包括：

- 用户输入 -> prompt preview -> 模型请求 -> 模型响应。
- 剧本/项目标准/角色设定 -> proposal/draft。
- prompt/reference resources -> generation job -> candidate asset。
- candidate asset -> selected asset -> content unit/keyframe/delivery item。
- draft -> preview diff -> apply result -> backend record。

典型软点：

- 生成结果不对，但看不出使用了哪版 prompt 和哪些 reference。
- proposal 被应用后，无法追溯它来自哪个 run、哪个 thread、哪个用户意图。
- 后续 Agent run 读取了旧上下文，却没有暴露 stale 来源。

调试应记录：

- `lineageId`、`sourceRunId`、`sourceThreadId`、`sourceMessageId`。
- 输入 artifact、输出 artifact、版本号、更新时间。
- 引用的资源 ID、draft ID、job ID、candidate ID。
- 上下文是否来自 live backend、run context、local draft、memory 或 cache。

最低验收：

- 每个 draft、proposal、generation job 和 candidate asset 都必须能回到产生它的 run。
- 每个正式 apply 都必须能看到使用的 draft 和 preview diff。

### 5. 动作后果硬度

动作后果硬度要求工具调用不仅返回“成功”，还要说明真实改变了什么。

需要硬化的动作包括：

- 创建草稿、修改草稿、校验草稿、预览应用、正式应用。
- 创建生成任务、轮询生成任务、采纳候选素材。
- 写入项目设置、生产项、内容单元、资产槽位和交付状态。
- 取消任务、回滚或废弃产物。

典型软点：

- 工具返回 ok，但没有说明写了哪个对象、哪个字段。
- Agent 说“已应用”，用户无法确认后端是否真的变更。
- 动作不可回滚，但 trace 没有标记。

调试应记录：

- `commitReceipt`: changed entity、field、before、after、backend response、timestamp。
- `sideEffects`: invalidated previews、new jobs、updated candidates、downstream stale markers。
- `rollback`: available、unavailable、manual_only、reason。
- `idempotencyKey` 或重复提交检测结果。

最低验收：

- 每个 write/generate/destructive 工具都要返回动作收据。
- 无法回滚的动作必须在审批和 debug 中同时显式标记。

### 6. 生成执行硬度

生成执行硬度要求图像、视频和多模态生成不是黑盒请求，而是可诊断生产任务。

需要硬化的生成链路包括：

- 模型能力选择、功能路由、价格和参数。
- prompt、negative prompt、reference resource ids、比例、时长、分辨率。
- job 创建、轮询、失败、重试、候选返回。
- 生成结果与目标内容单元、关键帧、资产槽位的绑定。

典型软点：

- 生成失败只显示供应商错误，无法判断是参数、模型能力、资源引用还是配额问题。
- 生成成功但结果不符合影视对象，缺少可执行验收项。
- 同一个内容单元重复生成，无法比较不同 prompt 和 reference 的差异。

调试应记录：

- `generationIntent`: image、video、reference edit、style transfer、multi-angle。
- `resolvedModelCapability`、`route`、`provider`、`model`。
- `generationParams` 和被默认化/修正的参数。
- job lifecycle、candidate artifacts、失败分类。

最低验收：

- 每个 generation job 都要能展开完整意图、参数、约束、引用和结果候选。
- 失败必须落到可行动类别：配置、能力、参数、资源、供应商、超时、审核、未知。

### 7. 质量判定硬度

质量判定硬度要求影视结果有可执行验收标准，而不是只靠主观“好不好”。

需要硬化的验收包括：

- 对象完整性：字段、结构、schema、目标绑定完整。
- 连续性：角色、地点、时间、动作、道具、服化、视觉风格一致。
- 生产可用性：能否进入下一步制作、生成、审阅或交付。
- 规格符合：画幅、时长、分辨率、平台规则、资源引用。
- 创作符合：项目标准、角色口吻、镜头语言、负面规则。

典型软点：

- Agent 生成了一个漂亮方案，但无法进入生产。
- 审阅只有自然语言评价，没有结构化 pass/fail。
- 用户不满意时，系统不知道该改 prompt、改约束、改对象绑定还是重新生成。

调试应记录：

- `acceptanceChecklist`: item、status、evidence、nextAction。
- 自动校验、人工审阅、模型自评的来源区分。
- 失败项对应的修复动作。

最低验收：

- 影视 proposal、生成结果和正式 apply 前都应有验收清单。
- 验收失败必须能路由到具体修复动作，而不是只给泛化建议。

## Debug 断点分类

Agent Debug 应把异常归入以下断点，而不是只展示原始错误：

| 断点 | 判断问题 | 典型信号 |
| --- | --- | --- |
| 影视语义 | Agent 是否绑定到正确 kernel entity | target 缺失、对象类型推断、同名对象歧义 |
| 创作约束 | 是否加载并使用必要项目约束 | project standards 缺失、style reference 未传入、prompt 被截断 |
| 流程状态 | 当前阶段是否允许该动作 | requires_action、approval blocked、locked/delivered |
| 产物血缘 | 产物来源和版本是否可追溯 | draft/job/candidate 缺 sourceRunId，cache/stale |
| 动作后果 | 工具是否真实改变了预期对象 | 无 commit receipt、before/after 缺失、不可回滚未标记 |
| 生成执行 | 生成任务是否按影视意图执行 | 参数缺失、能力不匹配、job 失败、候选为空 |
| 质量判定 | 结果是否满足生产验收 | checklist failed、无 evidence、无法进入下一步 |

## 对 Agent 调试功能的直接要求

后续 Agent Debug 和 run details 应优先证明一次 Agent 动作是否经过“感觉 -> 描述 -> 确认 -> 产物 -> 确认”，而不是继续堆通用日志。第一批字段应围绕 kernel 定义：

- `feeling`: 用户原始感觉、意图或审美判断。
- `description`: Agent 或系统转译后的可操作描述。
- `descriptionConfirmation`: 描述确认来源、状态和证据。
- `artifact`: draft、prompt、job、candidate、backend record 或 delivery item。
- `artifactConfirmation`: 产物确认、采纳、驳回或返工结论。
- `entitySnapshot`: Agent 操作前看到的 kernel entity 快照。
- `operationIntent`: Agent 准备执行的读、写、生成、审阅、应用或取消动作。
- `draftProposal`: proposal-first 路径中的草稿、提案和目标绑定。
- `previewDiff`: 正式应用前的差异和影响范围。
- `applyReceipt`: 实际写入、状态转换和后端响应。
- `lineage`: 输入输出 artifact 的来源和版本。
- `acceptanceChecklist`: 最低验收项、证据和下一步。
- `debugBreakpoint`: 本次失败归类到哪个 hardness 断点。

在七个诊断维度上，还应逐步补齐：

- `filmTarget`: 用户软意图到 kernel entity 的绑定。
- `constraintCoverage`: 项目标准、角色、场景、风格、负面规则覆盖。
- `workflowStateTransition`: 状态前后和允许动作。
- `commitReceipt`: 写动作收据。
- `generationExecution`: 生成意图、参数、模型、job、候选。

这些字段可以先作为 derived debug view 输出。只有当字段在真实 run 中稳定有用，再逐步下沉为正式 trace schema。

## 收敛路线

### 第一阶段：定义并暴露 Kernel

- 将 run debug view 的主链路改成 `feeling -> description -> confirmation -> artifact -> confirmation`。
- 明确 Agent 可操作的 kernel entity：project、script、production、content unit、asset slot、resource、generation job、draft/proposal、review/apply result。
- 为 Agent 写入和生成动作补 `entitySnapshot`、`operationIntent`、`lineage`。
- 目标绑定不明确时默认 proposal-first 或 request input，不直接写正式数据。
- 在 run debug view 中先展示 kernel chain 是否完整。

### 第二阶段：让调试结论变硬

- 为每个 run 生成 `debugBreakpoint` 分类。
- 把现有 trace/readiness checklist 里的缺失项映射到七个诊断维度。
- 建立 10 到 20 个真实失败轨迹 fixture，验证分类是否稳定。
- 将“影视概念未收敛”的失败明确标记为 entity binding / ontology ambiguity，而不是伪装成工具或模型错误。

### 第三阶段：让动作后果变硬

- 所有 write/generate/destructive 工具返回统一 commit receipt。
- draft apply、generation job、candidate selection 都记录 before/after 和 lineage。
- 审批 UI 展示不可回滚、下游影响和重复提交风险。

### 第四阶段：让质量验收变硬

- 为 proposal、prompt、generation result、apply preview 定义最低 acceptance checklist。
- 区分自动校验、人工审阅和模型评估。
- 让验收失败能路由到具体修复工具或审阅页面。

### 第五阶段：让 replay 和 eval 变硬

- 保存可复现 debug bundle：entity snapshot、operation intent、prompt、工具输入输出、preview diff、apply receipt、lineage、acceptance。
- 支持 trajectory replay 或至少 deterministic diagnosis replay。
- 用 fixture gate 保障同一失败轨迹不会回归成模糊日志。

## 非目标

影视 hardness 不等于：

- 要求模型确定性。
- 用规则替代创作判断。
- 把审美完全自动化。
- 把尚未稳定的 AI 影视 ontology 一次性定死。
- 让流程变僵硬，禁止人工覆盖和人工重绑定。
- 把 Debug 页面做成所有功能的入口。

Hardness 的目标是让创作判断发生在清楚的 kernel 对象、约束和后果之上。模型可以有创造性，影视方法论可以演进，但生产后果不能含糊。

## 设计原则

- 先定义 production kernel，再设计调试面板。
- 先保留感觉，再转译描述；先确认描述，再生成产物；先确认产物，再进入正式制作版本。
- 先记录对象、动作、收据和血缘，再解释模型行为。
- 先用 proposal-first 承接软意图，再逐步应用到正式对象。
- 先让失败可分类，再追求自动修复。
- 先让单次 run 可诊断，再做跨 run 统计。
- 先用 derived debug view 验证字段，再固化 schema。
