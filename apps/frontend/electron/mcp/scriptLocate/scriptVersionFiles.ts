import { getMCPContextSnapshot } from '../context/store'
import type { ReadonlyScriptFile } from './types'
import {
  backendList,
  getOptionalNumber,
  getOptionalString,
  numericValue,
  textOrUndefined,
} from './utils'
import { readonlyScriptFileURI } from './scriptFileResources'
import { buildReadonlyScriptScenes } from './scriptScenes'

export async function resolveReadonlyScriptFiles(args: Record<string, unknown>): Promise<ReadonlyScriptFile[]> {
  const projectId = getOptionalNumber(args, 'projectId') ?? getMCPContextSnapshot().project?.id
  if (!projectId) throw new Error('projectId is required when no current project is selected')
  const scriptVersionId = getOptionalNumber(args, 'scriptVersionId')
  if (scriptVersionId) return [await loadReadonlyScriptFile(projectId, scriptVersionId)]

  const scriptTitle = getOptionalString(args, 'scriptTitle')
  const scriptId = getOptionalNumber(args, 'scriptId') ?? await resolveScriptIdByTitle(projectId, scriptTitle)
  const versions = await backendList(`/projects/${projectId}/entities/script-versions`)
  const candidates = versions
    .filter((version) => {
      if (scriptId) return numericValue(version?.script_id ?? version?.scriptId) === scriptId
      return scriptTitle ? scriptMatchesTitle(version, scriptTitle) : true
    })
    .sort(compareScriptVersionsDescending)
  if (candidates.length === 0) throw new Error(scriptTitle ? `No script version found for title: ${scriptTitle}` : 'No script version found for script_locate')
  return candidates.map((version) => scriptFileFromVersion(projectId, version))
}

export async function loadReadonlyScriptFile(projectId: number, scriptVersionId: number): Promise<ReadonlyScriptFile> {
  const versions = await backendList(`/projects/${projectId}/entities/script-versions`)
  const version = versions.find((item) => numericValue(item?.ID ?? item?.id) === scriptVersionId)
  if (!version) throw new Error(`Script version ${scriptVersionId} not found`)
  return scriptFileFromVersion(projectId, version)
}

export function summarizeReadonlyScriptFile(file: ReadonlyScriptFile): Record<string, unknown> {
  return {
    projectId: file.projectId,
    scriptVersionId: file.scriptVersionId,
    scriptId: file.scriptId,
    title: file.title,
    versionNumber: file.versionNumber,
    updatedAt: file.updatedAt,
    uri: file.uri,
    ref: file.uri,
    totalLines: file.lines.length,
    sceneCount: file.scenes.length,
  }
}

function resolveScriptIdByTitle(projectId: number, scriptTitle?: string): Promise<number | undefined> {
  if (!scriptTitle) return Promise.resolve(undefined)
  return backendList(`/projects/${projectId}/scripts`).then((scripts) => {
    const match = scripts.find((script) => scriptMatchesTitle(script, scriptTitle))
    return numericValue(match?.ID ?? match?.id)
  })
}

function scriptFileFromVersion(projectId: number, version: any): ReadonlyScriptFile {
  const scriptVersionId = numericValue(version?.ID ?? version?.id)
  if (!scriptVersionId) throw new Error('script version is missing ID')
  const text = normalizeScriptFileText(String(version?.content || version?.raw_source || ''))
  const lines = text ? text.split('\n') : []
  const scenes = buildReadonlyScriptScenes(lines)
  return {
    projectId,
    scriptVersionId,
    scriptId: numericValue(version?.script_id ?? version?.scriptId) ?? 0,
    title: String(version?.title ?? `剧本版本 #${scriptVersionId}`),
    versionNumber: numericValue(version?.version_number ?? version?.versionNumber),
    updatedAt: textOrUndefined(version?.UpdatedAt ?? version?.updatedAt),
    uri: readonlyScriptFileURI(projectId, scriptVersionId),
    text,
    lines,
    scenes,
  }
}

function normalizeScriptFileText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function compareScriptVersionsDescending(a: any, b: any): number {
  const av = numericValue(a?.version_number ?? a?.versionNumber) ?? 0
  const bv = numericValue(b?.version_number ?? b?.versionNumber) ?? 0
  if (bv !== av) return bv - av
  return (numericValue(b?.ID ?? b?.id) ?? 0) - (numericValue(a?.ID ?? a?.id) ?? 0)
}

function scriptMatchesTitle(script: any, title: string): boolean {
  const expected = title.trim().toLowerCase()
  if (!expected) return true
  const actual = String(script?.title ?? '').trim().toLowerCase()
  return actual === expected || actual.includes(expected)
}
