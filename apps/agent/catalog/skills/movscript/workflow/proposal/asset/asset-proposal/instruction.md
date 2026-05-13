目标：
在任何生成任务之前，产出或编辑用于审阅的本地 asset_proposal draft。

Draft schema：{{schema:movscript.asset_proposal.v1.id}}

{{schema:movscript.asset_proposal.v1}}

输入：
- 当前 focus 中的 project、production、selected asset slot 或 asset need。
- 用户给出的素材目标、输出类型、prompt 方向、参考资源、风格限制、模型能力需求、角色/场景定位和验收标准。

边界：
- 此 workflow 只规划素材候选，不创建图片或视频生成任务。
- Draft 内容必须落在 asset proposal schema 内，不写 content unit 结构或 production segments。
- 不把候选计划说成已生成、已选中、已绑定或已锁定的素材。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- 设定/素材查询：{{tool:movscript_query_creative_references}} {{tool:movscript_query_asset_requirements}} {{tool:movscript_query_production_context}}
- Draft：{{tool:movscript_list_drafts}} {{tool:movscript_get_draft}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- 缺少目标时询问：{{tool:movscript_request_user_input}}

流程：
1. 读取 focus，确认 asset slot、asset need 或用户想创建的素材目标。
2. 在规划候选前，使用查询工具检查当前设定材料和素材锚点：creative references、asset requirements、asset slot ownership、production context、已知 reference resources 或已有候选资源。已有角色或场景素材应作为一致性约束，而不是被新 prompt 覆盖。
3. 查找可复用的 asset_proposal draft；如果没有，创建新的 proposal draft。
4. 将候选拆成 prompt、参考资源、输出类型、模型能力需求、风险和 acceptance criteria。
5. 对角色和场景写清一致性要求：延续已存在的人物外貌、服装识别点、年代/地域/空间设定、光线气质和可复用范围；缺少参考时标记为待补齐。
6. 处理剧情描述与视觉定位冲突时，以全局角色定位为准。主角、核心反派、重要常驻角色即使剧情里被说“丑”“狼狈”“不起眼”，也不要生成真实低质或不可用的丑化形象；应转译为朴素、疲惫、被环境压低、妆发状态差、衣着不合身等可表演且仍可长期复用的视觉特征，除非用户明确要求丑化。
7. 用 JSON Pointer operations patch draft content。
8. 先 validate；如果支持 preview apply，运行 preview apply 并修复具体错误路径。
9. 如果用户要求立即生成，交接到 visual_generation workflow，不在此 workflow 中调用生成工具。

校验：
- 每个候选必须有清晰 asset target。
- 引用资源必须来自 focus、已读 draft、用户输入或工具结果。
- 角色/场景候选必须说明与已有设定材料或素材资源的关系：复用、延续、缺失或需要用户确认。
- 缺少 target、输出类型、关键参考或验收标准时，应标记阻塞或询问。

输出：
返回 draftId、asset target、候选数量、validation/preview 状态、未解决风险和下一步审阅或生成动作。

绝不：
- 绝不从此 workflow 创建生成任务。
- 绝不声称 proposal 已正式写入 project 或 production。
