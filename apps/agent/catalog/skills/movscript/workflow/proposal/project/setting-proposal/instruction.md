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
- setting_proposal draft 是可编辑的后端 snapshot。已有设定保留后端 id；新增设定临时使用 client_id；删除就是从 `proposal.creative_references` 中移除。

上下文缺失回退：
- 缺项目级画幅、镜头体系、摄影语言、视觉风格或负面约束时，交接 project_proposal。
- 设定目标不清或只需要最小事实澄清时，交接 setting_prep 或询问用户。
- 设定已经明确但缺素材需求、asset slot、用途、归属或复用边界时，交接 asset_proposal。
- 用户要求根据设定直接生成候选图片/视频时，先确认 asset slot；缺 slot 交接 asset_proposal，已有 slot 交接 asset_candidate_generation 或 visual_generation。
- 缺 production 使用场景、剧情节拍或情绪钩子时，交接 production_proposal 或 content_unit_proposal。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- Draft 模型：{{tool:movscript_get_draft_model}}
- Draft：{{tool:movscript_list_drafts}} {{tool:movscript_get_draft}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- 缺少目标时询问：{{tool:movscript_request_user_input}}

流程：
1. 读取 focus，确认 projectId；无法确认时询问。
2. 获取 setting_proposal 的 draft model contract；若暂不可用，使用 schema fallback 并在输出中说明。
3. 查找可复用 setting_proposal draft；没有合适 draft 时创建本地 proposal draft，source/target 记录 project 锚点，并把 draft model 返回的 seed/modelRef 作为 `movscript_create_draft.seed` 传入。
4. 修改前必须读取 draft。若 draft 已有 `metadata.seed.data` 或 `content.snapshot_base`，优先把其中的 project / creative_references 当作基准，并维护 `proposal.creative_references` 作为完整目标 snapshot。
5. 只有 draft 缺少 seed/snapshot、seed 明确过期、或 validate/preview 指出基准冲突时，才重新获取 draft model contract 来刷新基准；不要调用 creative reference 查询工具替代当前 draft 基准。
6. 只编辑 setting/creative reference 相关 snapshot 字段。不要写 `fields` wrapper、action 或 operations。更新已有设定必须保留 id；新设定使用 client_id，apply 成功后以后端 canonical snapshot 为准。
7. 对每个设定写清用途、可复用范围、关键视觉/叙事特征、限制条件、关系和合并/退休意图。
8. 如果发现设定需要素材需求支撑，只在输出中交接到 asset_proposal，不在 setting_proposal 中创建 asset slot。
9. Validate；支持 preview_apply 时运行 preview apply 并修复具体错误路径。

校验：
- 每个新增或修改设定都必须归属 project。
- 编辑 existing draft 时，必须能说明基准来自 draft seed/snapshot；若基准缺失，输出中说明已刷新 draft model 或该缺口仍未解决。
- 不确定设定对象时先问用户。
- 不把素材候选 prompt、模型参数或生成 job 写进设定 proposal。

输出合同：
回复 draftId、projectId、draft status、设定变更数量、validation/preview 状态、未解决设定问题和下一步 proposal。

绝不：
- 绝不把本地 setting_proposal 说成已正式写入 project。
- 绝不在此 workflow 中创建 asset slots、production 结构或生成任务。
