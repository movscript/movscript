目标：
在任何生成任务之前，产出或编辑用于审阅的本地 asset_proposal draft。

Draft schema：{{schema:movscript.asset_proposal.v1.id}}

{{schema:movscript.asset_proposal.v1}}

输入：
- 当前 focus 中的 project、production、selected asset slot 或 asset need。
- 用户给出的素材目标、输出类型、prompt 方向、参考资源、风格限制、模型能力需求和验收标准。

边界：
- 此 workflow 只规划素材候选，不创建图片或视频生成任务。
- Draft 内容必须落在 asset proposal schema 内，不写 content unit 结构或 production segments。
- 不把候选计划说成已生成、已选中、已绑定或已锁定的素材。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- Draft：{{tool:movscript_list_drafts}} {{tool:movscript_get_draft}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- 缺少目标时询问：{{tool:movscript_request_user_input}}

流程：
1. 读取 focus，确认 asset slot、asset need 或用户想创建的素材目标。
2. 查找可复用的 asset_proposal draft；如果没有，创建新的 proposal draft。
3. 将候选拆成 prompt、参考资源、输出类型、模型能力需求、风险和 acceptance criteria。
4. 用 JSON Pointer operations patch draft content。
5. 先 validate；如果支持 preview apply，运行 preview apply 并修复具体错误路径。
6. 如果用户要求立即生成，交接到 visual_generation workflow，不在此 workflow 中调用生成工具。

校验：
- 每个候选必须有清晰 asset target。
- 引用资源必须来自 focus、已读 draft、用户输入或工具结果。
- 缺少 target、输出类型、关键参考或验收标准时，应标记阻塞或询问。

输出：
返回 draftId、asset target、候选数量、validation/preview 状态、未解决风险和下一步审阅或生成动作。

绝不：
- 绝不从此 workflow 创建生成任务。
- 绝不声称 proposal 已正式写入 project 或 production。
