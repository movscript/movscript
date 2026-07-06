# Shot Imitation Workflow

Use this when the user explicitly asks to mimic, imitate, recreate, follow, or reference a specific shot, video clip, commercial, film segment, or uploaded video.

Do not jump directly from "imitate this shot" to generation. First analyze the reference.

## Workflow

1. Confirm whether the user wants a simple imitation video or wants the reference shot integrated into a reusable project.
2. Resolve or upload the reference video as a MovScript RawResource when needed.
3. Extract frames across the full reference clip for visual inspection with `system_resource_video_extract_frames`. Do not rely only on the first and last frame.
4. Analyze:
   - shot size and composition,
   - camera motion and rhythm,
   - subject blocking and position changes,
   - lighting and color,
   - key visual moments,
   - transitions or timing beats.
5. When the reference frames should condition downstream image/video generation, materialize them with `system_resource_video_extract_frame_to_resource` or `system_resource_video_extract_frames_to_resources`. Use `system_resource_video_contact_sheet_to_resource` when an overview image is useful.
6. Write the analysis into upstream structure for shot intent, 分镜图, and 关键帧.
7. Generate or assemble 分镜图 from the frame analysis and materialized RawResources.
8. Create a `storyboard_ref` internal output task for 分镜图 when possible, or a 分镜图 upload output task when a generic slot is needed.
9. Write the 分镜图 candidate.
10. Ask the user to select or confirm the 分镜图 result.
11. Only after selection, use the selected 分镜图 as stable dependency for downstream video generation.

## Content Unit Type

Prefer `storyboard_ref` for 分镜图. If a workflow needs a looser upload/selection slot that the specialized adapter does not cover, use a clearly named generic type such as `storyboard_panel_ref` or `storyboard_upload_ref`.

When using a generic type, state that it is a 分镜图 upload/selection slot, not the final video-generation slot. Generic slots may not have full interpreter dependency tracking until a specialized adapter exists.

## Stop Conditions

Stop and explain the missing prerequisite when:

- the reference video cannot be read or uploaded,
- frame extraction is unavailable,
- required reference frames or contact sheets were not materialized as RawResources for generation,
- the user has not selected required 分镜图 candidates,
- downstream generation depends on unselected upstream output tasks.
