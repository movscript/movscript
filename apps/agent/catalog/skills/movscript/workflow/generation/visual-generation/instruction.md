目标：
创建并监控用于审阅的图片或视频生成任务。

输入：
- Prompt、输出类型、模型能力、参考资源、画幅比例、时长，以及模型专用参数。
- 当前项目上下文，以及用户已批准的生成意图。

边界：
- 此 workflow 只能通过需要审批的生成工具创建生成任务。
- 可以监控并总结任务。
- 不得把生成媒体绑定、接受、锁定或正式写入 production 实体。

允许的工具：
- 模型发现：{{tool:movscript_list_models}}
- 创建生成任务：{{tool:movscript_create_generation_job}}
- 检查和监控任务：{{tool:movscript_get_generation_job}} {{tool:movscript_list_generation_jobs}}
- 仅在用户明确要求或 stop/cancel 流程需要时取消：{{tool:movscript_cancel_generation_job}}

流程：
1. 创建任务前先补齐缺失的生成字段。
2. 选择模型或模型专用参数前，先使用模型发现。优先用 `model_contracts` 做紧凑规划；只有紧凑 contract 不足时，才检查对应 raw model 的 `params_schema`。
3. 从选中的模型 contract 中选择 `model_config_id`。不要根据 provider 名称或同 provider 的其他模型推断支持能力。
4. 只提交被选中模型的 `supported_param_keys` / `supported_params` 支持的顶层参数和 `extra_params` 值；只提交图片/视频数量满足 `input_requirements` 的参考资源。遵守 enum 选项、数值范围，以及冲突、条件 enum、条件 const、必填值等紧凑跨参数规则。
5. 只有在需要审批的生成工具获准运行后，才能提交任务。
6. 监控任务，直到进入终态或达到监控超时。
7. 只有工具结果包含输出资源或媒体预览时，才能报告它们。

校验：
- 不要仅凭任务已创建就假设任务成功。
- 后端生成校验错误码：{{tool:movscript_create_generation_job.errors}}。
- 将带有 `audit_version: 1` 的 `param_validation` 视为参数过滤和本地 preflight 的审计轨迹。当 dropped parameters、alias rewrites、`preflight_errors` 或 `input_preflight_errors` 影响用户请求时，需要说明。
- 将 `preflight_errors` 和 `input_preflight_errors` 视为解释性审计数据，而不是最终后端拒绝。
- 如果后端校验返回建议的参数修复，只能修复生成参数；不要通过推断修改目标、引用、模型 id、项目 id 或审批敏感字段。建议值为 `null` 表示移除该生成参数。
- 不要在同一次请求中自动修复 `UNSUPPORTED_OUTPUT_TYPE` 或 `INVALID_INPUT_COUNT`。说明不匹配之处，并选择兼容的模型 contract，或要求用户提供正确的参考输入。

输出：
返回最终任务状态、jobId、可用时的输出资源或媒体预览、存在时的 provider/model 元数据，以及简洁的匹配理由。

绝不：
- 在工具结果包含输出媒体或输出资源之前，绝不声称生成媒体已经存在。
- 绝不把生成媒体标记为 accepted、selected、bound 或 locked。
