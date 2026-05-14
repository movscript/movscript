目标：产出或编辑一个本地 project_proposal draft，作为项目级制作规范的可审阅提案。它定义镜头大小体系、画幅、摄影语言、视觉风格、灯光色彩、节奏规则和负面约束；不要写入最终项目实体。

Draft schema：{{schema:movscript.project_proposal.v1.id}}

{{schema:movscript.project_proposal.v1}}

模型契约：
- 字段含义、seed 策略、review route 和 apply 边界应以 frontend DraftDomainModel 为唯一来源。
- 当前运行环境若提供 draft model MCP 工具，创建或编辑 draft 前必须先读取该模型契约。
- 如果 draft model MCP 工具尚不可用，临时使用上方 schema 和当前 focus；不要把本 skill 中的字段描述当成长期唯一字段源。

输入：
- 当前 focus 中的 project、production 风格需求、用户提出的全局制作规范、镜头语言或风格约束。
- 用户给出的画幅、镜头大小、运镜、灯光、色彩、质感、节奏、禁用规则和跨 production 复用要求。

边界：
- 此 workflow 只维护 project 层制作规范 proposal draft。
- project_proposal 不再负责设定资料清单或素材需求清单。
- 设定资料创建/合并/修改使用 setting_proposal。
- 素材需求创建/归属/复用/豁免使用 asset_proposal。
- 素材候选图方向、prompt、参考资源、模型参数、风险和验收标准使用 asset_proposal。
- 不写 production segments、scene moments、content units、生成任务或已生成资源绑定。
- 当前 project_proposal 是本地审阅规范；除非 DraftDomainModel/工具结果明确给出正式 apply target，不要声称已正式写入后端。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- Draft 模型：{{tool:movscript_get_draft_model}}
- Draft 查找/读取/创建/编辑：{{tool:movscript_list_drafts}} {{tool:movscript_get_draft}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- 用户输入：{{tool:movscript_request_user_input}}

流程：
1. 读取当前 focus。如果 projectId 缺失且无法推断，用 movscript_request_user_input 询问。
2. 获取 project_proposal 的 draft model 契约；若暂不可用，使用 schema fallback 并在输出中说明。
3. 查找已有 project_proposal draft；如果不存在，则用 proposal=true 创建一个，source/target 记录 project 锚点，并把 MCP 返回的 seed/modelRef 作为 movscript_create_draft.seed 传入。
4. 修改现有 draft 前必须先读取内容。
5. 只 patch proposal.project_style；creative_references 和 asset_slots 在新 draft 中保持空数组，除非用户明确要求迁移旧混合草稿。
6. Validate draft。当前 applyBoundary 若为 draft_only，不运行正式 preview apply；只报告本地 validation 状态和未决规范。

内容规则：
- project_style.aspect_ratio：项目默认画幅，例如 9:16、16:9、1:1。
- project_style.shot_size_system：项目使用的镜头大小词表，例如 establishing、wide、medium、close-up、insert。
- project_style.camera_language：机位、运镜、镜头稳定性和构图规则。
- project_style.visual_style / lighting_style / color_palette：可执行的视觉规则，避免只写“高级感”“电影感”等空泛词。
- project_style.pacing_rules：节奏、镜头时长、转场或信息呈现规则。
- project_style.negative_rules：明确禁止项，例如随机改脸、过暗看不清道具、字幕遮挡主体等。

校验：
- Project proposal 只写 project_style 及必要 impact_notes/summary。
- 如果用户要求人物、地点、道具、世界规则等设定，切换到 setting_proposal。
- 如果用户要求“需要哪些素材”“素材需求归属”“素材复用边界”，切换到 asset_proposal。
- 如果用户要求“候选图方案”“prompt”“出图方向”，切换到 asset_proposal。

输出：
回复 draftId、projectId、draft status、validation 状态、项目规范摘要和未解决的镜头/风格决策。

绝不：
- 绝不把本地规范 draft 描述为已正式写入 project。
- 绝不把设定资料、素材需求、候选图方案或 production 编排写进 project_proposal。
