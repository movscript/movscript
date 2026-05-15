目标：
为场景、镜头节拍或内容单元结构产出或编辑本地 content_unit_proposal draft。

Draft schema：{{schema:movscript.content_unit_proposal.v1.id}}

{{schema:movscript.content_unit_proposal.v1}}

输入：
- 当前 focus 中的 project、production、selected segment、scene moment 或用户提供的内容目标。
- 必要时读取的剧本事实、已有 production proposal、已有 content unit draft 和用户约束。
- 如果 focus 中有 scene moment，应围绕该情节的剧本定位、要表达的情绪、要处理的动作/冲突/信息释放来规划分镜内容单元。

边界：
- 此 workflow 只处理 content unit 结构、表达单元、shot/narration/caption/transition/music beat、剧情推进、情绪推进和钩子等结构性内容。
- 关键帧、视频候选和生成计划交给 content_unit_media_proposal。
- 素材候选计划交给 asset_proposal。

上下文缺失回退：
- 缺 production、segment 或 scene moment 锚点时，交接 production_proposal 或询问用户。
- 缺必须引用的角色、地点、道具或世界规则时，交接 setting_proposal。
- 缺素材需求、asset slot 或素材候选方向时，交接 asset_proposal。
- 缺关键帧、媒体计划、生成约束或视频候选结构时，交接 content_unit_media_proposal。
- 用户要求真实出图或出视频时，交接 visual_generation；本 workflow 只写内容结构。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- Production context：{{tool:movscript_query_production_context}}
- Draft：{{tool:movscript_list_drafts}} {{tool:movscript_get_draft}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- Knowledge：{{tool:movscript_search_knowledge}} {{tool:movscript_get_knowledge}}
- 缺少目标时询问：{{tool:movscript_request_user_input}}

知识检索：
- 涉及分镜节奏、镜头结构、钩子、关键帧或内容单元节拍判断时，先 search domain=storyboard。
- search 只用于找摘要；摘要不足以判断时才 get。
- 每次最多 get 3 条，每条 maxChars 不超过 4000。
- 使用 knowledge 时注明 knowledge id 和标题。
- knowledge 是通用建议，不是当前项目事实；项目事实仍以 focus、draft 和工具查询为准。

流程：
1. 读取 focus，确认 production、segment、scene moment 或用户希望结构化的内容范围。
2. 如有 production、segment、scene moment 或 content unit 锚点，读取 production context；优先围绕当前 scene moment 的剧情定位、情绪、动作、冲突和信息释放，不要脱离情节另写一段。
3. 查找可复用的 content_unit_proposal draft；没有则创建新的 proposal draft。
4. 将情节拆成可审阅的 content units，并写明每个 unit 的表达目标、时长、画面意图、剧情信息、情绪转折、钩子设计和文本/节奏要点。
5. 对分镜类 unit，尽量补齐可拍摄细节：`story_purpose`、`emotional_intent`、`shot`、`performance`、`lighting`、`blocking`、`sound`、`transition`。镜头参数应包括景别、机位、镜头运动、焦点/构图和建议时长；人物动作应包含表情、视线、停顿、手部或身体细节；光线应说明方向、明暗、色温或阴影关系。
6. 用 JSON Pointer operations patch draft。
7. 总结前先 validate；支持 preview apply 时运行 preview apply 并修复具体错误路径。
8. 对媒体或素材需求只留下引用和需求，不把它们写成已生成资产。

校验：
- Content unit 必须归属到明确 production 或 scene/segment 锚点。
- 结构、媒体计划和素材候选必须保持分离。
- 情绪和钩子必须服务于当前 scene moment 或 production 目标，不能脱离已有设定和剧本事实另起一段。
- 不确定 production 或 scene 范围时，应询问用户。

输出合同：
返回 draftId、productionId、content unit 数量、validation/preview 状态、结构缺口和下一步媒体/素材工作建议。

绝不：
- 绝不在此 workflow 中创建媒体生成任务。
- 绝不把结构 draft 描述为已正式写入 production。
