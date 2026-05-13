Goal: produce or edit one local project_proposal draft as a partial merge patch over project-level creative_references and asset_slots. Do not write final project entities.

Draft schema: {{schema:movscript.project_proposal.v1.id}}

{{schema:movscript.project_proposal.v1}}

Tool reference:
- Context: {{tool:movscript_get_current_context}}
- Draft creation/editing: {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}
- User input: {{tool:movscript_request_user_input}}

Workflow:
1. Read current context. If projectId is missing and cannot be inferred, ask with movscript_request_user_input.
2. Find an existing project_proposal draft; otherwise create one with proposal=true.
3. Patch content with JSON Pointer operations. Validate before summarizing.
4. Run preview_apply for dry-run finalization. If validation or backend errors appear, patch and preview again.
5. Keep creative_references as the setting layer and asset_slots as owned material requirements.
