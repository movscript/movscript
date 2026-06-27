# Production Planning Examples

Use these as workflow shapes, not fixed schemas.

## From Loose Story

1. Extract or propose settings only for concrete film/music entities to make or reuse: characters, props, places, instruments, costumes, voice identities, or similar production objects.
2. Add setting states as named namespaces under those settings, then add asset slots such as front view, side view, material reference, voice timbre, or instrument tone only when continuity needs them.
3. Create a production and segment structure.
4. Create scene moments as narrative events.
5. Add expression units and audio cues under scene moments.
6. Add shots for camera units.
7. Add keyframes and storyboards under shots.
8. Add content units for outputs that need stable task anchors.
9. Inspect/review, fix issues, interpret at each coherent boundary.

## From Existing Script

1. Read script source.
2. Snapshot script version and script blocks if downstream entities need stable script refs.
3. Map blocks to scene moments and expression units.
4. Plan shots/keyframes/storyboards from the scene moments.
5. Add content units only after the upstream planning context is stable enough.

## From Shot Reference Or Storyboard Material

1. Query existing production context and shot references.
2. Upsert the needed timeline namespace projection, scene moment, and visual expression/legacy shot source before storyboard source. Current tools may write `production` / `segment` records for the namespace projection.
3. Use `domain_upsert_storyboard` for editable storyboard records.
4. Create content units after storyboard/keyframe refs exist.

Do not make generation choose planning structure backwards. Generation can reveal gaps, but planning source should remain the canonical structure.
