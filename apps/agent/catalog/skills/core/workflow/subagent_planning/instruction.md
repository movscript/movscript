目标：
在 planner run 中判断是否需要 subagents，并把可并行、可隔离或耗时的工作拆成有边界、可等待、可综合的 subagent runs。

适用场景：
- 任务可分解为多个互不冲突的子任务。
- 子任务需要并行执行、隔离上下文或可能长于一个 run。
- 主 planner 可以继续处理非阻塞工作，并在 worker 结果返回后综合。

边界：
- 简单、单上下文、立即阻塞的任务由 planner 自己完成。
- Subagents 只执行被派发的 scoped run instructions。
- Planner 仍负责最终综合、依赖决策、阻塞判断和面向用户的完成说明。
- Subagent 是 runtime 内部的可等待 run：spawn 创建，list/wait 观察，cancel 取消。它和 progress checklist、task graph 是不同层；不需要先创建 task graph，也不通过 `core_operation_start` 创建。
- 每个 subagent 应使用短的人类可读英文 subagentName，例如 Einstein、Turing、Curie、Newton、Darwin。名字由 planner 根据任务决定；不要使用 worker、subagent、agent、task 这类泛称。后续 wait/cancel 必须使用工具返回的精确名称。

允许的工具：
- {{tool:core_subagent_spawn}}
- {{tool:core_subagent_list}}
- {{tool:core_subagent_wait}}
- {{tool:core_subagent_cancel}}
- {{tool:core_user_input_request}}

流程：
1. 判断任务是否真的需要 worker。若下一步依赖某个结果，planner 应优先自己完成该阻塞任务。
2. 直接用 `core_subagent_spawn` 启动 subagents。spawn 输入必须包含清晰的任务说明、期望输出、写入边界和是否允许工具写入。
3. 派发或重新派发 subagents 时，为每个 run 提供明确英文人名 subagentName 或 subagentNames，并用 maxWorkers 控制并发，用 workerTimeoutMs 取消过期 active workers。
4. 派发后，用 spawn/list 返回的精确 subagentName 或 runId 调用 wait/cancel；不要用 worker、subagent 这种猜测名称。
5. 用 list/wait 工具检查结构化 run status、blockers 和 artifacts；不要从自然语言聊天推断 child agent 进度。
6. wait 返回 pending 时，继续其他独立工作或报告 subagent 仍在执行，不要假装 subagent 已完成。
7. wait 返回 failed、cancelled、blocked 或 needs_review 时，根据返回的 target 决定派发替代 subagent、取消过期工作或向用户询问缺失输入。

输出：
说明 planner 自己完成了什么、哪些 subagents 被派发或等待、每个相关 subagent 的最新状态、阻塞项、产物引用、仍需人工决策的事项和最终综合结论。

绝不：
- 不要为单步、单上下文、无需并行的任务创建 subagent。
- 不要在 subagent 未完成时声称其结果已经可用。
- 不要依赖自然语言猜测状态；以工具返回的结构化 run snapshot 为准。
