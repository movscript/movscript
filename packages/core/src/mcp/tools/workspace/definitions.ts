import type { MCPTool } from '../../protocol/types'
import { objectSchema } from '../schema'

export function workspaceTools(): MCPTool[] {
  return [
    {
      name: 'movscript_workspace_get_model',
      description: 'Return the domain workspace model for editing one MovScript entity: workspace kind, editable paths, context paths, schema ids, and agent instructions. This does not write files.',
      inputSchema: objectSchema(
        {
          entityKind: { type: 'string', description: 'Domain entity kind, for example setting, asset, production, storyboard, content_unit, or keyframe.' },
          entityId: { type: ['string', 'number'], description: 'Optional entity id used to expand editable path hints.' },
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
          status: { type: 'string' },
          total_episodes: { type: 'number' },
        },
        ['name']
      ),
    },
    {
      name: 'movscript_workspace_review',
      description: 'Review current source files by comparing them with .build/current. Reports changed files, changed entities, schema/domain issues, and whether build is ready. This does not make edits effective.',
      inputSchema: objectSchema(
        {
          workspaceDir: { type: 'string', description: 'Optional MovScript workspace container directory. Defaults to the current MovScript workspace dir.' },
          userId: { type: ['string', 'number'], description: 'Optional workspace user id used to resolve the project repository root.' },
          projectId: { type: ['string', 'number'], description: 'Optional project id used to resolve the project repository root.' },
        }
      ),
    },
    {
      name: 'movscript_workspace_build',
      description: 'Build current source files into .build/current and .build/indexes. Build must succeed before edits become the current effective workspace state.',
      inputSchema: objectSchema(
        {
          workspaceDir: { type: 'string', description: 'Optional MovScript workspace container directory. Defaults to the current MovScript workspace dir.' },
          userId: { type: ['string', 'number'], description: 'Optional workspace user id used to resolve the project repository root.' },
          projectId: { type: ['string', 'number'], description: 'Optional project id used to resolve the project repository root.' },
        }
      ),
    },
  ]
}
