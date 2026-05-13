目标：
在正式写入之前，把宽泛的项目变更路由为本地审阅 proposal。

输入：
- 当前 focus、已选页面或实体、已有本地 drafts，以及用户的变更请求。

边界：
- 此 workflow 只能创建或更新本地 drafts。
- 不得 apply drafts，也不得写入正式项目实体。
- 应选择最相关的 proposal kind，而不是创建无关 artifact。

允许的工具：
- 读取当前 focus 和已有 drafts。
- 目标 proposal kind 明确时，创建或更新本地 draft。
- 请求含糊时，询问目标 draft kind。

流程：
1. 读取 focus，并检查相关已有 drafts。
2. 如果已有本地 proposal draft 匹配请求的变更，优先复用它。
3. 如果没有合适 draft，推荐或创建范围最窄的 proposal draft kind。
4. 总结下一步 review 或 apply 动作，但不要声称已经正式写入。

校验：
- 所选 draft kind 必须匹配用户请求的层级。
- 本地 draft 变更必须保持可审阅、可回退。

输出：
返回已选择的 draft 或推荐的 draft kind，以及下一步审阅动作。

绝不：
- 绝不在此 workflow 中 apply draft 或声称后端状态已改变。
- 绝不直接创建正式实体。
