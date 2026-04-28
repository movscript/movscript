# Agent Smoke Tests

These smoke tests validate the first runnable Agent loop with one text model path and the desktop MCP bridge.

## Prerequisites

Start the backend and frontend desktop app, select a project, then start the local agent:

```bash
make dev-agent
```

Optional CLI checks:

```bash
pnpm --filter movcli dev -- agent status
pnpm --filter movcli dev -- agent threads
```

## 1. Current Project Progress

User message:

```text
帮我总结当前项目进度，还差哪些关键工作？
```

Expected runtime behavior:

- Uses `movscript.get_context_pack`.
- Uses `movscript.search_entities` or available project resources if context is not enough.
- Does not create a draft unless the answer becomes a planning note.

Expected answer:

- Separates confirmed project facts from inferred gaps.
- Gives 3-5 concrete next actions.
- Mentions missing context if the project has little data.

## 2. Storyboard Gap Review

User message:

```text
检查场景 #12 的分镜和镜头缺口，给我一份审查草稿。
```

Expected runtime behavior:

- Uses `movscript.read_entity` for the referenced scene if available.
- Searches related storyboards or shots if exact child entities are not known.
- Uses `movscript.create_draft` with kind `note`, `storyboard`, or `shot`.

Expected answer:

- Lists severity-ordered issues.
- Reports the created draft title and kind.
- Does not claim formal scene/storyboard/shot records were changed.

## 3. Shot Draft Creation

User message:

```text
基于这段剧情生成 6 个镜头草稿，并让我确认后再保存正式数据。
```

Expected runtime behavior:

- Uses `movscript.create_draft`, not a formal write tool.
- If source context is vague, asks for or searches context before overclaiming.
- Does not request approval for formal writes because it should stop at draft creation.

Expected answer:

- Gives numbered shot ideas or confirms the created draft contains them.
- Includes visual purpose, framing, action, and prompt-ready details.
- States that the draft is local and awaits user confirmation before formal application.

## 4. Existing Draft Review

User message:

```text
列出当前项目已有的 Agent 草稿。
```

Expected runtime behavior:

- Uses `movscript.list_drafts`.
- Does not search formal project entities unless the user asks for source comparison.

Expected answer:

- Lists draft id/title/kind when available.
- Says clearly when there are no drafts.

## Debug Checklist

Use the Agent Debug page or `/runs/preview` to inspect:

- Selected skills include the relevant `movscript.intent.*` skill.
- Available tools include context, search/read, drafts, and navigation.
- Prompt preview includes runtime policy and skill instructions.
- Planned tool calls are limited to available tools.
- Approval appears only for write/generate/destructive tools.
