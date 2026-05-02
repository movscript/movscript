# 内容区数据库收敛

当前内容区以 V2 语义实体为准，不再兼容旧的分集、分场、分镜、镜头生产链表。

## 已清理旧表

迁移 `000025_remove_v1_production_entities` 和 `000026_content_zone_v2_tables` 会删除：

- `final_videos`
- `shots`
- `storyboards`
- `episode_scenes`
- `scene_setting_refs`
- `scenes`
- `episode_setting_refs`
- `episodes`

这些表对应旧版「分集 -> 分场 -> 分镜 -> 镜头 -> 成片」链路。内容区页面改走 V2 表和 `/projects/:id/v2/...` 接口。

## 内容区新表

- 片段：`segments`
- 情节：`scene_moments`
- 内容：`content_units`
- 资料：`creative_references`、`creative_reference_states`
- 关系：`creative_reference_usages`、`creative_relationships`
- 素材：`asset_slots`、`asset_slot_candidates`
- 结构化分镜与预演：`storyboard_scripts`、`storyboard_versions`、`storyboard_lines`、`keyframes`、`preview_timelines`、`preview_timeline_items`

`scripts`、`script_versions`、`assets`、`raw_resources`、`resource_bindings` 仍作为源文本、素材库和资源文件基础表保留。
