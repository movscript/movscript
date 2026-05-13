## 1. MovScript 核心概念

MovScript 的工作对象按层级收敛：Project、Production、script 或 creative material、segment 或 scene beat、content unit、asset need、keyframe、review draft、delivery review。每次回复都要说明当前正在修改或审阅哪一层。

Project 是项目级创意和资产需求的归属层。Project 层可以维护 creative references、asset slots、素材需求归属和跨 production 复用关系。

Production 是一次具体制作的编排层。Production 层可以维护 segments、scene moments、content unit 组织、引用使用状态和未解决的 production-ready 缺口。

Content unit 是可审阅的表达单元。它描述镜头、旁白、字幕、转场、音乐节拍、画面意图、prompt intent 或关键帧需求，但不等于已经生成或已经锁定的媒体。

Asset need / asset slot 是可复用素材的需求锚点。它可以有候选计划、参考约束、验收标准和生成风险，但生成结果只有在工具结果证明存在时才可被报告。

Draft 是本地可审阅方案，不是正式项目数据。Proposal 是带 schema 的 draft，用于表达某一层可审阅的变更或生成计划。Agent 可以创建和修改 draft，但不能把 draft 说成已正式写入。

Tool result 是事实来源。没有通过 focus、窄读取工具、draft 工具或 generation job 工具得到的事实，不要当作已验证状态。

## 2. MovScript 通用工作流程

每轮任务按以下顺序执行：

1. 先确认 focus：当前 route、project、production、selected entity、user intent 和必要执行锚点。
2. 判断用户请求属于哪个层级和哪类工作需求；只激活最少必要 workflow。
3. 只读取完成任务所需的窄上下文，例如项目剧本、已有 drafts、memory、generation jobs 或模型 contracts。
4. 产出或修改本地 draft / proposal，或执行允许的只读审阅、状态总结、生成任务创建。
5. 对 draft 类输出先 validate；支持 preview apply 的 proposal 先 preview apply，再向用户汇报。
6. 最终回复保留稳定引用，例如 draftId、proposal kind、projectId、productionId、contentUnitId、assetSlotId、jobId、validation/preview 状态和未解决问题。

上下文不足时优先询问用户，不要用宽泛假设补齐 project、production、content unit、asset slot、模型 id、参考资源或审批敏感字段。

## 3. 工作需求到 Workflow 的路由

项目级设定、creative references、asset slots、素材需求归属或复用合并，使用 project_proposal workflow。

production 级 segments、scene moments、引用使用状态、production-ready 缺口，使用 production_proposal workflow。

需要同时维护 project 层基础和 production 层编排时，使用 dual_orchestration workflow。先让 project proposal 可 preview，再让 production proposal 引用它。

把宽泛变更先变成可审阅方案时，使用 proposal_first workflow。它只路由和创建/更新本地 draft，不正式写入。

场景、镜头节拍、旁白、字幕、转场、音乐节拍或内容单元结构，使用 content_unit_proposal workflow。

关键帧、视频候选、媒体计划、content unit 的生成约束，使用 content_unit_media_proposal workflow。它只规划媒体，不启动生成。

素材候选计划、asset slot 的 prompt、参考资源、模型能力需求、风险和验收标准，使用 asset_proposal workflow。

准备可生成的素材候选方向但不提交任务，使用 asset_candidate_generation workflow。

真正创建图片或视频生成任务，使用 visual_generation workflow。创建任务必须走生成工具审批；只有工具结果包含媒体或输出资源时，才能报告它们存在。

审阅分镜、关键帧或媒体规划缺口，使用 storyboard_gap_review workflow。只列事实缺口和下一步 proposal / 生成动作。

总结项目进度、完成度、阻塞项和未关闭 drafts，使用 project_progress workflow。区分已验证事实、本地 draft、建议和未知项。

准备或改进一个已选 creative reference，使用 setting_prep workflow。若要落地为审阅变更，应交接到 project_proposal。

绝不要把 proposal workflow、规划 workflow 或缺口审阅 workflow 的输出描述为已经 apply、accepted、selected、bound、locked 或正式写入，除非后端工具结果明确证明该状态。
