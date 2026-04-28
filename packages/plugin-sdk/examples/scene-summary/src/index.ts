import type { MovRuntime, ToolResult } from '@movscript/plugin-sdk'

interface Args {
  project_id: number
  language?: string
}

export async function run(mov: MovRuntime, args: Args): Promise<ToolResult> {
  const { project_id, language = 'zh' } = args

  // Fetch all scenes for the project
  const scenes = await mov.mcp.listScenes(project_id) as Array<{
    ID: number
    title?: string
    description?: string
    order?: number
  }>

  if (!scenes || scenes.length === 0) {
    return {
      content: [{ type: 'text', text: language === 'zh' ? '该项目没有场景。' : 'No scenes found in this project.' }],
      data: { scenes: [] },
    }
  }

  // Build a summary text from scene titles and descriptions
  const lines = scenes.map((s, i) => {
    const title = s.title || (language === 'zh' ? `场景 ${i + 1}` : `Scene ${i + 1}`)
    const desc = s.description ? `\n  ${s.description}` : ''
    return `${i + 1}. ${title}${desc}`
  })

  const header = language === 'zh'
    ? `项目共有 ${scenes.length} 个场景：\n\n`
    : `Project has ${scenes.length} scene(s):\n\n`

  return {
    content: [{ type: 'text', text: header + lines.join('\n') }],
    data: { scenes, count: scenes.length },
  }
}

// Plugin manifest — exported so the bundler can embed it
export const manifest = {
  schema: 'movscript.clientPlugin.v1',
  id: 'movscript.scene-summary',
  name: '场景摘要',
  version: '1.0.0',
  description: '列出项目中所有场景的标题和描述，生成结构化摘要。',
  author: 'Movscript',
  homepage: 'https://github.com/migua/movscript-plugin-sdk',
  permissions: ['project.read', 'scene.read'],
  inputSchema: {
    type: 'object',
    required: ['project_id'],
    properties: {
      project_id: {
        type: 'number',
        title: '项目 ID',
        description: '要汇总场景的项目 ID',
      },
      language: {
        type: 'string',
        title: '语言',
        enum: ['zh', 'en'],
        default: 'zh',
      },
    },
  },
}
