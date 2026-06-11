# Shot Imitation Workflow

Use this when the user explicitly asks to mimic, imitate, recreate, follow, or reference a specific shot, video clip, commercial, film segment, or uploaded video.

Do not jump directly from "imitate this shot" to generation. First analyze the reference.

## Workflow

1. Confirm whether the user wants a simple imitation video or wants the reference shot integrated into a reusable project.
2. Resolve or upload the reference video as a MovScript RawResource when needed.
3. Extract frames across the full reference clip. Do not rely only on the first and last frame.
4. Analyze:
   - shot size and composition,
   - camera motion and rhythm,
   - subject blocking and position changes,
   - lighting and color,
   - key visual moments,
   - transitions or timing beats.
5. Write the analysis into upstream structure: `shot`, `storyboard`, and `keyframe`.
6. Generate or assemble storyboard panels from the frame analysis.
7. Create a content unit for storyboard-panel upload/candidate/selection.
8. Write the storyboard-panel candidate.
9. Ask the user to select or confirm the storyboard-panel result.
10. Only after selection, use the selected storyboard panels as stable dependency for downstream video generation.

## Content Unit Type

If no specialized adapter exists yet, use a clearly named generic type such as `storyboard_panel_ref` or `storyboard_upload_ref`.

When using a generic type, state that it is a storyboard-panel upload/selection slot, not the final video-generation slot. Generic slots may not have full interpreter dependency tracking until a specialized adapter exists.

## Stop Conditions

Stop and explain the missing prerequisite when:

- the reference video cannot be read or uploaded,
- frame extraction is unavailable,
- the user has not selected required storyboard-panel candidates,
- downstream generation depends on unselected upstream content units.
