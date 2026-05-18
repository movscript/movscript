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
