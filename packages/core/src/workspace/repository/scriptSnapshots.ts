import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptScriptVersionSnapshotInput {
  fileRepository: MovScriptWorkspaceFileRepository
  scriptId: string | number
  versionId: string | number
  versionLabel?: string
  sourcePath?: string
  now?: Date
}

export interface MovScriptScriptVersionSnapshotResult {
  scriptId: string | number
  versionId: string | number
  scriptPath: string
  versionPath: string
  blockPaths: string[]
  blockCount: number
}

export async function snapshotMovScriptVersionFromMarkdown(
  input: MovScriptScriptVersionSnapshotInput,
): Promise<MovScriptScriptVersionSnapshotResult> {
  const scriptId = safePathToken(input.scriptId)
  const versionId = safePathToken(input.versionId)
  const scriptDir = `scripts/${scriptId}`
  const scriptPath = normalizeWorkspacePath(input.sourcePath ?? `${scriptDir}/script.md`)
  const markdown = await input.fileRepository.read({ path: scriptPath })
  const blocks = splitMarkdownBlocks(markdown.content)
  const versionDir = `${scriptDir}/versions/${versionId}`
  const versionPath = `${versionDir}/script_version.json`
  const createdAt = (input.now ?? new Date()).toISOString()
  const versionRecord = {
    schema: 'movscript.script_version.v1',
    kind: 'script_version',
    id: versionId,
    title: input.versionLabel ?? String(versionId),
    version_label: input.versionLabel ?? String(versionId),
    source_ref: scriptPath.replace(`${scriptDir}/`, ''),
    source_text_hash: hashText(markdown.content),
    block_count: blocks.length,
    created_at: createdAt,
  }
  await input.fileRepository.write({
    path: versionPath,
    content: serializeWorkspaceRecord(versionRecord),
  })

  const blockPaths: string[] = []
  for (const [index, block] of blocks.entries()) {
    const blockId = `script_block_${String(index + 1).padStart(3, '0')}`
    const blockPath = `${versionDir}/blocks/${blockId}/script_block.json`
    blockPaths.push(blockPath)
    await input.fileRepository.write({
      path: blockPath,
      content: serializeWorkspaceRecord({
        schema: 'movscript.script_block.v1',
        kind: 'script_block',
        id: blockId,
        order: index + 1,
        text: block.text,
        block_kind: block.kind,
        source_range: block.sourceRange,
      }),
    })
  }

  return {
    scriptId,
    versionId,
    scriptPath,
    versionPath,
    blockPaths,
    blockCount: blockPaths.length,
  }
}

interface MarkdownBlock {
  text: string
  kind?: string
  sourceRange: {
    start_line: number
    end_line: number
  }
}

function splitMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let startLine = 1
  let current: string[] = []

  function flush(endLine: number): void {
    const text = current.join('\n').trim()
    if (!text) return
    blocks.push({
      text,
      kind: inferScriptBlockKind(text),
      sourceRange: { start_line: startLine, end_line: endLine },
    })
    current = []
  }

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1
    if (line.trim() === '') {
      flush(lineNumber - 1)
      startLine = lineNumber + 1
      continue
    }
    if (current.length === 0) startLine = lineNumber
    current.push(line)
  }
  flush(lines.length)
  return blocks
}

function inferScriptBlockKind(text: string): string | undefined {
  const firstLine = text.split('\n')[0]?.trim() ?? ''
  if (/^(INT\.|EXT\.|内景|外景)/i.test(firstLine)) return 'scene_heading'
  if (/^[A-Z][A-Z0-9 _-]{1,32}$/.test(firstLine)) return 'character'
  if (/^（.*）$|^\(.*\)$/.test(firstLine)) return 'parenthetical'
  return undefined
}

function normalizeWorkspacePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.movscript\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
}

function safePathToken(value: string | number): string {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, '_')
}

function serializeWorkspaceRecord(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function hashText(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index)
  }
  return `djb2_${(hash >>> 0).toString(16)}`
}
