# Agent Skills

MovScript agent skills follow the same progressive-disclosure shape as Codex
skills:

- A skill is a directory.
- The entrypoint is `SKILL.md`.
- The frontmatter is the lightweight index.
- The Markdown body is the behavior contract loaded only when the skill is
  activated or explicitly inspected.
- Extra `references/`, `scripts/`, and `assets/` directories are optional and
  should be loaded only when the active skill needs them.

## Recommended Layout

```txt
agent-skills/
  director-jiangwen/
    SKILL.md
    references/
      dialogue.md
      camera.md
    assets/
    scripts/
```

## Minimal SKILL.md

```md
---
name: Jiang Wen style director
description: Use when the user needs black humor, tense character conflict, absurd realism, and pressure-heavy dialogue in a Jiang Wen inspired style.
---

# Jiang Wen style director

Use absurd realism, power games, dense dialogue rhythm, and staging that keeps
characters under visible pressure.
```

`name` and `description` are the required Codex-compatible fields. MovScript
will generate a stable catalog id from the skill path when `id` is omitted.

## MovScript Extensions

Use optional fields only when they help routing or conflict management:

```md
---
id: studio.director.jiangwen
name: Jiang Wen style director
description: Use when the user needs black humor, tense character conflict, absurd realism, and pressure-heavy dialogue.
kind: persona
tags: [director, style, chinese-cinema]
aliases: [jiangwen, let-the-bullets-fly]
useWhen:
  - black humor
  - tense dialogue
load: on_demand
scope: run
conflicts: [studio.director.marvel]
---
```

Supported extensions:

- `id`: stable catalog id. Optional for standalone local skills.
- `kind`: `persona`, `workflow`, `policy`, or `expertise`. Defaults to
  `expertise`.
- `tags`: short routing labels.
- `aliases`: user-facing names that should find this skill.
- `useWhen`: natural-language routing hints.
- `load`: `core`, `on_demand`, or `manual`. Defaults to `on_demand`.
- `scope`: `turn`, `run`, or `thread`.
- `dependencies`: other skill ids that should accompany this skill.
- `conflicts`: mutually exclusive skill ids.
- `toolRefs` and `schemaRefs`: advanced fields for workflow skills.

## Plugin Contribution

Plugins should expose skills with a low-friction contribution:

```json
{
  "contributes": {
    "agentSkills": [
      {
        "path": "agent-skills/director-jiangwen"
      }
    ]
  }
}
```

The path must point to a directory containing `SKILL.md`, or directly to a
`SKILL.md` / `*.skill.md` file.

## Runtime Behavior

The agent keeps three separate states:

- Installed: the skill exists in the catalog index.
- Available: a profile or catalog inspection can discover it.
- Active: the skill body is included in the current run context.

Core skills may be active by default. Specialist skills should normally use
`load: on_demand` so their full body stays out of the prompt until selected.

The runtime exposes `movscript_update_active_skills` for same-run switching:

```json
{
  "load": ["studio.director.jiangwen", "studio.expertise.action"],
  "unload": ["studio.director.marvel"],
  "reason": "The user asked for a Jiang Wen inspired action scene."
}
```

The tool stores the requested skill state on the run. The next model turn
refreshes runtime layers and includes the requested skill bodies when the ids
exist in the captured catalog snapshot.

Declared `dependencies` are expanded automatically when loading a skill. Declared
`conflicts` are enforced by default: if a request would load mutually exclusive
skills, the runtime returns `status: "conflict"` and `requiresUserInput: true`
without writing the conflicting skill state. The agent should then ask the user
which style or specialist to use, usually with `movscript_request_user_input`.

## Trace Contract

Skill state is recorded as `kind: "skill"` trace events. The current setup event
keeps the legacy `eventType: "trigger.evaluated"` field and adds:

```json
{
  "skillEventType": "skill.state_resolved",
  "activeSkillIds": [],
  "loadedSkillIds": [],
  "availableSkillIds": []
}
```

UI views should use `skillEventType` for skill-state timelines and retain
`eventType` for backward-compatible run debugging.

Explicit skill update tool calls return `eventType: "skill.state_requested"` in
their result payload. The following context refresh emits `skill.state_resolved`.
