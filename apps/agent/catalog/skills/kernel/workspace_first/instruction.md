目标：
在正式写入之前，把宽泛、跨层或目标不清的变更请求路由到最小必要的本地 workspace。

输入锚点：
- 当前 focus、已选页面或实体、当前会话 workspaceId，以及用户的变更请求。

边界：
- 此 Skill 只做 workspace 路由、复用现有 workspace 或打开最小范围 workspace。
- 不负责填充完整业务内容；具体内容交给对应 workspace task。
- 不 save workspace，不写入正式项目实体。

允许的工具：
- Focus：{{tool:movscript_focus_get}}
- Workspace：{{tool:workspace_open}} {{tool:core_file_read}} {{tool:core_file_search}} {{tool:core_file_edit}} {{tool:workspace_validate}}。已知 workspaceId 时直接读取 `agent://workspace/{workspaceId}/content`；正文编辑使用文件工具修改同一个真实 JSON 文件 ref；修改后用 `workspace_validate` 做 validation 与 dry-run。
- 缺少目标时询问：{{tool:core_user_input_request}}

路由规则：
- 项目制作标准 -> project_standards_edit。
- 人物、地点、道具、世界规则、creative reference -> setting_edit。
- 素材需求、asset slot、复用边界、素材候选计划 -> asset_edit。
- production segments、scene moments、production-local gaps -> production_edit。
- 内容单元结构、情绪、钩子、节拍 -> content_unit_edit。
- 关键帧、镜头、图片或视频输出 -> visual_generation。
- 内容单元里的制作项职责、表达节拍或生成约束需要先结构化 -> content_unit_edit。
- 真实生成图片/视频 -> visual_generation。

上游优先级：
- 同一请求跨多个层级时，先处理最上游且会阻塞下游判断的缺口：project standards -> settings -> asset slots -> production structure -> content units -> generation。
- 如果用户直接要求下游结果但缺上游上下文，只打开或推荐上游 workspace，不在本 Skill 中补完整内容。
- 如果上下文已足够且用户目标明确，交接对应 Skill，而不是创建额外泛用 workspace。

流程：
1. 读取 focus，并检查当前会话是否已有 workspaceId。
2. 判断用户请求属于哪一层；如果跨层，先选择最上游缺口对应的 workspace。
3. 如果当前会话已有本地 workspace，先读取并复用它。
4. 如果当前会话没有 workspace，推荐或打开范围最窄的 workspace kind。
5. 如果目标层级仍不明确，问一个窄问题，而不是创建泛用 workspace。
6. 总结下一步编辑或交接 task，但不要声称已经正式写入。

校验：
- 所选 workspace kind 必须匹配用户请求的层级。
- 本地 workspace 变更必须保持可校验、可继续编辑。
- 不要让 production_edit 承担 project 层设定或 asset slot 创建。

输出：
返回已选择的 workspace 或推荐的 workspace kind、理由、阻塞项、下一步编辑动作和应交接的 task。

绝不：
- 绝不在此 Skill 中 save workspace 或声称后端状态已改变。
- 绝不直接创建正式实体。
- 绝不把跨层请求合并成一个混杂 workspace。
