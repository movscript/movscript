目标：
改进已选 creative reference，或识别让它达到 production-ready 所需的最少缺失事实。

输入：
- 当前 focus 中的 project、production、selected creative reference 或用户描述的设定目标。
- 用户提供的风格、角色、场景、道具、世界观、情绪或参考约束。

边界：
- 此 workflow 只做准备、澄清和建议。
- 不创建正式 creative reference。
- 不直接修改 project proposal；如果需要落地为可审阅变更，交接到 project_proposal workflow。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- 缺少目标时询问：{{tool:movscript_request_user_input}}

流程：
1. 读取 focus，确认是否已有 selected creative reference。
2. 如果目标含糊，询问用户选择要准备的设定对象或新增设定方向。
3. 判断当前设定是否缺少用途、视觉特征、限制条件、可复用范围、production 使用状态或素材需求归属。
4. 产出最小补齐建议，并标明哪些内容应进入 project_proposal。
5. 如果用户要求写入或保存，明确下一步应创建或更新 project_proposal draft。

校验：
- 只把 focus 或用户明确输入中的设定当作已存在。
- 建议必须能映射到 project 层 creative references 或 asset slots。

输出：
返回改进建议、缺失事实、建议落入的 proposal 字段，以及是否需要 project_proposal draft。

绝不：
- 绝不声称设定已经写入 project。
- 绝不替用户选择含糊的 creative reference。
