目标：
为选中的 asset slot 生成可审阅的图片或视频候选；如果缺少生成参数，先补齐参数，再交接 visual_generation 创建任务。

输入：
- Focus，以及已选 asset slot 或 asset need。
- 可用时的已有设定材料、已有素材资源、引用、draft notes 和用户约束。
- 目标输出类型、prompt 方向、引用 id、画幅比例、时长、模型能力需求、风险和验收标准。

边界：
- 此 workflow 负责真实候选生成的目标定位、生成任务创建、监控，以及把成功输出加入目标 asset slot 候选集；不产出 asset_proposal 文字草稿作为最终结果。
- 保留已选 asset slot 作为审阅目标。
- 可以把成功生成的输出资源加入候选集；不要把生成媒体标记为 accepted、selected、bound 或 locked。

上下文缺失回退：
- 缺 asset slot、素材归属、用途、复用边界或验收标准时，先交接 asset_proposal。
- 目标是派生形象、服装/情绪/动作/年龄状态、场景细节、关键帧或视频参考，但缺少已采纳/已锁定 canonical/base resource 时，先回到 asset_proposal 或生成 canonical 候选；不要直接生成派生候选。
- 缺人物、地点、道具或世界规则等可复用设定时，先交接 setting_proposal 或 setting_prep。
- 缺 production 或 content unit 使用场景时，先交接 production_proposal 或 content_unit_proposal。
- 缺模型能力、输出类型、参考输入数量或参数可行性时，进入 visual_generation 的模型发现和 preflight；不要按 provider 经验推断。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- Draft 模型或 seed：{{tool:movscript_get_draft_model}}
- 查询设定资料、素材需求和制作上下文：{{tool:movscript_query_creative_references}} {{tool:movscript_query_asset_slots}} {{tool:movscript_query_production_context}}
- 模型发现：{{tool:movscript_list_models}}
- 提交异步生成 operation：{{tool:runtime_operation_start}}，`kind: "generation_job"`；该工具只返回 operation handle，不等待完成。
- 监控异步生成 operation：{{tool:runtime_operation_get}} {{tool:runtime_operation_list}} {{tool:runtime_operation_wait}}
- 生成成功并拿到一个或多个 output_resource_id 后，写入候选集：{{tool:movscript_attach_asset_slot_candidate}}
- 缺少目标或引用时询问：{{tool:movscript_request_user_input}}

流程：
1. 识别 asset slot；如果目标含糊，则询问用户。
2. 准备候选前，先确认当前设定材料是否已有可复用素材：creative references、asset slots、asset slot ownership、reference resources、近期生成结果或已绑定资源。已有角色或场景素材要保留人物一致性、场景一致性和可复用识别点。
3. 判断设定材料的状态和全局定位：角色是主角、核心反派、重要常驻、配角还是路人；场景是主场景、一次性场景还是风格参考。定位越重要，候选越应避免随机改脸、改年龄、改时代、改空间气质。
4. 判断当前目标是 canonical/base 候选还是派生候选。canonical 候选可以在没有参考资源时作为基本形象探索；派生候选必须引用同一 creative reference 下已采纳、已锁定或明确可用的 canonical resource。若只查到未采纳候选、没有 resource_id、或只有文字设定，应报告阻塞并先推进基本素材。
5. 处理剧情描述与视觉定位冲突时，以可长期复用的角色资产为准。主角或重要角色即使文本说“丑”“狼狈”“不起眼”，也不要把候选写成真实低质或不可用的丑化形象；应转译为朴素、疲惫、被环境误读、衣着状态差等可控特征，除非用户明确要求丑化。
6. 将期望候选总结为具体 prompt intent、引用、输出类型、模型能力和验收标准；派生候选的 prompt 必须把 canonical resource 作为一致性参考，而不是重新描述一套可能漂移的基本形象。
7. 检查可行性时，使用模型发现 contracts，而不是 provider 假设。记录缺失引用、不支持的时长/画幅比例、不支持的模型专用参数、输入数量限制或归属不清等阻塞项。
8. 用户要求生成候选时，必须提交并监控异步生成 operation；`runtime_operation_start` 只返回 operation handle，不等待完成、不代表成功。一个 backend job 只产出一个可提交候选，需要多个候选时创建多个独立 operation 并用同一个 `operationIds` 列表等待。每拿到一个可用 `output_resource_id`，立即单独调用一次 `movscript_attach_asset_slot_candidate` 把该资源加入选中 asset slot 的候选集。即使 wait 结果里有多个独立 job 聚合出的 `output_resource_ids` 列表，也必须按资源逐项调用 attach；不要把 `output_resource_ids`、`resource_ids` 或多个资源 ID 合并传入同一次候选写入。不要只返回更详细的文字提案。

校验：
- 候选必须命名 asset target，并说明准备方向为什么适合它。
- 提到的任何生成资源都必须来自已有上下文或已检查的任务结果，不能来自假设的任务。
- 不要把 `runtime_operation_start` 的 started/queued 结果当作终态；输出资源、失败、取消或超时必须来自 `runtime_operation_wait/get/list`。
- 候选必须说明与已有设定材料或素材资源的关系：复用哪张/哪个 resource id、延续哪些一致性特征、或缺少哪些参考。
- 派生候选必须说明所依赖的 canonical/base resource；缺少基本形象、空间标准、物件标准或风格板时，应阻塞派生生成并返回下一步 canonical 候选动作。

输出：
返回已选 asset target、候选 prompt 方向、已有设定/素材检查结果、已知的引用/资源 id、所需模型能力、验收标准、生成 jobId、output_resource_id 列表、每个 output_resource_id 的候选写入结果、阻塞项和下一步动作。

绝不：
- 除非生成工具结果证明媒体存在，否则绝不声称媒体已经存在。
- 除非 `movscript_attach_asset_slot_candidate` 对对应 output_resource_id 成功返回，否则绝不声称该资源已经加入候选集；如果有多个 output_resource_id，必须逐个调用 attach，并逐项报告成功、失败或阻塞。
