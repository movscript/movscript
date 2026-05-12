# Agent Lean Context Architecture Direction

> Status: architecture direction.
>
> This document describes the desired direction for making MovScript Agent lighter at runtime while moving business behavior into typed skills. It is not an implementation checklist and does not replace `agent-capability-layering.md`; it narrows that target architecture around context weight, skill responsibility, and runtime prompt composition.

## 1. Direction

MovScript Agent should become a light runtime kernel.

The runtime owns execution protocol, safety boundaries, tool policy, state, drafts, memory access, and model turns. It should not carry broad business knowledge by default. Business behavior should be expressed through typed skills and loaded only when the current task needs them.

The default model context should answer only:

- who the agent is at the minimum level
- what safety and approval boundaries apply
- what current project/selection envelope is visible
- how to obtain more context when needed
- what stable handoff references must be preserved

Everything else should be discovered or loaded on demand.

## 2. Core Principle

Default context is an execution envelope, not a knowledge bundle.

The current design still tends to preload content that is only sometimes useful: workflow runbooks, tool catalog text, project lists, subagent policy, capability loading instructions, schema hints, and business procedures. This increases token cost and makes simple tasks carry unrelated behavior.

The target design is:

```text
minimal runtime context
+ selected persona
+ always-on short policies
+ triggered workflows only
+ tool schemas through model tool calling
+ context/memory/schema/draft details fetched on demand
```

The agent should be able to say: "I need more context", then call the relevant tool. It should not receive all possible context before knowing whether it matters.

## 3. Layer Ownership

The five-layer model from `agent-capability-layering.md` remains the target.

| Layer | Owns | Does Not Own |
| --- | --- | --- |
| Schema | Content shape and validation | When to use it |
| Tool | Executable action, input schema, risk, approval | Business workflow |
| Skill | Behavior guidance for a persona, policy, or workflow | Tool implementation or schema internals |
| Pack | Distribution grouping | Runtime prompt behavior |
| Profile | Runtime binding of persona, policies, workflows, tools, limits | Skill body |

This document adds one extra rule:

Runtime prompt composition must consume these layers selectively. The existence of a skill, tool, pack, or schema is not enough reason to place it into the model context.

## 4. Skill Model

Skills should be typed behavior modules, not generic prompt fragments.

### Persona

Persona defines the agent's stable working posture.

Each active profile should have at most one persona. It should stay concise and avoid specific workflow steps.

Persona answers:

- who the agent is
- how it communicates
- what default professional stance it takes

### Policy

Policy defines cross-cutting constraints.

Policies can be always-on, but they must be short. Long policy details should be referenced through documents or tools, not injected into every run.

Policy answers:

- what must never be misrepresented
- what requires approval
- what boundary must be preserved across workflows

Examples:

- drafts are not formal project writes
- generation jobs are asynchronous
- deletion and catalog mutation require approval

### Workflow

Workflow defines how to perform a specific class of business task.

Workflows should not be loaded by default. They require structured triggers such as mode, route, selected entity kind, intent, or focused keywords.

Workflow answers:

- what steps to follow for this task type
- which tools and schemas are relevant
- what output contract to satisfy

Examples:

- project proposal
- production orchestration proposal
- script split
- visual generation
- storyboard gap review

## 5. Profile Model

Profile is the runtime binding, not the behavior body.

A profile should bind:

- one persona
- always-on policy ids
- candidate workflow ids
- tool grants
- model preferences
- limits, such as max active workflows and prompt budget

A profile should not contain:

- skill instructions
- schema bodies
- tool descriptions copied into prose
- mode-specific hardcoded prompt text

Modes should become profile aliases. For example, `visual-generation` is a profile alias that enables visual generation workflows and generation tools. It is not itself a skill.

## 6. Runtime Context Shape

The default runtime context should be split into three levels.

### Level 0: Core Runtime Protocol

Always included and intentionally small.

Contains:

- minimal identity
- safety and approval rules
- tool-result-as-truth rule
- on-demand context rule
- final handoff reference rule

Does not contain:

- project lists
- full tool catalog text
- workflow instructions
- schema summaries
- subagent details unless relevant

### Level 1: Current Context Envelope

Always included, but short.

Contains:

- current route
- current project id/name/status summary
- current production id if available
- current selection id/type/label
- attachment count and short labels
- active plan summary only when inside a plan run

Does not include full lists by default:

- all projects
- all resources
- all drafts
- all memories
- all workers

The model should call tools to retrieve those details when needed.

### Level 2: Activated Behavior

Included only after profile and trigger resolution.

Contains:

- selected persona
- short always-on policies
- triggered workflows, capped by profile limit
- warnings relevant to this run

Workflow activation should be explicit and explainable in traces.

## 7. Prompt Composition Direction

The target prompt composer should assemble system messages in this order:

```text
Core Runtime Protocol
Current Context Envelope
Persona
Policies
Triggered Workflows
Runtime Warnings
```

Tool details should primarily be carried through tool/function schemas, not duplicated as long textual catalog entries. A short tool-use principle is enough in system text.

Capability discovery should become a compact rule:

> If a needed capability is not available, inspect the catalog tools before saying it is missing.

The detailed bundle enable/reload procedure should live in a policy or tool description, and only appear when catalog mutation is relevant.

Subagent policy should not be injected just because subagent tools exist. It should activate when the current profile, command, or task complexity indicates planner behavior.

## 8. Trigger Direction

Workflow selection should move away from legacy `appliesWhen` keyword strings.

Target trigger types:

- `mode`: selected profile or UI mode
- `route`: current page or route pattern
- `selectedKind`: project, production, script, draft, resource, content unit, etc.
- `intent`: normalized runtime command or classifier output
- `keyword`: fallback only, not the main mechanism
- `context`: structured selectors such as hasProjectId or hasProductionId

Default activation rules:

- persona can be profile-selected
- policy can be profile-selected
- workflow must be triggered
- low-confidence workflow matches should prefer asking or fetching context over injecting multiple workflows

## 9. Context Retrieval Direction

Instead of carrying broad context, the runtime should provide good retrieval tools.

The model should retrieve:

- project lists only when comparing or selecting projects
- scripts only when script facts matter
- drafts only when editing, reviewing, or continuing proposals
- memories only when prior decisions or preferences may matter
- schema summaries only when creating or validating structured drafts
- generation jobs only when discussing generation status

This means context tools need clear descriptions and stable business-oriented outputs. If retrieval tools are weak, the model will pressure the system prompt to become heavy again.

## 10. Legacy Compatibility Direction

The current runtime still has legacy manifest-driven skills. This should become a compatibility layer, not the primary architecture.

Target state:

- layered catalog is the source of truth for persona, policy, workflow, tools, packs, and profiles
- `AgentManifest.skills` is accepted only for old catalogs or tests
- layered skills are not converted back into legacy skills for normal runtime selection
- runtime resolves profile first, then resolves active skills from layered catalog
- traces record profile id, persona id, policy ids, workflow ids, and trigger reasons

This transition can be incremental, but the architecture should avoid adding new behavior to the legacy path.

## 11. Expected Benefits

This direction should produce:

- lower default prompt size
- less accidental workflow bias on simple tasks
- clearer skill ownership
- easier domain extension through skills and profiles
- better traceability of why a workflow influenced a run
- less duplication between tool schemas, schema summaries, and skill instructions
- a cleaner path for third-party capability packs

## 12. Design Guardrails

Use these checks when adding new agent behavior:

- If a rule applies to every run and affects safety, keep it in core, but make it short.
- If a rule applies to a business task, put it in a workflow skill.
- If a rule applies across many business tasks, put it in a short policy skill.
- If content shape is described, put it in schema summary, not workflow prose.
- If executable parameters are described, put them in tool schema, not skill prose.
- If a context detail is only sometimes useful, expose a retrieval path instead of preloading it.
- If a workflow is not clearly triggered, do not inject it.

## 13. Open Architecture Decisions

These decisions should be made before large implementation work:

- What is the maximum target size for Level 0 core protocol?
- Should workflow trigger resolution use a classifier, deterministic selectors, or both?
- Should catalog discovery be always available or profile-gated?
- Should tool catalog text be removed entirely from system prompt or replaced with category summaries?
- How much current project context belongs in the default envelope?
- What trace format should explain profile and workflow activation?
- When should planner/subagent policy activate?

## 14. North Star

The runtime should start light, then earn more context through deliberate retrieval.

Skills should not make the agent heavier by default. They should make behavior more precise when the current task actually enters their domain.
