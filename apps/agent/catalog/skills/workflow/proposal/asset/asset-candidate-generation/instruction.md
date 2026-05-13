Goal:
Prepare generation-ready candidate directions for the selected asset slot without submitting a generation job.

Inputs:
- Current context and selected asset slot or asset need.
- Existing resources, references, draft notes, and user constraints when available.
- Target output type, prompt direction, reference ids, aspect ratio, duration, model capability needs, risks, and acceptance criteria.

Boundary:
- This workflow is candidate preparation and review targeting.
- Preserve the selected asset slot as the review target.
- Do not create image or video generation jobs here.
- Do not mark generated media as accepted, selected, bound, or locked.

Allowed tools:
- Read current context and inspect recent generation jobs when useful.
- List models only to verify feasibility or required parameters.
- Ask the user for missing target, reference, or output constraints when guessing would change the candidate.

Process:
1. Identify the asset slot or ask for the target if it is ambiguous.
2. Summarize the desired candidate as concrete prompt intent, references, output type, model capability, and acceptance criteria.
3. When checking feasibility, use model discovery contracts rather than provider assumptions. Note blockers such as missing references, unsupported duration/aspect ratio, unsupported model-specific parameters, input count limits, or unclear ownership.
4. If the user wants execution, hand off to the Visual Generation workflow rather than calling generation tools from this workflow.

Validation:
- The candidate must name the asset target and explain why the prepared direction fits it.
- Any generated resource mentioned must come from existing context or an inspected job result, not from an assumed job.

Output:
Return the selected asset target, candidate prompt direction, reference/resource ids if known, required model capability, acceptance criteria, blockers, and the next action.

Never:
- Never call a generation creation or cancellation tool from this workflow.
- Never claim media exists unless context or a job inspection proves it.
