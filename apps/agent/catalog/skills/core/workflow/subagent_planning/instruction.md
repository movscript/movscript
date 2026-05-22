目标：
在 planner run 中判断是否需要 subagents，并把适合并行、隔离或耗时等待的工作派发成有边界、可等待、可综合的 subagent runs。

适用场景：
- 用户明确要求创建 subagent、worker、并行分工或把部分工作交给子 agent。
- 任务可分解为多个互不冲突的子任务。
- 子任务需要并行执行、隔离上下文或可能长于一个 run。
- 主 planner 可以继续处理非阻塞工作，并在 worker 结果返回后综合。

边界：
- 简单、单上下文、立即阻塞的任务由 planner 自己完成。
- 大任务应先由 planner 维护执行计划；subagent 不是计划本身，也不是所有计划任务的默认执行方式。
- Subagent 是正交协作模式：一个计划可以完全由 planner 执行，也可以在部分步骤混用 subagents。
- 用户明确授意使用 subagent 时，优先遵循用户意图；agent 自己的“是否必要”判断低于用户指令。若工具不可用、权限不足、边界不清或存在冲突风险，先说明并收窄任务或询问。
- 用户明确要求不用 subagent、不要并行或由 planner 自己处理时，不要主动创建 subagent。
- Subagents 只执行被派发的 scoped run instructions。
- Planner 仍负责计划维护、最终综合、依赖决策、阻塞判断和面向用户的完成说明。
- Subagent 是 `kind:"subagent_run"` 的 runtime work：用 `core_work_start` 创建，用 `core_work_get/list/wait` 观察，用 `core_work_cancel` 取消。启动、观察、完成、失败或取消 subagent 后，应同步反映到当前执行计划或进度清单中。
- 每个 subagent 应使用短的人类可读英文 subagentName，例如 Einstein、Turing、Curie、Newton、Darwin。名字由 planner 根据任务决定；不要使用 worker、subagent、agent、task 这类泛称。后续 wait/cancel 必须使用工具返回的精确名称。

允许的工具：
- {{tool:core_work_start}}
- {{tool:core_work_get}}
- {{tool:core_work_list}}
- {{tool:core_work_wait}}
- {{tool:core_work_cancel}}
- {{tool:core_user_input_request}}

流程：
1. 先读取用户指令：若用户明确要求使用 subagent/worker/并行分工，应按该意图派发；若用户没有明确授意，再判断当前计划中的哪些步骤真的需要 subagent。
2. 若下一步依赖某个结果且用户没有要求派发，planner 应优先自己完成该阻塞任务。
3. 若需要或被要求派发，用 `core_work_start` 启动 subagent work：`kind:"subagent_run"`，`request` 必须包含清晰任务说明、期望输出、写入边界和是否允许工具写入。
4. 派发 subagents 时，为每个 run 提供明确英文人名 `subagentName`；多 worker 用多次 `core_work_start`，并用同一 `continuationPolicy.groupId` 归组。
5. 派发后，更新当前执行计划或进度清单，标明哪些步骤由 planner 执行、哪些步骤等待 subagent。
6. 用 `core_work_start/list/get` 返回的精确 workId 调用 wait/cancel；不要用 worker、subagent 这种猜测名称。
7. 用 `core_work_get/list/wait` 检查结构化 run status、blockers 和 artifacts；不要从自然语言聊天推断 child agent 进度。
8. wait 返回 pending 时，继续其他独立工作或报告 subagent 仍在执行，不要假装 subagent 已完成；无需反复 wait 来模拟回调，带 continuationPolicy 的 work 完成后 runtime 会回调 planner。
9. wait 返回 failed、cancelled、blocked 或 needs_review 时，根据返回的 target 决定更新计划、派发替代 subagent、取消过期 work 或向用户询问缺失输入。

输出：
说明当前计划状态、planner 自己完成了什么、哪些 subagents 被派发或等待、每个相关 subagent 的最新状态、阻塞项、产物引用、仍需人工决策的事项和最终综合结论。

绝不：
- 不要为单步、单上下文、无需并行的任务创建 subagent。
- 不要在 subagent 未完成时声称其结果已经可用。
- 不要依赖自然语言猜测状态；以工具返回的结构化 run snapshot 为准。
