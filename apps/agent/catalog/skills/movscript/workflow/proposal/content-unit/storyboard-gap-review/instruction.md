目标：
审阅已选内容的分镜、关键帧或媒体规划缺口，并给出下一步 proposal 或生成动作。

输入：
- 当前 focus 中的 project、production、selected content unit、scene beat、keyframe 或媒体目标。
- 当前会话相关 content_unit_proposal、asset_proposal drafts。

边界：
- 此 workflow 只做缺口审阅，不创建或修改 draft。
- 不编造缺失媒体，不把计划中的 keyframe 当成已生成结果。
- 缺口必须指向具体 content unit、scene beat、asset slot 或 keyframe target。

上下文缺失回退：
- 发现 project 级标准缺失时，建议 project_proposal。
- 发现角色、地点、道具、世界规则或 creative reference 缺失时，建议 setting_proposal。
- 发现素材需求、asset slot、候选计划或验收标准缺失时，建议 asset_proposal。
- 发现 production 结构、scene moment 或 content unit 缺失时，建议 production_proposal 或 content_unit_proposal。
- 发现关键帧、媒体计划或生成参数缺失时，建议 visual_generation；若缺内容单元结构，先建议 content_unit_proposal。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- Draft：{{tool:movscript_get_draft}}
- Knowledge：{{tool:movscript_search_knowledge}} {{tool:movscript_get_knowledge}}
- 缺少目标时询问：{{tool:movscript_request_user_input}}

知识检索：
- 涉及分镜节奏、镜头景别、钩子或关键帧缺口判断时，先 search domain=storyboard。
- search 只返回摘要；只有摘要不足以判断缺口时才 get。
- 每次最多 get 3 条，每条 maxChars 不超过 4000。
- 使用 knowledge 时注明 knowledge id 和标题。
- knowledge 是通用建议，不是当前项目事实；缺口来源仍必须指向 focus、draft、工具结果或用户输入。

流程：
1. 读取 focus，确认审阅范围。
2. 若当前会话提供相关 draftId，读取这些 drafts，分辨结构 proposal 和素材 proposal；没有 draftId 时只基于 focus 和已验证工具结果审阅。
3. 按 content unit 或 scene beat 分组列出缺口：结构缺口、参考缺口、关键帧缺口、素材缺口、生成参数缺口、验收标准缺口。
4. 为每个缺口指定下一步 workflow，例如 content_unit_proposal、asset_proposal 或 visual_generation。
5. 如果缺口来自未验证信息，标记为未知而不是事实。

校验：
- 每个缺口必须有来源：focus、draft、工具结果或用户明确输入。
- 不应输出泛泛建议；每项都要能交给后续 workflow 处理。

输出合同：
按目标分组返回缺口、来源、严重度、建议 workflow 和需要用户确认的问题。

绝不：
- 绝不创建生成任务或修改 draft。
- 绝不声称缺失媒体已经存在。
