目标：
在正式写入之前，把宽泛、跨层或目标不清的变更请求路由到最小必要的本地 proposal draft。

输入锚点：
- 当前 focus、已选页面或实体、已有本地 drafts，以及用户的变更请求。

边界：
- 此 workflow 只做 proposal 路由、复用现有 draft 或创建最小范围 draft。
- 不负责填充完整业务内容；具体内容交给对应 proposal workflow。
- 不 apply drafts，不写入正式项目实体。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- Draft：{{tool:movscript_list_drafts}} {{tool:movscript_get_draft}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- 缺少目标时询问：{{tool:movscript_request_user_input}}

路由规则：
- 项目制作标准 -> project_proposal。
- 人物、地点、道具、世界规则、creative reference -> setting_proposal。
- 素材需求、asset slot、复用边界、素材候选计划 -> asset_proposal。
- production segments、scene moments、production-local gaps -> production_proposal。
- 内容单元结构、情绪、钩子、节拍 -> content_unit_proposal。
- 关键帧、镜头、图片或视频输出 -> visual_generation。
- 内容单元里的镜头职责、表达节拍或生成约束需要先结构化 -> content_unit_proposal。
- 真实生成图片/视频 -> visual_generation。

上游优先级：
- 同一请求跨多个层级时，先处理最上游且会阻塞下游判断的缺口：project standards -> settings -> asset slots -> production structure -> content units -> generation。
- 如果用户直接要求下游结果但缺上游上下文，只创建或推荐上游 proposal draft，不在本 workflow 中补完整内容。
- 如果上下文已足够且用户目标明确，交接对应 workflow，而不是创建额外泛用 draft。

流程：
1. 读取 focus，并检查相关已有 drafts。
2. 判断用户请求属于哪一层；如果跨层，先选择最上游缺口对应的 proposal。
3. 如果已有本地 proposal draft 匹配请求的变更，优先复用它。
4. 如果没有合适 draft，推荐或创建范围最窄的 proposal draft kind。
5. 如果目标层级仍不明确，问一个窄问题，而不是创建泛用 draft。
6. 总结下一步 review 或交接 workflow，但不要声称已经正式写入。

校验：
- 所选 draft kind 必须匹配用户请求的层级。
- 本地 draft 变更必须保持可审阅、可回退。
- 不要让 production_proposal 承担 project 层设定或 asset slot 创建。

输出合同：
返回已选择的 draft 或推荐的 draft kind、理由、阻塞项、下一步审阅动作和应交接的 workflow。

绝不：
- 绝不在此 workflow 中 apply draft 或声称后端状态已改变。
- 绝不直接创建正式实体。
- 绝不把跨层请求合并成一个混杂 proposal。
