# 内容区数据库收敛

当前内容区以语义实体为准，不再兼容旧的分集、分场、分镜、镜头生产链表。

## 已清理旧表

迁移 `000025_remove_v1_production_entities` 和 `000026_content_zone_semantic_tables` 会删除：

- `final_videos`
- `shots`
- `storyboards`
- `episode_scenes`
- `scene_setting_refs`
- `scenes`
- `episode_setting_refs`
- `episodes`

这些表对应旧版「分集 -> 分场 -> 分镜 -> 镜头 -> 成片」链路。内容区页面改走语义实体表和 `/projects/:id/entities/...` 接口。

## 内容区新表

- 片段：`segments`
- 情节：`scene_moments`
- 内容：`content_units`
- 资料：`creative_references`、`creative_reference_states`
- 关系：`creative_reference_usages`、`creative_relationships`
- 素材：`asset_slots`、`asset_slot_candidates`
- 结构化分镜与预演：`storyboard_scripts`、`storyboard_versions`、`storyboard_lines`、`keyframes`、`preview_timelines`、`preview_timeline_items`

`scripts`、`script_versions`、`raw_resources`、`resource_bindings` 仍作为源文本和资源文件基础表保留。旧 `assets` / `asset_views` 会迁移到 `asset_slots` / `asset_slot_candidates` 后删除。

## 槽与候选

内容区按“槽 -> 候选 -> 最终目标”理解：

- 内容单元本质是内容槽，状态可停留在 `candidate`，确认后再进入 `confirmed`、`in_production` 或 `locked`。
- 素材本质是素材槽，`asset_slots` 表示缺口、候选素材或已锁定素材，`asset_slot_candidates` 记录某个素材槽下有哪些候选。
- 内容单元的候选目标可以同时存在：关键帧、画面、语音、字幕。当前页面用 `keyframes` 与关联的 `asset_slots` / `asset_slot_candidates` 汇总这四类目标，不额外引入并行候选表。
- 候选采纳、拒绝、返工等动作统一写入 `candidate_decisions`，其中 `candidate_type` 可包含 `content_unit`、`keyframe` 和 `asset_slot_candidate`。
