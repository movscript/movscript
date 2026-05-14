目标：产出或编辑一个本地 setting_proposal draft，作为 project 层 creative_references 的可审阅提案。

Draft schema：{{schema:movscript.setting_proposal.v1.id}}

{{schema:movscript.setting_proposal.v1}}

边界：
- 只维护设定资料：人物、地点、道具、产品/品牌、风格、世界规则、时代背景、限制条件、关系和合并候选。
- 不写素材需求 asset_slots；素材需求使用 asset_proposal。
- 不写候选图方案、prompt、模型参数或生成任务；素材候选使用 asset_proposal。
- 不写 production segments、scene moments 或 content units。

流程：
1. 读取 focus，确认 projectId。
2. 获取 setting_proposal 的 DraftDomainModel。
3. 查找或创建 setting_proposal draft，source/target 记录 project 锚点。
4. 修改前读取 draft；只 patch proposal.creative_references，proposal.asset_slots 保持空数组。
5. Validate；支持 preview_apply 时运行 preview apply 并修复错误。

输出：
回复 draftId、projectId、draft status、设定变更数量、validation/preview 状态和未解决设定问题。
