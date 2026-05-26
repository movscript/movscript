import type { ReadonlyScriptScene } from './types'

export function buildReadonlyScriptScenes(lines: string[]): ReadonlyScriptScene[] {
  const starts: Array<{ line: number; title: string }> = []
  lines.forEach((line, index) => {
    if (isLikelySceneHeading(line)) starts.push({ line: index + 1, title: line.trim() })
  })
  if (starts.length === 0) {
    return [{ id: 'S01', title: '全文', startLine: 1, endLine: Math.max(1, lines.length) }]
  }
  return starts.map((start, index) => ({
    id: `S${String(index + 1).padStart(2, '0')}`,
    title: start.title || `场次 ${index + 1}`,
    startLine: start.line,
    endLine: (starts[index + 1]?.line ?? lines.length + 1) - 1,
  }))
}

export function scriptLinesText(lines: string[], startLine: number, endLine: number): string {
  return lines.slice(Math.max(0, startLine - 1), Math.max(0, endLine)).join('\n')
}

export function sceneForLine(scenes: ReadonlyScriptScene[], line: number): ReadonlyScriptScene {
  return scenes.find((scene) => line >= scene.startLine && line <= scene.endLine) ?? scenes[0] ?? { id: 'S01', title: '全文', startLine: 1, endLine: line }
}

function isLikelySceneHeading(line: string): boolean {
  const text = line.trim()
  if (!text || text.length > 80) return false
  return /^(第\s*[一二三四五六七八九十百\d]+\s*场|场景\s*[：:]|[内外]景|INT[.．\s]|EXT[.．\s])/i.test(text)
}
