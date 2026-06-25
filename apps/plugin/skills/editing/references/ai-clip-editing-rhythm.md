# AI Clip Editing Rhythm

Use this reference when assembling generated clips, Seedance-like source material, multi-shot outputs, trailers, social clips, product ads, music videos, or any timeline made from AI-generated video candidates.

Generation creates source clips. Editing turns them into a watchable piece.

## Core Idea

Editing rhythm is the pattern of information density over time. Do not cut only by instinct. Pick a rhythm formula, then place clips, trims, transitions, and audio around that formula.

AI-generated clips need extra care because their starts/ends, color, motion, and tiny details are often less stable than live-action footage.

## Choose a Formula

### Breathing

Pattern:

```text
short, short, short, long
```

Use for:

- daily videos;
- travel;
- product use demonstrations;
- calm explainers;
- soft brand pieces.

Timeline guidance:

- Use short clips for details or movement.
- Use the long clip for a stable slow push, wide shot, or emotional hold.
- Good default when the user has no strong rhythm preference.

### Heartbeat

Pattern:

```text
steady beat, steady beat, then faster cuts
```

Use for:

- suspense;
- chase;
- sports;
- countdowns;
- tension buildup.

Timeline guidance:

- Start with 1-2 second cuts.
- Accelerate into 0.5-0.8 second cuts near the climax.
- Prefer same-scene or visually related clips so the viewer does not lose orientation.

### Wave

Pattern:

```text
small, medium, large, peak, calm
```

Use for:

- emotional stories;
- music videos;
- brand films;
- reveals;
- character arcs.

Timeline guidance:

- Build shot scale or intensity gradually.
- A useful visual sequence is wide -> medium -> close-up -> extreme detail -> quiet wide.
- End with a calmer shot so the emotion lands.

### Bullet Time

Pattern:

```text
normal speed -> slow-motion detail -> sudden impact
```

Use for:

- product reveal;
- action climax;
- sports highlight;
- decisive transformation.

Timeline guidance:

- Hold the slow-motion/detail section long enough for anticipation.
- Cut sharply on the impact.
- Use sound design or a short silence before impact when possible.

### Pulse

Pattern:

```text
very short cuts increasing in density -> held payoff
```

Use for:

- promos;
- trailers;
- fast social ads;
- launch moments;
- high-energy music edits.

Timeline guidance:

- Use 0.2-0.6 second clips in the buildup.
- Each cut should add a new visual idea.
- Hold the final payoff longer to let the viewer register it.

### Silent Hammer

Pattern:

```text
long quiet hold -> short strike -> longer quiet hold -> stronger strike
```

Use for:

- luxury;
- horror;
- avant-garde;
- minimalist product films.

Timeline guidance:

- Quiet holds still need micro-motion: dust, light drift, hand tremor, wind, reflection, or breathing.
- The strike should be visually strong and brief.
- Avoid filling every second with motion.

## AI Clip-Specific Rules

### Trim Starts and Ends

AI clip openings and endings often show unstable camera startup, pose settling, or awkward stopping.

Default:

- Trim 0.5-1.0 seconds from the start and end of each generated clip when the source allows it.
- Keep untrimmed starts/ends only when the first/last frame is intentionally used as a visual anchor.

### Generate and Select Extra Material

If the final target is 30 seconds, source generation should usually produce more than 30 seconds of candidates. Pick the stable middle sections.

Do not force every generated clip into the timeline just because it exists.

### Color and Style Match

AI-generated clips from the same prompt can still vary in exposure, contrast, color temperature, saturation, and atmosphere.

Editing plan:

1. Choose a visual baseline clip.
2. Match other clips toward that baseline with color temperature, exposure, saturation, LUT, or transition choices.
3. Prefer clips with similar lighting direction for continuity.
4. If color matching is not available, group mismatched clips into deliberate montage sections.

### Hide Minor AI Artifacts

Use:

- faster cuts for clips with small hand/face/object glitches;
- wider shots when close-ups are unstable;
- cutaways over malformed motion;
- transitions through blur, flash, foreground occlusion, or fast movement.

Do not hide a severe identity, safety, or story-breaking failure. Reject or regenerate that source.

### Transition Deliberately

Choose transitions for a reason:

- Hard cut: similar composition, action continuity, punchy social rhythm.
- Match cut: shared shape, movement, color, pose, or product geometry.
- Cross dissolve: memory, dream, gentle emotion, time passing.
- Flash/black frame: time jump, shock, chapter break.
- Whip/zoom transition: energy, pulse edits, action.

Avoid decorative transitions that do not solve a continuity or rhythm problem.

### Sync Audio Late

For music-synced clips:

- Generate or choose visual source material first.
- Place the strongest visual hits on beats.
- Keep dialogue and subtitles readable by leaving enough time on screen.
- If model generation cannot follow audio precisely, solve beat sync in editing, not in the generation prompt.

## Timeline Planning Checklist

Before mutating the timeline:

- What is the target duration and aspect ratio?
- Which rhythm formula is the primary structure?
- Which clip is the visual/color baseline?
- Which source clips are stable enough to use?
- Which clips need start/end trims?
- Where is the first two-second hook?
- Where is the climax or payoff?
- Which transition type is justified at each cut?
- Does the timeline need subtitles, voiceover, music, or sound effects?

## MovScript Workflow Notes

- Register selected source resources as editing assets before placing clips.
- Use `editing_timeline_update_clip` for trim, duration, placement, volume, opacity, fit, text, and metadata adjustments.
- Use `editing_timeline_split_clip`, `editing_timeline_move_clip`, and `editing_timeline_delete_clip` for rhythm changes after initial placement.
- Use `editing_timeline_apply_commands` when a rhythm formula requires several coordinated timeline mutations.
- Run `editing_timeline_validate` after meaningful timeline edits.
- Render/export/import are still explicit separate steps; do not create or adopt a content candidate merely because an edit rendered successfully.

## Review Gate

Before render:

- The timeline has a named rhythm formula or an explicit reason for freeform editing.
- AI clip starts/ends have been reviewed for unstable frames.
- Color/style mismatch is either corrected or intentionally structured.
- Transitions solve continuity, rhythm, or story problems.
- The first two seconds contain a hook when the output is promotional or social.
- Subtitles, text overlays, music, and voiceover have enough timing space.
- Candidate creation/adoption remains an explicit user/workflow decision after export.
