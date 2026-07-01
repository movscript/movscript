---
name: admin
description: Configure and diagnose MovScript system management capabilities: providers, credentials, model catalog, route bindings, model gateway keys, generation tool server settings, ResourceAccessProfile/public tunnel/public backend settings, object relay/cloud file config, usage policy, and resource-access resolve/check diagnostics. Use only for explicit admin/system configuration tasks, not ordinary creative generation or editing.
toolGrants:
  - mcp__movscript__movscript_runtime_status
  - mcp__movscript__runtime_daemon_status
  - mcp__movscript__runtime_descriptor_get
  - mcp__movscript__runtime_preflight_check
  - mcp__movscript__admin_provider_template_list
  - mcp__movscript__admin_provider_list
  - mcp__movscript__admin_provider_connection_test
  - mcp__movscript__admin_provider_instance_config_get
  - mcp__movscript__admin_provider_instance_config_update
  - mcp__movscript__admin_provider_instance_config_apply
  - mcp__movscript__admin_provider_instance_config_activate
  - mcp__movscript__admin_provider_create
  - mcp__movscript__admin_provider_credential_create
  - mcp__movscript__admin_provider_credential_update
  - mcp__movscript__admin_provider_credential_set_primary
  - mcp__movscript__admin_provider_asset_library_get
  - mcp__movscript__admin_provider_asset_library_update
  - mcp__movscript__admin_model_catalog_template_list
  - mcp__movscript__admin_model_import_preview
  - mcp__movscript__admin_model_import_apply
  - mcp__movscript__admin_model_catalog_list
  - mcp__movscript__admin_model_catalog_create
  - mcp__movscript__admin_model_catalog_update
  - mcp__movscript__admin_model_catalog_delete
  - mcp__movscript__admin_model_route_diagnose
  - mcp__movscript__admin_model_route_binding_create
  - mcp__movscript__admin_model_route_binding_update
  - mcp__movscript__admin_model_route_binding_delete
  - mcp__movscript__admin_model_gateway_key_list
  - mcp__movscript__admin_model_gateway_key_create
  - mcp__movscript__admin_model_gateway_key_update
  - mcp__movscript__admin_model_gateway_key_delete
  - mcp__movscript__admin_generation_tools_settings_get
  - mcp__movscript__admin_generation_tools_settings_update
  - mcp__movscript__admin_generation_tool_call_test
  - mcp__movscript__admin_resource_access_settings_get
  - mcp__movscript__admin_resource_access_settings_update
  - mcp__movscript__admin_public_tunnel_config_get
  - mcp__movscript__admin_public_tunnel_config_update
  - mcp__movscript__admin_resource_access_profile_list
  - mcp__movscript__admin_resource_access_profile_upsert
  - mcp__movscript__admin_resource_access_profile_delete
  - mcp__movscript__admin_resource_access_profile_test
  - mcp__movscript__admin_resource_access_route_diagnose
  - mcp__movscript__admin_resource_access_resolve_test
  - mcp__movscript__admin_resource_access_check_test
  - mcp__movscript__admin_cloud_file_config_list
  - mcp__movscript__admin_cloud_file_config_create
  - mcp__movscript__admin_cloud_file_config_update
  - mcp__movscript__admin_cloud_file_config_test
  - mcp__movscript__admin_cloud_file_config_delete
  - mcp__movscript__admin_usage_policy_get
  - mcp__movscript__admin_usage_policy_update
  - mcp__movscript__admin_usage_policy_diagnose
---

# Admin

Use this skill only for explicit system management tasks. Admin config is outside the normal creative flow of planning content, planning timeline, generation, and export.

## Production Contract

- Production step: cross-cutting admin setup and diagnostics before generation/export, not creative production itself.
- Systems/config: Data Service/Admin Service own providers, credentials, model catalog, route bindings, gateway keys, ResourceAccessProfile, public tunnel, public backend, object relay/cloud file config, and usage policy; runtime/daemon owns service readiness.
- Blockers: missing daemon/data plane/admin permission, absent provider credentials, invalid route binding, unreachable public URL, invalid usage policy, or unsafe/destructive payload.
- Human review: require explicit confirmation for credential writes, route/gateway/public URL/object relay writes, usage policy writes, deletes, and any config that changes spend, routing, or external exposure.
- Output: report sanitized config state, `debug.cli_argv` when present, diagnostics run, remaining blockers, and the next validation command.

## Boundary

- Admin owns provider accounts, credentials, model catalog, route bindings, model gateway keys, generation tool server settings, ResourceAccessProfile/public tunnel/public backend/object relay/cloud file configuration, and usage policy settings.
- Runtime owns daemon/data-plane/service readiness; use runtime tools to diagnose missing daemon or service endpoints before changing admin config.
- Data Service/Admin Service remain the source of truth for admin config, permission checks, audit, validation, and secret masking.
- Provider config is not Resource Access config. Public tunnel/public backend/object relay belongs to ResourceAccessProfile, not to the provider account.
- Ordinary `planning`, `domain`, `generation`, `timeline`, `editing`, and `review` skills must not mutate admin config.

## Workflow

1. Confirm the user is asking for admin/system configuration or diagnostics. If the request is ordinary creative work, switch to the appropriate creative skill.
2. Call `movscript_runtime_status`, `runtime_descriptor_get`, or `runtime_preflight_check` when daemon/data-plane availability is unclear.
3. Prefer read/diagnose first:
   - provider/template list before provider creation,
   - provider instance config get before update/apply/activate,
   - provider connection test before diagnosing credential or gateway failures,
   - model catalog/template/import preview before catalog writes,
   - route diagnose before route binding writes,
   - generation tool settings get before update,
   - generation tool call-test for sanitized server diagnostics after settings changes,
   - resource-access settings/profile list, route diagnose, profile test, and resolve/check diagnostics before public URL troubleshooting,
   - cloud-file-config list/test before updating object relay/cloud storage,
   - usage-policy get/diagnose before update.
4. For write operations, require explicit user intent and a concrete payload. Do not invent credentials, gateway keys, route priorities, provider IDs, or public tunnel URLs.
5. After a write, run the smallest relevant read/diagnose check to confirm the configured state.
6. When helping debug generation failures, prefer sanitized diagnostics such as route diagnose, model catalog list, capability list, and resource-access check. Do not expose secret values.

## Tool Families

- Provider / credential: `admin_provider_template_list`, `admin_provider_list`, `admin_provider_connection_test`, `admin_provider_instance_config_get`, `admin_provider_instance_config_update`, `admin_provider_instance_config_apply`, `admin_provider_instance_config_activate`, `admin_provider_create`, `admin_provider_credential_create`, `admin_provider_credential_update`, `admin_provider_credential_set_primary`, `admin_provider_asset_library_get`, `admin_provider_asset_library_update`.
- Model catalog/import: `admin_model_catalog_template_list`, `admin_model_import_preview`, `admin_model_import_apply`, `admin_model_catalog_list`, `admin_model_catalog_create`, `admin_model_catalog_update`, `admin_model_catalog_delete`.
- Route binding: `admin_model_route_diagnose`, `admin_model_route_binding_create`, `admin_model_route_binding_update`, `admin_model_route_binding_delete`.
- Model gateway key: `admin_model_gateway_key_list`, `admin_model_gateway_key_create`, `admin_model_gateway_key_update`, `admin_model_gateway_key_delete`.
- Generation tools: `admin_generation_tools_settings_get`, `admin_generation_tools_settings_update`, `admin_generation_tool_call_test`.
- Resource access / public tunnel: `admin_resource_access_settings_get`, `admin_resource_access_settings_update`, `admin_public_tunnel_config_get`, `admin_public_tunnel_config_update`, `admin_resource_access_profile_list`, `admin_resource_access_profile_upsert`, `admin_resource_access_profile_delete`, `admin_resource_access_profile_test`, `admin_resource_access_route_diagnose`, `admin_resource_access_resolve_test`, `admin_resource_access_check_test`.
- Object relay / cloud file config: `admin_cloud_file_config_list`, `admin_cloud_file_config_create`, `admin_cloud_file_config_update`, `admin_cloud_file_config_test`, `admin_cloud_file_config_delete`.
- Usage policy: `admin_usage_policy_get`, `admin_usage_policy_update`, `admin_usage_policy_diagnose`. Get/update configure the admin policy document; diagnose reports mode, configured limits, blockers/warnings, and whether gateway runtime enforcement is verified for the deployment.

## Human Review

- Treat credential, provider instance config apply/activate, route, gateway key, ResourceAccessProfile/public tunnel/public backend, object relay/cloud file config, and usage policy writes/deletes as review gates.
- Use generation tool call-test read-style operations such as status, object_info, queue, models, or progress before mutating tool calls. Only run queue_prompt, txt2img, or img2img when the user explicitly asks to exercise that generation tool path.
- Ask the user to confirm destructive operations such as catalog delete, route binding delete, gateway key delete, or cloud file config delete.
- A successful config write does not prove generation will work; run route/resource-access profile diagnostics and report remaining blockers.
- When returning public URL diagnostics, report reachability and profile IDs, but do not persist temporary signed URLs into project source.

## Output

Report:

- what system was configured or diagnosed,
- whether the call was read-only or a write,
- the sanitized CLI-equivalent command when available from `debug.cli_argv`,
- any missing runtime/data-plane/admin permission blocker,
- next validation step, such as route diagnose, resource-access profile test/check, generation capability list, or a user confirmation before write/delete.
