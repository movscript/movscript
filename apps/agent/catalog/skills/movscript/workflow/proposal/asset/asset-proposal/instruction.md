目标：
在任何生成任务之前，产出或编辑统一的本地 asset_proposal draft。这个 draft 是唯一的素材提案 kind，覆盖两类内容：
1. project 层 asset slots 需求清单。
2. 已选 asset slot 的候选制作方案。

Draft schema：{{schema:movscript.asset_proposal.v1.id}}

{{schema:movscript.asset_proposal.v1}}

输入：
- 当前 focus 中的 project、production、selected asset slot 或 asset need。
- 用户给出的素材目标、输出类型、prompt 方向、参考资源、风格限制、模型能力需求、角色/场景定位和验收标准。
- 若 focus 未提供充足角色-场景关系时，在决策前先读取剧本正文进行交叉确认。

边界：
- 此 workflow 只写 `asset_proposal` draft；素材需求和素材候选方案都不要拆到其他素材 draft kind。
- 如果用户在梳理“需要哪些素材位 / 素材需求清单”，写 `proposal.asset_slots`，不写候选 prompt。
- 如果用户在问“这个素材需求怎么做候选方案”，必须绑定一个已存在或明确选择的 asset slot，写 `proposal.candidate_plans`，并保持 `proposal.asset_slots` 为空数组。
- 不创建图片或视频生成任务。
- 如果用户明确要求“生成图片候选 / 生成视频候选 / 出图 / 出视频”，不要停留在此 workflow；应交接到 asset_candidate_generation 或 visual_generation。
- Draft 内容必须落在 asset proposal schema 内，不写 content unit 结构或 production segments。
- 不创建或修改 project 层 creative reference；设定资料使用 setting_proposal。
- 不把候选计划说成已生成、已选中、已绑定或已锁定的素材。
- asset_proposal draft 是可编辑的后端 snapshot。素材需求条目直接写在 `proposal.asset_slots[]` 上，不使用 `fields` wrapper、action 或 operations。
- 素材归属必须优先使用后端 id。`owner.client_id` 只允许引用同一次 apply/bundle 内刚创建的本地设定；不能引用已应用 setting draft 里的旧 client_id。

上下文缺失回退：
- 缺项目级制作标准，导致素材需求无法判断画幅、风格、镜头语言或负面约束时，交接 project_proposal。
- 缺人物、地点、道具、世界规则或 creative reference，导致素材归属不清时，交接 setting_proposal 或 setting_prep。
- 缺 production 目标、scene moment 或使用场景，导致素材用途不清时，交接 production_proposal。
- 缺剧情节拍、情绪推进、钩子或 content unit 目标，导致候选方向不清时，交接 content_unit_proposal。
- 缺真实生成参数但素材候选目标已明确时，补齐 candidate plan 后交接 visual_generation；用户明确要生成时，不停留在文字 proposal。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- 项目剧本：{{tool:movscript_read_project_scripts}}（请使用 `includeContent: true`）
- 设定/素材查询：{{tool:movscript_query_creative_references}} {{tool:movscript_query_asset_slots}} {{tool:movscript_query_production_context}}
- Draft：{{tool:movscript_list_drafts}} {{tool:movscript_get_draft}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- 缺少目标时询问：{{tool:movscript_request_user_input}}

流程：
1. 读取 focus，确认用户是在整理素材需求清单，还是在为已选素材需求规划候选。
2. 读取 focus 后，先拉取项目剧本正文（`movscript_read_project_scripts` + `includeContent: true`），并优先从剧本中提取角色关系、场景边界、道具与拍摄语义。
3. 若是素材需求清单：查询 creative references 和现有 asset slots，查找或创建 asset_proposal draft，维护 `proposal.asset_slots` 作为完整目标 snapshot；`proposal.creative_references` 和 `proposal.candidate_plans` 保持空数组。
4. 若是候选方案：确认 asset slot 或 asset need。若没有 assetSlotId 且不能通过查询唯一定位，先询问用户；若素材需求尚不存在，先在同一个 asset_proposal draft 的 `proposal.asset_slots` 创建锚点，不要创建别的 kind。
5. 在规划候选前，先读取相关 setting_proposal / asset_proposal draft。若 setting draft 已经应用，必须重新基于后端 snapshot 获取真实 creative reference id；不要沿用旧 client_id。素材锚点再用查询工具检查 asset slots、asset slot ownership、production context、已知 reference resources 或已有候选资源。
6. 如果 creative reference 查询返回 `total_count > 0` 但 `count` 或 `returned` 为 0，说明当前筛选没有可用设定明细；应回到 draft seed/snapshot 或放宽筛选，不要据此判定“有设定但没有可编辑明细”。
7. 将候选拆成 prompt、参考资源、输出类型、模型能力需求、风险和 acceptance criteria。
8. 对角色和场景写清一致性要求：延续已存在的人物外貌、服装识别点、年代/地域/空间设定、光线气质和可复用范围；缺少参考时标记为待补齐。
9. 处理剧情描述与视觉定位冲突时，以全局角色定位为准。主角、核心反派、重要常驻角色即使剧情里被说“丑”“狼狈”“不起眼”，也不要生成真实低质或不可用的丑化形象；应转译为朴素、疲惫、被环境压低、妆发状态差、衣着不合身等可表演且仍可长期复用的视觉特征，除非用户明确要求丑化。
10. 用 JSON Pointer operations patch draft content，但 patch 后的内容必须仍是直接 snapshot 条目。
11. 先 validate；如果支持 preview apply，运行 preview apply 并修复具体错误路径。
12. 如果用户要求立即生成，交接到 visual_generation workflow，不在此 workflow 中调用生成工具。

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
