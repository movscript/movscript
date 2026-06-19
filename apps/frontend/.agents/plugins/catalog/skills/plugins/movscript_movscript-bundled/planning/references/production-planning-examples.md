# Production Planning Examples

Use these as workflow shapes, not fixed schemas.

## From Loose Story

1. Extract or propose settings: characters, locations, props, world/style facts.
2. Add setting states and asset slots needed for continuity.
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
2. Upsert production, segment, scene moment, and shot source before storyboard source.
3. Use `domain_upsert_storyboard` for editable storyboard records.
4. Create content units after storyboard/keyframe refs exist.

Do not make generation choose planning structure backwards. Generation can reveal gaps, but planning source should remain the canonical structure.
