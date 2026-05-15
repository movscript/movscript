目标：
产出或编辑一个本地 setting_proposal draft，作为 project 层 creative references 的可审阅提案。

Draft schema：{{schema:movscript.setting_proposal.v1.id}}

{{schema:movscript.setting_proposal.v1}}

输入锚点：
- 当前 focus 中的 project、selected creative reference 或用户描述的设定目标。
- 用户提供的人物、地点、道具、产品/品牌、风格、世界规则、关系、时代背景、限制条件或合并要求。

边界：
- 只维护 project 层设定资料：人物、地点、道具、产品/品牌、风格、世界规则、时代背景、限制条件、关系和合并候选。
- 不写素材需求 asset_slots；素材需求使用 asset_proposal。
- 不写候选图方案、prompt、模型参数或生成任务；素材候选计划使用 asset_proposal，真实生成使用 visual_generation。
- 不写 production segments、scene moments 或 content units。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- Draft 模型：{{tool:movscript_get_draft_model}}
- Draft：{{tool:movscript_list_drafts}} {{tool:movscript_get_draft}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- 缺少目标时询问：{{tool:movscript_request_user_input}}

流程：
1. 读取 focus，确认 projectId；无法确认时询问。
2. 获取 setting_proposal 的 draft model contract；若暂不可用，使用 schema fallback 并在输出中说明。
3. 查找可复用 setting_proposal draft；没有合适 draft 时创建本地 proposal draft，source/target 记录 project 锚点。
4. 修改前读取 draft；只 patch setting/creative reference 相关字段。
5. 对每个设定写清用途、可复用范围、关键视觉/叙事特征、限制条件、关系和合并/退休意图。
6. 如果发现设定需要素材需求支撑，只在输出中交接到 asset_proposal，不在 setting_proposal 中创建 asset slot。
7. Validate；支持 preview_apply 时运行 preview apply 并修复具体错误路径。

校验：
- 每个新增或修改设定都必须归属 project。
- 不确定设定对象时先问用户。
- 不把素材候选 prompt、模型参数或生成 job 写进设定 proposal。

输出合同：
回复 draftId、projectId、draft status、设定变更数量、validation/preview 状态、未解决设定问题和下一步 proposal。

绝不：
- 绝不把本地 setting_proposal 说成已正式写入 project。
- 绝不在此 workflow 中创建 asset slots、production 结构或生成任务。
