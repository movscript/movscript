/* eslint-disable */
// Generated from docs/api/openapi.v1.json by scripts/generate-openapi-types.mjs.
// Do not edit by hand; update the OpenAPI contract instead.

export interface components {
  schemas: {
    "APIError": {
      "code": string
      "message": string
      "action"?: string
    }
    "User": {
      "ID": number
      "username": string
      "system_role": string
    }
    "AuthRequest": {
      "username": string
      "password": string
    }
    "AuthResponse": {
      "user": components['schemas']["User"]
      "token": string
      "token_type": "Bearer"
      "expires_at": string
    }
    "Project": {
      "ID": number
      "name": string
      "description"?: string
      "owner_id": number
      "status": string
      "total_episodes"?: number
      "aspect_ratio"?: string
      "visual_style"?: string
      "project_style"?: string
    }
    "ProjectCreate": {
      "name": string
      "description"?: string
      "status"?: string
      "total_episodes"?: number
      "aspect_ratio"?: string
      "visual_style"?: string
      "project_style"?: string
    }
    "ProjectMember": {
      "ID": number
      "project_id": number
      "user_id": number
      "role": string
      "user"?: components['schemas']["User"]
    }
    "ProjectMemberCreate": {
      "user_id": number
      "role"?: string
    }
    "RawResource": {
      "ID": number
      "name": string
      "type"?: string
      "mime_type"?: string
      "size"?: number
      "owner_id"?: number
      "project_id"?: number
    }
    "Job": {
      "ID": number
      "job_type": string
      "status": string
      "model_config_id"?: number
      "feature_key"?: string
      "result_resource_id"?: number
      "error"?: string
    }
    "JobCreate": {
      "job_type": string
      "model_config_id": number
      "feature_key"?: string
      "prompt"?: string
      "input_resource_ids"?: Array<number>
      "extra_params"?: Record<string, unknown>
    }
    "Plugin": {
      "ID": number
      "plugin_key": string
      "name": string
      "version": string
      "enabled": boolean
    }
    "PluginImport": {
      "manifest_json"?: string
      "path"?: string
    }
    "AuditLog": {
      "ID": number
      "request_id"?: string
      "actor_id"?: number
      "action": string
      "target_type"?: string
      "target_id"?: string
      "project_id"?: number
      "metadata"?: string
    }
    "PaginatedAuditLogs": {
      "items": Array<components['schemas']["AuditLog"]>
      "total": number
      "page": number
      "page_size": number
    }
  }
}

export interface paths {
  "/health": {
    get: {
      responses: {
        "200": { content: { 'application/json': {
            "status": string
          } } }
      }
    }
  }
  "/api/v1/auth/register": {
    post: {
      requestBody: { content: { 'application/json': components['schemas']["AuthRequest"] } }
      responses: {
        "201": { content: { 'application/json': components['schemas']["AuthResponse"] } }
        "400": { content: { 'application/json': components['schemas']["APIError"] } }
      }
    }
  }
  "/api/v1/auth/login": {
    post: {
      requestBody: { content: { 'application/json': components['schemas']["AuthRequest"] } }
      responses: {
        "200": { content: { 'application/json': components['schemas']["AuthResponse"] } }
        "401": { content: { 'application/json': components['schemas']["APIError"] } }
      }
    }
  }
  "/api/v1/projects": {
    get: {
      responses: {
        "200": { content: { 'application/json': Array<components['schemas']["Project"]> } }
      }
    }
    post: {
      requestBody: { content: { 'application/json': components['schemas']["ProjectCreate"] } }
      responses: {
        "201": { content: { 'application/json': components['schemas']["Project"] } }
      }
    }
  }
  "/api/v1/projects/{id}": {
    get: {
      responses: {
        "200": { content: { 'application/json': components['schemas']["Project"] } }
      }
    }
  }
  "/api/v1/projects/{id}/members": {
    get: {
      responses: {
        "200": { content: { 'application/json': Array<components['schemas']["ProjectMember"]> } }
      }
    }
    post: {
      requestBody: { content: { 'application/json': components['schemas']["ProjectMemberCreate"] } }
      responses: {
        "201": { content: { 'application/json': components['schemas']["ProjectMember"] } }
      }
    }
  }
  "/api/v1/resources": {
    get: {
      responses: {
        "200": { content: { 'application/json': Array<components['schemas']["RawResource"]> } }
      }
    }
  }
  "/api/v1/jobs": {
    get: {
      responses: {
        "200": { content: { 'application/json': Array<components['schemas']["Job"]> } }
      }
    }
    post: {
      requestBody: { content: { 'application/json': components['schemas']["JobCreate"] } }
      responses: {
        "201": { content: { 'application/json': components['schemas']["Job"] } }
      }
    }
  }
  "/api/v1/plugins": {
    get: {
      responses: {
        "200": { content: { 'application/json': Array<components['schemas']["Plugin"]> } }
      }
    }
    post: {
      requestBody: { content: { 'application/json': components['schemas']["PluginImport"] } }
      responses: {
        "200": { content: { 'application/json': components['schemas']["Plugin"] } }
        "201": { content: { 'application/json': components['schemas']["Plugin"] } }
      }
    }
  }
  "/api/v1/admin/audit-logs": {
    get: {
      responses: {
        "200": { content: { 'application/json': components['schemas']["PaginatedAuditLogs"] } }
      }
    }
  }
}
