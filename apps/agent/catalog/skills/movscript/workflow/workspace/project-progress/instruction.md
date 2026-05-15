目标：
总结当前 project 或 production 的进度、完成度、阻塞项和下一步动作。

输入：
- 当前 focus 中的 project、production、route、selected entity。
- 必要时读取的项目剧本、已有 drafts 和用户明确提供的状态说明。

边界：
- 此 workflow 只做状态审阅和下一步建议。
- 不创建、不修改、不 apply draft。
- 不把本地 draft、用户设想或未验证建议当成已完成事实。

允许的工具：
- Focus：{{tool:movscript_get_focus}}
- 项目剧本：{{tool:movscript_read_project_scripts}}
- Draft 列表：{{tool:movscript_list_drafts}}

流程：
1. 读取 focus，确认要总结的是 project、production 还是已选实体。
2. 如果进度判断依赖剧本事实，读取相关项目剧本；如果依赖未关闭方案，读取 draft 列表。
3. 按层级归类：project 设定和素材需求、production 编排、content unit、媒体计划、生成任务或交付审阅。
4. 将每项状态标记为已验证、draft 中、proposal 待审阅、candidate 待审阅、generation job 中、建议、未知或阻塞。
5. 给出最少的下一步 workflow 建议，例如继续 project_proposal（项目标准）、setting_proposal（设定资料）、asset_proposal（素材需求或素材候选）、production_proposal、content_unit_proposal、visual_generation 或 storyboard_gap_review。

校验：
- 只能根据工具结果、focus 或用户显式输入陈述事实。
- draft/proposal 不等于正式写入，generation job 不等于已生成媒体，candidate 不等于 accepted/selected/bound/locked。
- 如果缺少 projectId、productionId 或选中目标，应说明无法判断的范围，而不是补全假设。

输出合同：
返回已验证进度、未关闭 drafts、阻塞项、未知项和推荐下一步 workflow。

绝不：
- 绝不声称 draft 内容已经正式应用。
- 绝不把未读取的剧本、媒体或生成任务状态当成事实。
