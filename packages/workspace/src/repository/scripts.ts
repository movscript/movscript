import {
  entityPathSlug,
  semanticEntityId,
} from '../layout/index.js'
import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptWorkspaceScriptWriteInput {
  fileRepository: MovScriptWorkspaceFileRepository
  scriptId: string | number
  record?: Record<string, unknown> | null
  sourceText: string
  metadata?: Record<string, unknown>
  now?: Date
}

export interface MovScriptWorkspaceScriptWriteResult {
  scriptId: string
  scriptPath: string
  sourcePath: string
  record: Record<string, unknown>
  sourceText: string
}

export interface MovScriptWorkspaceScriptSourceReadInput {
  fileRepository: MovScriptWorkspaceFileRepository
  record: Record<string, unknown>
  entity?: {
    record: Record<string, unknown>
    path: string
  }
}

export async function upsertMovScriptWorkspaceScript(
  input: MovScriptWorkspaceScriptWriteInput,
): Promise<MovScriptWorkspaceScriptWriteResult> {
  const current = stripWorkspacePrivateFields(input.record ?? {})
  const scriptId = stableScriptId(input.scriptId)
  const scriptDir = `scripts/${entityPathSlug(scriptId, 'script')}`
  const scriptPath = `${scriptDir}/script.json`
  const sourcePath = `${scriptDir}/script.md`
  const record = pruneUndefined({
    ...current,
    ...input.metadata,
    schema: 'movscript.script.v1',
    kind: 'script',
    id: scriptId,
    title: stringValue(input.metadata?.title ?? current.title) ?? `Script ${scriptId}`,
    description: stringValue(input.metadata?.description ?? current.description),
    script_kind: stringValue(input.metadata?.script_kind ?? input.metadata?.script_type ?? current.script_kind ?? current.script_type) ?? 'uncategorized',
    source_ref: 'script.md',
    content: input.sourceText,
    updated_at: (input.now ?? new Date()).toISOString(),
    created_at: stringValue(current.created_at ?? current.CreatedAt) ?? (input.now ?? new Date()).toISOString(),
  })
  await input.fileRepository.write({ path: sourcePath, content: input.sourceText })
  await input.fileRepository.write({ path: scriptPath, content: serializeWorkspaceRecord(record) })
  return { scriptId, scriptPath, sourcePath, record, sourceText: input.sourceText }
}

export async function readMovScriptWorkspaceScriptSource(
  input: MovScriptWorkspaceScriptSourceReadInput,
): Promise<string> {
  const record = input.entity?.record ?? input.record
  const scriptPath = stringValue(input.entity?.path ?? workspacePath(record))
  const sourceRef = stringValue(record.source_ref) ?? 'script.md'
  if (!scriptPath) return stringValue(input.record.content) ?? ''
  const sourcePath = `${scriptPath.replace(/\/script\.json$/, '')}/${sourceRef}`.replace(/\/+/g, '/')
  return input.fileRepository.read({ path: sourcePath })
    .then((file) => file.content)
    .catch(() => stringValue(record.content) ?? '')
}

function workspacePath(record: Record<string, unknown>): string | undefined {
  return stringValue(record.__workspace_path ?? record.workspace_path ?? record.path)
}

function stableScriptId(value: string | number): string {
  return semanticEntityId(value, 'script')
}

function stripWorkspacePrivateFields(record: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('__workspace_')) continue
    output[key] = value
  }
  return output
}

function serializeWorkspaceRecord(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && item !== '') output[key] = item
  }
  return output as T
}
