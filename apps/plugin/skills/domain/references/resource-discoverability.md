# Resource Discoverability

Use this reference whenever generated, imported, uploaded, transformed, rendered, or external artifacts become MovScript Resources or content candidates.

## Core Rule

Saving the file is not enough. Each preserved artifact should be findable later by a creative user: what it is, where it belongs, why it was made, whether it is usable, and what created it.

When a tool supports metadata, labels, title, description, candidate payloads, or provenance fields, fill them. When the upload path does not expose metadata, preserve the same information on the candidate, editing result, user-facing summary, or nearest available record.

## Minimum Description

For each materialized artifact, preserve as many of these as are known. Prefer concrete creative labels over internal bucket names.

- User-readable title.
- Purpose: character/person reference, location/scene-space reference, prop/costume, style reference, 分镜图, 关键帧, scene clip, shot image/video, dialogue voice, narration voice, music, sound effect, ambience, subtitle, edit export, preview, diagnostic, or failed attempt.
- Project placement: project, production/timeline area, story beat, shot, dialogue/narration, subtitle, sound/music cue, 分镜图, 关键帧, reusable asset slot, or internal output task when no clearer placement exists.
- Status: chosen, generated option, deferred, rejected-but-saved, draft, exploratory, reference-only, final export, or diagnostic.
- Version/variant: batch index, generation attempt, edit revision, provider/model, or external node.
- Provenance: prompt snapshot, source resource ids, selected upstream references, model/provider/tool, job id, external URL/node, parent resource ids, and user decision reason.

Do not invent certainty. If placement or status is unknown, mark it as exploratory or unscoped rather than forcing it into a production target.

In ordinary replies, say "素材库里的素材", "生成结果", "采纳/放弃/待定", "分镜图", and "关键帧". Keep `RawResource`, `candidate`, `content unit`, and ids for debug or tool-facing notes only.

## Naming Pattern

Prefer short production names:

```text
[subject/place/beat] - [purpose or visual/audio state] - [version/status]
```

Examples:

- `老张 - 基础正脸参考 - 候选2`
- `老张厨房 - 雨夜窗边氛围 - 风格参考`
- `玉玺道具 - 金属纹理近景 - 待定`
- `第一场相遇 - 开场推镜分镜 - v03`
- `主角旁白 - 温和低声 - 采纳`
- `片头粗剪 - 30秒竖版 - 导出v01`
- `废弃但保留 - 人物表情过度夸张`

Use English if the project is English-language; otherwise use the user's project language.

## Status Notes

- `rejected-but-saved` means do not use this version now, but it remains useful for comparison, diagnosis, or future reference. Tell users "放弃这版，但素材还保留".
- `deferred` means the user has not decided yet. Tell users "先留着，暂不采用".
- `reference-only` means the artifact can guide style, mood, lighting, composition, or sound but is not the selected output.
- `diagnostic` means the artifact helps inspect a video, prompt, or failure, such as contact sheets, extracted frames, provider result JSON, or logs.

## Batch And Failed Outputs

- For batch outputs, preserve each artifact with an index and a visible/audio distinction when known.
- For weak or failed creative outputs, still give a useful reason: `人物不像`, `动作错误`, `风格偏卡通`, `镜头不稳`, `字幕错位`, or `声音不合适`.
- Do not label everything "bad" or "failed"; name the failure so future regeneration can use it as evidence.

## User-Facing Summary

When reporting saved artifacts, say the practical result:

```text
我把这批结果都保存进项目素材库了。最有用的是候选2；候选1人物不像，候选3镜头还可以但表情偏夸张，所以我建议先采纳候选2，另外两版先保留作参考。
```
