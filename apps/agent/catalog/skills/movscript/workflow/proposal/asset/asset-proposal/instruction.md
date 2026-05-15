目标：
在任何生成任务之前，产出或编辑统一的本地 asset_proposal draft。这个 draft 是唯一的素材提案 kind，覆盖两类内容：
1. project 层 asset slots 需求清单。
2. 已选 asset slot 的候选制作方案。

Draft schema：{{schema:movscript.asset_proposal.v1.id}}

{{schema:movscript.asset_proposal.v1}}

输入：
- 当前 focus 中的 project、production、selected asset slot 或 asset need。
- 用户给出的素材目标、输出类型、prompt 方向、参考资源、风格限制、模型能力需求、角色/场景定位和验收标准。

边界：
- 此 workflow 只写 `asset_proposal` draft；素材需求和素材候选方案都不要拆到其他素材 draft kind。
- 如果用户在梳理“需要哪些素材位 / 素材需求清单”，写 `proposal.asset_slots`，不写候选 prompt。
- 如果用户在问“这个素材需求怎么做候选方案”，必须绑定一个已存在或明确选择的 asset slot，写 `proposal.candidate_plans`，并保持 `proposal.asset_slots` 为空数组。
- 不创建图片或视频生成任务。
- 如果用户明确要求“生成图片候选 / 生成视频候选 / 出图 / 出视频”，不要停留在此 workflow；应交接到 asset_candidate_generation 或 visual_generation。
- Draft 内容必须落在 asset proposal schema 内，不写 content unit 结构或 production segments。
- 不创建或修改 project 层 creative reference；设定资料使用 setting_proposal。
- 不把候选计划说成已生成、已选中、已绑定或已锁定的素材。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- 设定/素材查询：{{tool:movscript_query_creative_references}} {{tool:movscript_query_asset_slots}} {{tool:movscript_query_production_context}}
- Draft：{{tool:movscript_list_drafts}} {{tool:movscript_get_draft}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- 缺少目标时询问：{{tool:movscript_request_user_input}}

流程：
1. 读取 focus，确认用户是在整理素材需求清单，还是在为已选素材需求规划候选。
2. 若是素材需求清单：查询 creative references 和现有 asset slots，查找或创建 asset_proposal draft，patch `proposal.asset_slots`；`proposal.creative_references` 和 `proposal.candidate_plans` 保持空数组。
3. 若是候选方案：确认 asset slot 或 asset need。若没有 assetSlotId 且不能通过查询唯一定位，先询问用户；若素材需求尚不存在，先在同一个 asset_proposal draft 的 `proposal.asset_slots` 创建锚点，不要创建别的 kind。
4. 在规划候选前，使用查询工具检查当前设定材料和素材锚点：creative references、asset slots、asset slot ownership、production context、已知 reference resources 或已有候选资源。已有角色或场景素材应作为一致性约束，而不是被新 prompt 覆盖。
5. 将候选拆成 prompt、参考资源、输出类型、模型能力需求、风险和 acceptance criteria。
6. 对角色和场景写清一致性要求：延续已存在的人物外貌、服装识别点、年代/地域/空间设定、光线气质和可复用范围；缺少参考时标记为待补齐。
7. 处理剧情描述与视觉定位冲突时，以全局角色定位为准。主角、核心反派、重要常驻角色即使剧情里被说“丑”“狼狈”“不起眼”，也不要生成真实低质或不可用的丑化形象；应转译为朴素、疲惫、被环境压低、妆发状态差、衣着不合身等可表演且仍可长期复用的视觉特征，除非用户明确要求丑化。
8. 用 JSON Pointer operations patch draft content。
9. 先 validate；如果支持 preview apply，运行 preview apply 并修复具体错误路径。
10. 如果用户要求立即生成，交接到 visual_generation workflow，不在此 workflow 中调用生成工具。

校验：
- `proposal.asset_slots` 用于素材需求变更；`proposal.candidate_plans` 用于候选制作方案。不要把两者混成一个字段。
- 每个候选必须有清晰 asset target，并绑定 assetSlotId。
- 引用资源必须来自 focus、已读 draft、用户输入或工具结果。
- 角色/场景候选必须说明与已有设定材料或素材资源的关系：复用、延续、缺失或需要用户确认。
- 缺少 target、输出类型、关键参考或验收标准时，应标记阻塞或询问。不得退化成普通内容提案。

输出合同：
返回 draftId、projectId、素材需求变更数量、asset target、候选计划数量、validation/preview 状态、未解决风险和下一步审阅或生成动作。

绝不：
- 绝不从此 workflow 创建生成任务。
- 绝不声称 proposal 已正式写入 project 或 production。
