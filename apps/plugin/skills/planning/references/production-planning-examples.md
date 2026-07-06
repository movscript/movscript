# Production Planning Examples

Use these as workflow shapes, not fixed schemas.

## From Loose Story

1. Extract or propose reusable references only for concrete screenplay/production entities to make or reuse: characters/persons, scene places/spaces/sets, props, instruments, costumes, voice identities, or similar production objects. When a script heading says "场景" as a place, map it internally to `setting`, not `scene_moment`.
2. Add setting states as named namespaces under those settings, then add asset slots such as front view, side view, material reference, voice timbre, or instrument tone only when continuity needs them.
3. Create a production and segment structure.
4. Create short story beats as narrative/action events that happen in those places.
5. Add concrete shot, dialogue, narration, subtitle, sound, music, or ambience materials under story beats only when needed.
6. Add shot plans for camera units only when needed.
7. Add 关键帧 and 分镜图 under shots only when visual anchoring is needed.
8. Add internal output tasks for outputs that need stable task anchors.
9. Inspect/review, fix issues, interpret at each coherent boundary.

## From Existing Script

1. Read script source.
2. Snapshot script version and script blocks if downstream entities need stable script refs.
3. Map blocks to short story beats and concrete materials.
4. Plan shots/关键帧/分镜图 from the story beats.
5. Add internal output tasks only after the upstream planning context is stable enough.

## From Shot Reference Or Storyboard Material

1. Query existing production context and shot references.
2. Upsert the needed timeline namespace projection, scene moment, and visual expression/legacy shot source before storyboard source. Current tools may write `production` / `segment` records for the namespace projection.
3. Use `domain_upsert_storyboard` for editable storyboard records.
4. Create internal output tasks after 分镜图/关键帧 refs exist.

Do not make generation choose planning structure backwards. Generation can reveal gaps, but planning source should remain the canonical structure.
