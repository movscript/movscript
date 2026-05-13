# Agent Catalog Layering

This catalog is the runtime behavior surface for the local Agent. Keep each
layer narrow so capabilities can be combined without hidden side effects.

## Product Layers

The built-in MovScript catalog is split into these product-facing layers:

| Product Layer | Owns | Examples |
| --- | --- | --- |
| Agent Core | Agent-owned memory, user input, catalog reload, and planner subagents | `movscript.pack.agent-core`, `tools/agent/` |
| Drafts | Local review draft CRUD, validation, and preview tools | `movscript.pack.drafts`, `tools/drafts/` |
| MovScript Workspace | Current UI context and visible MovScript project state | `movscript.pack.movscript-workspace`, `tools/movscript-workspace/` |
| Business Proposal | Reviewable proposal workflows for business entities | `movscript.pack.proposal-*`, `skills/workflow/proposal/` |
| Generation Execution | Approval-gated image/video generation jobs | `movscript.pack.visual-generation`, `tools/visual-generation/` |

Business proposal is further split by domain:

| Business Proposal Layer | Owns | Does Not Own |
| --- | --- | --- |
| Project Proposal | Creative references and asset slots bound to creative references | Production segments, generation jobs |
| Production Proposal | Emotional segments and scene moments bound to segments; references project settings/assets | Project-level setting creation, generated media binding |
| Asset Proposal | Independent asset candidate plans, references, risks, acceptance criteria, generation readiness | Project proposal asset-slot ownership, job creation |
| Content Unit Proposal | Storyboard/content-unit/keyframe/media planning proposals; extensible by future skills | Direct generation execution, formal backend apply |

## Layer Responsibilities

| Layer | Owns | Does Not Own |
| --- | --- | --- |
| Schema | Draft payload shape, prompt summary, examples, validation target | Tool choice, workflow order, runtime activation |
| Tool | One executable action, input schema, permission, risk, approval default | When to use the action, business process, draft schema prose |
| Skill Persona | Stable role, communication stance, always-true behavioral bias | Workflow steps, tool parameters, schema details |
| Skill Policy | Cross-cutting guardrails, approval/write boundaries, platform concepts | Ordered task flow, tool catalog ownership |
| Skill Workflow | A runbook for one job type: trigger, boundary, allowed tools, process, output | Persona text, copied tool schemas, formal writes outside its boundary |
| Pack | A publishable set of schema/tool/skill ids for one layer | Runtime activation, prompt content, tool grants |
| Profile | Runtime binding: packs, persona, candidate workflows, policies, tool grants, limits | Skill bodies, schema bodies, tool descriptions, UI entry modes |

## Workflow Classes

Every workflow skill should be written as exactly one of these classes.

| Class | May Create Drafts | May Create Generation Jobs | May Write Formal Entities | Typical Tools |
| --- | --- | --- | --- | --- |
| Planning / Proposal | Yes | No | No | context, draft, input |
| Generation Execution | No, unless recording local notes | Yes, approval-gated | No | model list, create job, inspect job |
| Review / Selection | No, unless recording local notes | No | No | context, read drafts/resources |
| Apply / Formal Write | No, except audit drafts | No | Yes, approval-gated or UI apply | backend write/apply tools |

Do not combine planning and generation in one workflow. A planning workflow may
prepare prompt candidates and acceptance criteria. A generation workflow may
submit and monitor jobs. A review workflow may compare outputs. A formal write
or binding must be explicit and approval-gated.

## Workflow Template

Preferred file layout is one skill per directory:

```text
skills/
  workflow/
    proposal/
      project/
        project-proposal/
          skill.workflow.json
          instruction.md
      production/
        production-proposal/
          skill.workflow.json
          instruction.md
      asset/
        asset-proposal/
          skill.workflow.json
          instruction.md
      content-unit/
        content-unit-proposal/
          skill.workflow.json
          instruction.md
    generation/
      visual-generation/
        skill.workflow.json
        instruction.md
  policy/
    approval-boundaries/
      skill.policy.json
      instruction.md
  persona/
    visual-director/
      skill.persona.json
      instruction.md
```

The `kind` folder controls injection semantics. Business workflows live under
their proposal domain first, then individual skill directories. Runtime behavior
still comes from skill ids, profile references, and tool grants; directory names
are not semantic inputs to the model.

Use this structure for non-trivial workflow Markdown files:

```md
Goal:
Inputs:
Boundary:
Allowed tools:
Process:
Validation:
Output:
Never:
```

Short workflows are allowed only when the boundary is obvious from the profile
and tool grants. If a workflow mentions generated media, formal entities,
approval, or review state, write the boundary explicitly.

## Boundary Rules

- Project proposal skills manage project-level setting references and owned
  asset slot requirements only.
- Production proposal skills manage production segments and scene moments only.
- Asset proposal skills are an independent business layer. They create or edit
  local asset proposal drafts and generation-ready candidate plans, but do not
  submit image/video jobs.
- Content-unit proposal skills manage storyboard, keyframe, and media planning
  draft units only.
- Visual generation skills are the only built-in skills that create and monitor
  image/video generation jobs.
- Generated media remains a review candidate until the user accepts or binds it
  through an explicit UI/backend action.
- Local drafts are not formal project data. Formal writes must be proven by a
  tool result or by the UI apply flow.
