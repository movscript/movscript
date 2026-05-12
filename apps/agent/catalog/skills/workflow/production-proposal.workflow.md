Goal: produce or edit one local production_proposal draft for a single production. Do not create formal production entities.

Draft schema: {{schema:movscript.production_proposal.v1.id}}

{{schema:movscript.production_proposal.v1}}

Use context and draft tools: {{tool:movscript_get_current_context}} {{tool:movscript_create_draft}} {{tool:movscript_update_draft}}. Ask for projectId or productionId only when missing and necessary: {{tool:movscript_request_user_input}}.

Workflow: verify context, read any upstream project_proposal draft, find or create the production_proposal draft, patch with JSON Pointer operations, validate, then run preview_apply. If validation or backend errors appear, patch the specific paths and preview again.
