目标：
创建并监控用于审阅的内容单元视觉、关键帧、图片或视频生成任务。

输入：
- Prompt、输出类型、模型能力、参考资源、画幅比例、时长，以及模型专用参数。
- 当前项目上下文、设定材料状态、已有素材资源，以及用户已批准的生成意图。
- 目标可以是 asset slot、content unit、scene moment 或关键帧输出。

边界：
- 此 workflow 只能通过需要审批的异步生成 runtime operation 创建生成任务。
- 可以监控并总结任务。
- 不得把生成媒体绑定、接受、锁定或正式写入 production 实体。

上下文缺失回退：
- 缺项目级画幅、风格、镜头语言或负面约束时，先交接 project_standards_proposal。
- 缺角色、场景、道具、世界规则或 creative reference 时，先交接 setting_proposal 或 setting_prep。
- 缺 asset slot、素材用途、复用边界、候选 prompt intent 或验收标准时，先交接 asset_proposal。
- 目标是派生形象、服装/情绪/动作/年龄状态、场景细节、关键帧或视频参考，但缺少同一设定下已采纳/已锁定 canonical/base resource 时，先交接 asset_proposal 或生成 canonical 候选；不要直接生成派生候选。
- 缺 content unit、制作项职责、表达节拍或 prompt intent 时，先交接 content_unit_proposal。
- 目标、参考资源、输出类型和审批边界明确时，关键帧、图片或视频输出直接在本 workflow 创建 generation job。
- 只有生成目标、参考资源、输出类型、模型能力和审批边界足够明确时，才创建 generation job。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- 设定/素材/制作上下文：{{tool:movscript_query_creative_references}} {{tool:movscript_query_asset_slots}} {{tool:movscript_query_production_context}}
- 设定/素材 seed：{{tool:movscript_get_draft_model}}
- 模型发现：{{tool:movscript_list_models}}
- 创建异步生成 operation：{{tool:agent_io_start}}，`kind: "generation_job"`，`request` 使用生成参数。
- 加入 asset slot 候选集：{{tool:movscript_attach_asset_slot_candidate}}
- 加入 keyframe / 画面锚点候选集：{{tool:movscript_attach_keyframe_candidate}}
- 等待异步生成 operation：{{tool:agent_io_wait}}
- 检查和补充查看任务：{{tool:agent_io_get}} {{tool:agent_io_list}}
- 请求用户确认：{{tool:movscript_request_user_input}}
- 仅在用户明确要求或 stop/cancel 流程需要时取消：{{tool:agent_io_cancel}}

流程：
1. 创建任务前先补齐缺失的生成字段。
2. 在确定 prompt 和参考资源前，确认当前设定材料是否已有素材：读取 focus；如果目标关联 creative reference、asset slot、content unit 或 keyframe，优先使用查询工具检查 creative references、asset slots、production context（需要画面锚点目标时 include keyframes）和 content unit generation context；必要时再使用 runtime draft model seed 检查补充快照。已有角色/场景素材必须优先作为一致性约束。
3. 判断当前目标是 canonical/base 候选还是派生候选。canonical 候选可以作为基本形象、空间、物件或风格探索；派生候选必须引用同一 creative reference 下已采纳、已锁定或明确可用的 canonical resource。若只查到未采纳候选、没有 resource_id、或只有文字设定，应报告阻塞并先推进基本素材。
4. 根据设定材料状态和全局定位修正 prompt：主角、核心反派、重要常驻角色要保持可长期复用的美术价值；剧情里的“丑”“狼狈”“不起眼”应转译为朴素、疲惫、妆发凌乱、衣着压低、被环境误读等可控特征，不要生成真实低质或不可用的丑化形象，除非用户明确要求丑化。
5. 对场景素材，延续已有空间结构、年代地域、色彩/光线气质、关键道具和可复用识别点；没有参考时说明缺失，而不是凭空假定已有素材。派生 prompt 必须把 canonical resource 作为一致性参考，而不是重新描述一套可能漂移的基本形象。
6. 选择模型或模型专用参数前，先使用模型发现。按本次实际 `job_type` / capability 查询并选择 contract：文生图用 `image`，有参考图编辑才用 `image_edit`。优先用 `model_contracts` 做紧凑规划；只有紧凑 contract 不足时，才检查对应 raw model 的 `params_schema`。
7. 从选中的模型 contract 中选择 `model_id`。不要根据 provider 名称、内部配置 ID 或同 provider 的其他模型推断支持能力。
8. 只提交被选中模型的 `supported_param_keys` / `supported_params` 支持的顶层参数和 `extra_params` 值；只提交图片/视频数量满足所选 `job_type` contract 的 `input_requirements` 的参考资源。模型同时具备 `image` 和 `image_edit` 时，`image` 文生图不需要参考图，除非用户目标或一致性素材明确要求。遵守 enum 选项、数值范围，以及冲突、条件 enum、条件 const、必填值等紧凑跨参数规则。
9. 只有在需要审批的异步生成 operation 获准运行后，才能提交任务。一个 backend job 只产出一个可提交候选；需要 2 张或更多候选图时，创建多个独立 operation（可用 `output_count`，或显式多次调用 `agent_io_start`），不要让一个 operation 承担多个候选输出。创建任务时使用 `agent_io_start`，传入 `kind: "generation_job"`。`agent_io_start` 不是通用工具包装器；不要用它包装普通同步工具调用。
10. 创建一个或多个 operation 后，调用 `agent_io_wait` 等待这些 operationId；多个任务使用同一个 `operationIds` 列表，并优先用 `mode: "any"` 让任一任务完成即可返回。每次 wait 返回后，先处理已完成 operation 的输出资源，再继续等待仍 pending 的 operation。不要为了凑齐一批结果而延迟已完成资源的候选写入，也不要绕过 runtime operation 系统自行轮询。只有在需要查看单个任务详情、wait 返回信息不足，或用户明确要求检查状态时，才使用 `agent_io_get`。
11. 只有工具结果包含输出资源或媒体预览时，才能报告它们。
12. 当输出资源存在且用户目标是生成某个 asset slot 的素材候选时，每拿到一个可用 `output_resource_id`，立即单独调用一次 `movscript_attach_asset_slot_candidate` 加入目标 asset slot 候选集；当用户目标是生成某个 keyframe / 画面锚点候选时，每拿到一个可用 `output_resource_id`，立即单独调用一次 `movscript_attach_keyframe_candidate` 加入目标 keyframe 候选集。如果 wait 结果里有多个独立 job 聚合出的 `output_resource_ids` 列表，按列表逐项 attach；不要把 `output_resource_ids`、`resource_ids` 或多个资源 ID 合并传入同一次候选写入。除非用户明确要求只预览结果，否则不要停留在让用户手动选择。

校验：
- 不要仅凭任务已创建就假设任务成功。
- 如果缺少现有角色/场景素材或 reference id，要明确说明这是新候选还是参考不足，不能假装已保留一致性。
- 派生生成必须说明所依赖的 canonical/base resource；缺少基本形象、空间标准、物件标准或风格板时，应阻塞派生生成并返回下一步 canonical 候选动作。
- 后端生成校验错误码来自 `agent_io_start(kind:"generation_job")` 的 provider result，包括 `UNSUPPORTED_OUTPUT_TYPE`、`UNSUPPORTED_PARAMETER`、`INVALID_PARAMETER_TYPE`、`INVALID_PARAMETER_OPTION`、`INVALID_PARAMETER_RANGE`、`INVALID_PARAMETER_COMBINATION`、`INVALID_INPUT_COUNT`。
- 将带有 `audit_version: 1` 的 `param_validation` 视为参数过滤和本地 preflight 的审计轨迹。当 dropped parameters、alias rewrites、`preflight_errors` 或 `input_preflight_errors` 影响用户请求时，需要说明。
- 将 `preflight_errors` 和 `input_preflight_errors` 视为解释性审计数据，而不是最终后端拒绝。
- 如果后端校验返回建议的参数修复，只能修复生成参数；不要通过推断修改目标、引用、模型 id、项目 id 或审批敏感字段。建议值为 `null` 表示移除该生成参数。
- 不要在同一次请求中自动修复 `UNSUPPORTED_OUTPUT_TYPE` 或 `INVALID_INPUT_COUNT`。说明不匹配之处，并选择兼容的模型 contract，或要求用户提供正确的参考输入。

输出：
返回最终任务状态、jobId、生成类型（keyframe/image/video）、目标实体、可用时的输出资源列表或媒体预览、存在时的 provider/model 元数据、使用或缺失的一致性参考、简洁的匹配理由，以及每个 output_resource_id 的候选集写入结果。

绝不：
- 在工具结果包含输出媒体或输出资源之前，绝不声称生成媒体已经存在。
- 绝不把生成媒体标记为 candidate，除非 `movscript_attach_asset_slot_candidate` 或 `movscript_attach_keyframe_candidate` 工具结果证明对应 output_resource_id 的候选写入成功；如果有多个 output_resource_id，必须逐个调用 attach，并逐项报告成功、失败或阻塞；绝不把生成媒体标记为 accepted、selected、bound 或 locked。
