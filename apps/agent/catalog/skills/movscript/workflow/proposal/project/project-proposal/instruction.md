目标：
产出或编辑一个本地 project_proposal draft，作为项目级制作规范的可审阅提案。它定义固定项目制作规范，也可以用 custom_rules 追加任意 key/value 形式的项目级提示词规范；不要写入最终项目实体。

Draft schema：{{schema:movscript.project_proposal.v1.id}}

{{schema:movscript.project_proposal.v1}}

模型契约：
- 字段含义、seed 策略、review route 和 apply 边界应以 runtime draft model contract 为准。
- 当前运行环境若提供 draft model MCP 工具，创建或编辑 draft 前必须先读取该模型契约。
- 如果 draft model MCP 工具尚不可用，临时使用上方 schema 和当前 focus；不要把本 skill 中的字段描述当成长期唯一字段源。

输入：
- 当前 focus 中的 project、production 风格需求、用户提出的全局制作规范、镜头语言或风格约束。
- 用户给出的画幅、镜头大小、运镜、灯光、色彩、质感、节奏、禁用规则、质检口径、命名/文本/素材/交付规则和跨 production 复用要求。

边界：
- 此 workflow 只维护 project 层制作规范 proposal draft。
- 固定 8 项制作规范是基础必选项；custom_rules 用于承载额外项目规范，不限制 key。
- project_proposal 不再负责设定资料清单或素材需求清单。
- 设定资料创建/合并/修改使用 setting_proposal。
- 素材需求创建/归属/复用/豁免使用 asset_proposal。
- 素材候选图方向、prompt、参考资源、模型参数、风险和验收标准使用 asset_proposal。
- 不写 production segments、scene moments、content units、生成任务或已生成资源绑定。
- 当前 project_proposal 是本地审阅规范；除非 runtime draft model contract 或工具结果明确给出正式 apply target，不要声称已正式写入后端。

上下文缺失回退：
- 缺人物、地点、道具、世界规则、关系或 creative reference 时，交接 setting_proposal。
- 缺素材需求、asset slot、归属、用途、复用边界或豁免时，交接 asset_proposal。
- 缺 production 结构、segments 或 scene moments 时，交接 production_proposal。
- 缺剧情、情绪推进、钩子或内容单元结构时，交接 content_unit_proposal。
- 缺候选图/视频方向、prompt、参考资源或验收标准时，交接 asset_proposal；用户明确要求真实生成时交接 visual_generation。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- Draft 模型：{{tool:movscript_get_draft_model}}
- Draft 读取/创建/编辑：{{tool:movscript_get_draft}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- 用户输入：{{tool:movscript_request_user_input}}

流程：
1. 读取当前 focus。如果 projectId 缺失且无法推断，用 movscript_request_user_input 询问。
2. 获取 project_proposal 的 draft model 契约；若暂不可用，使用 schema fallback 并在输出中说明。
3. 如果当前会话已有 project_proposal draftId，先读取它；否则用 proposal=true 创建一个，source/target 记录 project 锚点，并把 MCP 返回的 seed/modelRef 作为 movscript_create_draft.seed 传入。
4. 修改现有 draft 前必须先读取内容。
5. 只 patch proposal.project_style；draft 中不得出现 creative_references 或 asset_slots。
6. Validate draft。当前 applyBoundary 若为 draft_only，不运行正式 preview apply；只报告本地 validation 状态和未决规范。

内容规则：
- project_style.aspect_ratio：项目默认画幅，例如 9:16、16:9、1:1。
- project_style.shot_size_system：项目使用的镜头大小词表，例如 establishing、wide、medium、close-up、insert。
- project_style.camera_language：机位、运镜、镜头稳定性和构图规则。
- project_style.visual_style / lighting_style / color_palette：可执行的视觉规则，避免只写“高级感”“电影感”等空泛词。
- project_style.pacing_rules：节奏、镜头时长、转场或信息呈现规则。
- project_style.negative_rules：明确禁止项，例如随机改脸、过暗看不清道具、字幕遮挡主体等。
- project_style.custom_rules：任意扩展规范数组。每条至少包含 key、label、value；可补充 category、prompt_role、enabled、required、order。
- custom_rules.key：稳定英文/拼音/蛇形 key，用于后续注入提示词；不要用随机 id。
- custom_rules.value：可执行的规则正文，避免只写抽象口号。
- custom_rules.prompt_role：只能是 context、style、constraint、negative、quality_gate。缺省时使用 constraint。

校验：
- Project proposal 只写 project_style 及必要 impact_notes/summary。
- custom_rules 必须是数组；每条必须有非空 key、label、value；prompt_role 只能使用允许值。
- Project proposal 中出现 creative_references 或 asset_slots 视为越界，应改用 setting_proposal 或 asset_proposal。
- 如果用户要求人物、地点、道具、世界规则等设定，切换到 setting_proposal。
- 如果用户要求“需要哪些素材”“素材需求归属”“素材复用边界”，切换到 asset_proposal。
- 如果用户要求“候选图方案”“prompt”“出图方向”，切换到 asset_proposal。

输出合同：
回复 draftId、projectId、draft status、validation 状态、项目规范摘要和未解决的镜头/风格决策。

绝不：
- 绝不把本地规范 draft 描述为已正式写入 project。
- 绝不把设定资料、素材需求、候选图方案或 production 编排写进 project_proposal。
