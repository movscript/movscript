# MovScript Agent Skills and Tools

This document is the operating contract for the first runnable MovScript Agent loop. It keeps one model path and focuses on predictable platform behavior before model-role routing is introduced.

## Runtime Loading

The agent loads skill and tool metadata at startup from two layers:

1. Built-in catalog in `apps/agent/catalog/skills` and `apps/agent/catalog/tools`.
2. Local override catalog from `MOVSCRIPT_AGENT_SKILLS_DIR` and `MOVSCRIPT_AGENT_TOOLS_DIR`, or the state-path derived `.movscript-agent/skills` and `.movscript-agent/tools` directories.

Local files with the same skill id or tool name override built-in files. This lets development and plugins extend behavior without changing the shipped baseline.

## Default Skills

`movscript.platform.concepts`

Teaches the agent the production domain: project, script, setting, asset, episode, scene, storyboard, shot, and pipeline node. It instructs the agent to read/search before making project claims.

`movscript.workflow.safe-drafts`

Makes drafts the default write path. The agent should create local draft artifacts for proposed scripts, settings, storyboards, shots, prompts, reviews, and planning notes instead of directly changing formal project data.

`movscript.intent.project-progress`

Activates for project progress and missing-work requests. The expected answer shape is confirmed facts, gaps, and next actions.

`movscript.intent.storyboard-gap-review`

Activates for scene, storyboard, and shot review. The agent should read referenced entities, identify production gaps, and draft review notes where useful.

`movscript.intent.shot-draft-creation`

Activates for shot lists, shot drafts, and prompt-ready visual planning. The agent should gather story context, then create actionable shot drafts.

`movscript.policy.approval-boundaries`

Keeps tool behavior honest. Reads and drafts may proceed, navigation may help inspection, and formal writes/generation/destructive work must wait for explicit approval.

## Default Tools

`movscript.get_context_pack`

Returns the current route, selected project, user, selection, resources, and local draft count. Use it before project-specific work.

`movscript.search_entities`

Searches project scripts, settings, assets, episodes, scenes, storyboards, and shots. Use it when the user names content without exact IDs.

`movscript.read_entity`

Reads one entity by `entityType` and `entityId`. Use it when the user references an exact entity such as `scene #12`.

`movscript.create_draft`

Creates a local draft artifact. This is the preferred first-stage output for proposed content and does not modify formal project entities.

`movscript.list_drafts`

Lists local drafts for the current or specified project.

`movscript.open_entity`

Navigates the UI to a relevant page. It is navigation only and does not change project data.

## Tool Selection Rules

For factual project questions:

1. Use context first.
2. Search if the target is unclear.
3. Read exact entities when IDs are known.
4. Answer with facts separated from recommendations.

For creation or rewrite requests:

1. Read/search relevant source context.
2. Create a draft unless the user only wants inline text.
3. Return draft kind, title, and next action.

For review requests:

1. Read/search the relevant scene, storyboard, shot, or asset.
2. List issues ordered by severity.
3. Create a note/storyboard/shot draft if the fix is substantial.

For formal changes, generation jobs, or destructive actions:

1. Do not imply completion.
2. Explain target, action, and risk.
3. Wait for approval through runtime policy.

## First-Stage Non-Goals

- No separate planner/reasoning/multimodal model roles.
- No direct database writes from the agent.
- No automatic application of drafts to formal entities.
- No cost-bearing generation jobs without explicit approval.
