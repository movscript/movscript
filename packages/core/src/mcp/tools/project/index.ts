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
      description: 'Initialize a local MovScript project in any directory, then ensure its backend project identity and project-data space.',
      inputSchema: objectSchema(
        {
          projectDir: { type: 'string', description: 'Absolute or relative directory to initialize as a MovScript project.' },
          project_dir: { type: 'string', description: 'Alias for projectDir.' },
          cwd: { type: 'string', description: 'Alias for projectDir, useful when initializing the current folder.' },
          title: { type: 'string' },
          localProjectId: { type: 'string', description: 'Optional local project id written into workspace metadata.' },
          local_project_id: { type: 'string', description: 'Alias for localProjectId.' },
          projectId: { type: 'string', description: 'Deprecated alias for localProjectId; not a backend project id.' },
          project_id: { type: 'string', description: 'Deprecated alias for localProjectId.' },
          language: { type: 'string' },
          overwrite: { type: 'boolean' },
        },
      ),
    },
    {
      name: 'movscript_project_open',
      description: 'Open a MovScript project by directory, then ensure its backend project identity and project-data space. This does not fetch source data; business source lives in the user chosen Git repository.',
      inputSchema: objectSchema(
        {
          projectDir: { type: 'string', description: 'Absolute or relative MovScript project directory to open.' },
          project_dir: { type: 'string', description: 'Alias for projectDir.' },
          cwd: { type: 'string', description: 'Alias for projectDir.' },
        },
      ),
    },
    {
      name: 'movscript_project_fetch',
      description: 'Compatibility alias for movscript_project_open.',
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
