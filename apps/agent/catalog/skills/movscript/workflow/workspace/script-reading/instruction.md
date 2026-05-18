目标：
读取并解释后端项目剧本 / Script，包括总剧本、分集剧本、第一集和正文内容。

核心边界：
- Script / 剧本是后端项目数据；Draft 是 Agent 本地审阅 artifact。
- 用户说“剧本草稿”“总剧本草稿”“第一集草稿”时，除非明确给出本地 Agent draftId，优先按后端剧本处理。
- 不要用 `movscript_get_draft` 读取剧本；不要把后端剧本 ID 当成本地 draftId。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- 项目剧本：{{tool:movscript_read_project_scripts}}
- 缺 projectId 或剧本选择时询问：{{tool:movscript_request_user_input}}

流程：
1. 先读取 focus，确认当前 projectId；如果没有当前项目且用户没给 projectId，问一个窄问题。
2. 如果用户给了剧本 ID，调用 `movscript_read_project_scripts`，传 `projectId`、`scriptId`，需要正文时传 `includeContent: true`。
3. 如果用户给了标题，例如“总剧本”“第一集”，调用 `movscript_read_project_scripts`，传 `scriptTitle` 和 `includeContent: true`。
4. 如果用户只说“查看剧本”或“有哪些剧本”，先读取列表，不带正文或使用较小 `limit`；如果下一步要理解剧情，再读取目标剧本正文。
5. 如果工具返回 `matched: 0` 或 `returned: 0`，重新列出同项目可用剧本，不要改用 `movscript_get_draft`。

输出：
- 说明来源是后端项目剧本工具结果。
- 给出 projectId、scriptId、标题、是否包含正文、是否截断。
- 只基于工具结果总结剧情、人物、台词或结构；正文未读取时不要声称已理解内容。
