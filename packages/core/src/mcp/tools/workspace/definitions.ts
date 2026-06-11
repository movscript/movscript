import type { MCPJSONValue, MCPTool } from '../../protocol/types'
import { objectSchema } from '../schema'

const workspaceLocator = {
  workspaceDir: { type: 'string', description: 'Optional MovScript workspace container directory. Defaults to the current MovScript workspace dir.' },
  workspace_dir: { type: 'string', description: 'Alias for workspaceDir.' },
  projectId: { type: ['string', 'number'], description: 'Required project id for project-scoped workspace tools. MCP never infers project from session, cwd, route, or focus.' },
  project_id: { type: ['string', 'number'], description: 'Alias for projectId.' },
}

export function workspaceTools(): MCPTool[] {
  return [
    {
      name: 'movscript_workspace_get_model',
      description: 'Return the movscript-lang workspace model for one editable domain entity: editable source paths, context paths, schema ids, supported write APIs, and agent instructions. This is project-scoped and does not write files.',
      inputSchema: projectSchema(
        {
          ...workspaceLocator,
          entityKind: { type: 'string', description: 'Domain entity kind, for example setting, asset, production, storyboard, content_unit, or keyframe.' },
          entity_kind: { type: 'string', description: 'Alias for entityKind.' },
          entityId: { type: ['string', 'number'], description: 'Optional entity id used to expand editable path hints.' },
          entity_id: { type: ['string', 'number'], description: 'Alias for entityId.' },
        },
        ['entityKind']
      ),
    },
    {
      name: 'movscript_project_create',
      description: 'Create a formal MovScript project. Use only when the user explicitly asks to create a new project or confirms the project name.',
      inputSchema: objectSchema(
        {
          name: { type: 'string' },
          description: { type: 'string' },
          total_episodes: { type: 'number' },
        },
        ['name']
      ),
    },
    {
      name: 'movscript_workspace_review',
      description: 'Review current source files by comparing them with .interpret/current. Reports changed files, changed entities, schema/domain issues, and interpret readiness. This does not make edits effective.',
      inputSchema: projectSchema(workspaceLocator),
    },
    {
      name: 'movscript_workspace_interpret',
      description: 'Interpret current source files into .interpret/current and .interpret/indexes. Interpret must succeed before edits become current effective workspace state.',
      inputSchema: projectSchema(workspaceLocator),
    },
  ]
}

function projectSchema(properties: Record<string, MCPJSONValue>, required?: string[]): MCPTool['inputSchema'] {
  return objectSchema(properties, required)
}
