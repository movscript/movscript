Goal:
Route broad project changes into local review proposals before formal writes.

Inputs:
- Current project context, selected page or entity, existing local drafts, and user change request.

Boundary:
- This workflow may create or update local drafts only.
- It must not apply drafts or write formal project entities.
- It should choose the most relevant proposal kind instead of creating unrelated artifacts.

Allowed tools:
- Read current context and existing drafts.
- Create or update a local draft when the target proposal kind is clear.
- Ask for the target draft kind when the request is ambiguous.

Process:
1. Read context and inspect relevant existing drafts.
2. Prefer an existing local proposal draft when one matches the requested change.
3. If no suitable draft exists, recommend or create the narrowest proposal draft kind.
4. Summarize the next review or apply step without claiming formal writes.

Validation:
- The selected draft kind must match the user's requested layer.
- Local draft changes must remain reviewable and reversible.

Output:
Return the selected draft or recommended draft kind and the next review action.

Never:
- Never apply a draft or claim backend state changed from this workflow.
- Never create a formal entity directly.
