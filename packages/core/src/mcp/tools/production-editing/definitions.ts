import type { MCPTool } from '../../protocol/types'
import { objectSchema } from '../schema'

const projectLocator = {
  homeDir: { type: 'string', description: 'MovScript Home directory used to discover daemon-owned service endpoints.' },
  home_dir: { type: 'string', description: 'Alias for homeDir.' },
  workspaceDir: { type: 'string', description: 'Workspace root used for backend auth lookup.' },
  workspace_dir: { type: 'string', description: 'Alias for workspaceDir.' },
  projectDir: { type: 'string', description: 'MovScript project directory.' },
  project_dir: { type: 'string', description: 'Alias for projectDir.' },
  cwd: { type: 'string', description: 'Alias for projectDir.' },
  mediaProjectId: { type: ['string', 'number'], description: 'MediaEditingProject project id used by system_editing workspaces and media task recovery.' },
  media_project_id: { type: ['string', 'number'], description: 'Alias for mediaProjectId.' },
  projectId: { type: ['string', 'number'], description: 'Deprecated alias for mediaProjectId. Do not use as a MovScript source project locator.' },
  project_id: { type: ['string', 'number'], description: 'Deprecated alias for mediaProjectId.' },
  token: { type: 'string', description: 'Backend bearer token.' },
}

const productionLocator = {
  ...projectLocator,
  productionId: { type: ['string', 'number'], description: 'Production id that owns the editing workspaces.' },
  production_id: { type: ['string', 'number'], description: 'Alias for productionId.' },
}

const workspaceLocator = {
  ...productionLocator,
  workspaceId: { type: 'string', description: 'Production editing workspace id.' },
  workspace_id: { type: 'string', description: 'Alias for workspaceId.' },
}

export function productionEditingTools(): MCPTool[] {
  return [
    {
      name: 'production_editing_resources_refresh',
      description: 'Refresh the production editing resource index. This does not mutate any editing workspace, Remotion project, or candidate decision.',
      inputSchema: objectSchema({
        ...productionLocator,
        includeCandidates: { type: 'boolean' },
        include_candidates: { type: 'boolean' },
        includeUnselected: { type: 'boolean' },
        include_unselected: { type: 'boolean' },
      }),
    },
    {
      name: 'production_editing_workspace_list',
      description: 'List system_editing and remotion workspaces for a production, including stale summaries when available.',
      inputSchema: objectSchema({
        ...productionLocator,
        kind: { type: 'string', description: 'Optional workspace kind: system_editing or remotion.' },
        workspaceKind: { type: 'string', description: 'Alias for kind.' },
        workspace_kind: { type: 'string', description: 'Alias for kind.' },
        page: { type: 'number' },
        pageSize: { type: 'number' },
        page_size: { type: 'number' },
      }),
    },
    {
      name: 'production_editing_workspace_create',
      description: 'Create a production-bound editing workspace. Kind must be system_editing or remotion. Create refreshes production resources and returns a skill handoff.',
      inputSchema: objectSchema({
        ...productionLocator,
        kind: { type: 'string', description: 'Workspace kind: system_editing or remotion.' },
        title: { type: 'string' },
        workspaceId: { type: 'string' },
        workspace_id: { type: 'string' },
        seed: { type: 'object', additionalProperties: true },
      }),
    },
    {
      name: 'production_editing_workspace_get',
      description: 'Read one production editing workspace by id. This is implemented as a filtered workspace list and does not open the workspace.',
      inputSchema: objectSchema(workspaceLocator),
    },
    {
      name: 'production_editing_workspace_open',
      description: 'Open a production-bound editing workspace, refresh resources, report stale state, and return the next skill handoff.',
      inputSchema: objectSchema(workspaceLocator),
    },
    {
      name: 'production_editing_workspace_delete',
      description: 'Delete one production editing workspace. This removes the workspace record/files but does not alter production candidates.',
      inputSchema: objectSchema(workspaceLocator),
    },
  ]
}
