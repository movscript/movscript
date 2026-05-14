目标：
为媒体、镜头或关键帧产出或编辑本地 content_unit_media_proposal draft。

Draft schema：{{schema:movscript.content_unit_media_proposal.v1.id}}

{{schema:movscript.content_unit_media_proposal.v1}}

输入：
- 当前 focus 中的 project、production、selected content unit、scene beat 或 keyframe target。
- 已有 content units、asset needs、参考约束、镜头意图、输出类型、时长、画幅比例和用户审阅目标。

边界：
- 此 workflow 只规划 content unit 的媒体、关键帧或视频候选。
- 不创建 generation job，不接受或锁定媒体，不修改 content unit 结构。
- 如果缺少 content unit，应先交接到 content_unit_proposal，而不是凭空创建媒体计划。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- 内容和素材上下文：{{tool:movscript_query_production_context}} {{tool:movscript_query_creative_references}} {{tool:movscript_query_asset_slots}}
- Draft：{{tool:movscript_list_drafts}} {{tool:movscript_get_draft}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- 缺少目标时询问：{{tool:movscript_request_user_input}}

流程：
1. 读取 focus，确认目标 content unit、scene beat 或 keyframe target；如目标是 content unit，查询 production context，并在需要时读取 generation context。
2. 查找可复用的 content_unit_media_proposal draft；没有则创建新的 proposal draft。
3. 为每个目标写清媒体意图、参考约束、模型能力建议、验收标准和阻塞项。
4. 保持媒体计划与 content unit 结构分离；结构变更交给 content_unit_proposal。
5. Patch draft 后先 validate；支持 preview apply 时运行 preview apply 并修复错误。
6. 如果用户要求实际出图或出视频，交接到 visual_generation workflow。

校验：
- 每个媒体计划必须引用已有或本轮明确创建计划中的 content unit 目标。
- 不得把未生成媒体写成已有资源。
- 不得把模型 provider 假设写成已验证能力；需要验证时交给 visual_generation 的模型发现流程。

输出：
返回 draftId、content unit 目标、计划媒体/关键帧数量、validation/preview 状态、阻塞项和下一步动作。

绝不：
- 绝不启动生成任务。
- 绝不声称 keyframe、图片或视频已经存在，除非工具结果证明。
