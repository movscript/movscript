目标：
打开或编辑一个本地 setting_edit workspace，作为 project 层 creative references 的可审阅工作区。

Workspace 后端内容 schema：{{schema:movscript.setting_workspace.v1.id}}

{{schema:movscript.setting_workspace.v1}}

输入锚点：
- 当前 focus 中的 project、selected creative reference 或用户描述的设定目标。
- 用户提供的人物、地点、道具、产品/品牌、风格、世界规则、关系、时代背景、限制条件或合并要求。
- 如 focus 对相关角色关系、地点边界或历史延续信息不足，优先定位并精读相关剧本片段建立设定事实；只有需要全局世界观或全剧结构判断时才读取较大范围正文。

边界：
- 只维护 project 层设定资料：人物、地点、道具、产品/品牌、风格、世界规则、时代背景、限制条件、关系和合并候选。
- 不写素材需求 asset_slots；素材需求使用 asset_edit workspace。
- 不写候选图方案、prompt、模型参数或生成任务；素材候选计划使用 asset_edit workspace，真实生成使用 visual_generation。
- 不写 production segments、scene moments 或 content units。
- setting_edit workspace 内部仍使用后端 JSON 内容结构；`workspace.creative_references` 是完整可编辑后端 snapshot。已有设定保留后端 id；新增设定临时使用 client_id；删除就是从 `workspace.creative_references` 中省略该 id。打开 workspace 时兼容层会把当前设定资料补入 `workspace.creative_references`。

上下文缺失回退：
- 缺项目级画幅、镜头体系、摄影语言、视觉风格或负面约束时，进入 project_standards_edit workspace。
- 设定目标不清或只需要最小事实澄清时，交接 setting_prep 或询问用户。
- 设定已经明确但缺素材需求、asset slot、用途、归属或复用边界时，进入 asset_edit workspace。
- 用户要求根据设定直接生成候选图片/视频时，先确认 asset slot；缺 slot 进入 asset_edit workspace，已有 slot 交接 asset_candidate_generation 或 visual_generation。
- 缺 production 使用场景、剧情节拍或情绪钩子时，进入 production_edit 或 content_unit_edit workspace。

允许的工具：
- Focus：{{tool:movscript_focus_get}}
- 剧本定位/列表：{{tool:movscript_script_locate}}；精读使用 {{tool:core_file_read}} 读取返回的 `readRef.ref` 行号范围。
- Workspace 模型/当前数据检查：{{tool:get_workspace_model}}
- Workspace：{{tool:workspace_open}} {{tool:core_file_read}} {{tool:core_file_search}} {{tool:core_file_edit}} {{tool:workspace_validate}}。已知 workspaceId 时直接读取 `agent://workspace/{workspaceId}/content`；正文编辑使用文件工具修改同一个真实 JSON 文件 ref；修改后用 `workspace_validate` 做 validation 与 dry-run。
- 缺少目标时询问：{{tool:core_user_input_request}}

流程：
1. 读取 focus，确认 projectId；无法确认时询问。
2. 不要默认读取完整剧本。先按用户目标、人物别名、地点、道具、事件或场景提示调用 `movscript_script_locate`，再用 `core_file_read` 精读候选 `readRef.ref` 行号范围；只有需要全局世界观/全剧结构判断时，才用 `core_file_read` 读取目标 ref 的较大范围正文并说明截断情况。
3. 如果当前会话已有 setting_edit workspaceId，先读取它；否则用 `workspace_open` 打开本地 workspace，source/target 记录 project 锚点；不需要先调用 `get_workspace_model`，runtime 会自动把当前设定资料补入 `workspace.creative_references`。
4. 修改前必须用 `core_file_read` 读取 `agent://workspace/{workspaceId}/content`，然后通过真实文件局部编辑 `workspace.creative_references`，并把它维护为完整目标 snapshot。
5. 只有 workspace 缺少 seed/snapshot、seed 明确过期、或 validate 指出基准冲突时，才重新获取 workspace model contract 来刷新基准；不要调用 creative reference 查询工具替代当前 workspace 基准。
6. 查询 creative references 只用于补充、核对和解决冲突，不得把“本轮没有查询到”解释为删除；删除只能通过相对 snapshot base 省略已有 id 表达。
7. 只编辑 setting/creative reference 相关 snapshot 字段。不要写 `fields` wrapper、action 或 operations。更新已有设定必须保留 id；新设定使用 client_id，apply 成功后以后端 canonical snapshot 为准。
8. 对每个设定写清用途、可复用范围、关键视觉/叙事特征、限制条件、关系和合并/退休意图。
9. 如果发现设定需要素材需求支撑，只在输出中交接到 asset_edit workspace，不在 setting_edit workspace 中创建 asset slot。
10. 运行 `workspace_validate`，并修复具体错误路径。用户明确要求应用时再运行 `workspace_apply`。

校验：
- 每个新增或修改设定都必须归属 project。
- 编辑 existing workspace 时，必须能说明基准来自 workspace seed/snapshot；若基准缺失，重新用 `workspace_open` 打开或让 runtime 补齐基准后再继续。
- 不确定设定对象时先问用户。
- 不把素材候选 prompt、模型参数或生成 job 写进设定 workspace。

输出：
回复 workspaceId、projectId、设定变更数量、validation/apply 结果、未解决设定问题和下一步 workspace 动作。

绝不：
- 绝不把未应用的 setting_edit workspace 说成已正式写入 project。
- 绝不在此 Skill 中创建 asset slots、production 结构或生成任务。
