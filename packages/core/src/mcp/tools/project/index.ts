import type { MCPTool } from '../../protocol/types'
import { objectSchema } from '../schema'

export function projectTools(): MCPTool[] {
  return [
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
      name: 'movscript_project_init',
      description: 'Initialize a local MovScript project in any directory. Use this for path-bound projects that should not require a backend user/project binding.',
      inputSchema: objectSchema(
        {
          projectDir: { type: 'string', description: 'Absolute or relative directory to initialize as a MovScript project.' },
          project_dir: { type: 'string', description: 'Alias for projectDir.' },
          cwd: { type: 'string', description: 'Alias for projectDir, useful when initializing the current folder.' },
          title: { type: 'string' },
          projectId: { type: 'string', description: 'Optional local project id written into workspace metadata.' },
          project_id: { type: 'string', description: 'Alias for projectId.' },
          language: { type: 'string' },
          overwrite: { type: 'boolean' },
        },
      ),
    },
    {
      name: 'movscript_project_fetch',
      description: 'Open or inspect a local MovScript project by directory without requiring a backend user/project binding.',
      inputSchema: objectSchema(
        {
          projectDir: { type: 'string', description: 'Absolute or relative MovScript project directory to open.' },
          project_dir: { type: 'string', description: 'Alias for projectDir.' },
          cwd: { type: 'string', description: 'Alias for projectDir.' },
        },
      ),
    },
  ]
}
