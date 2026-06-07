import { MOVSCRIPT_BUILD_DIR } from './constants.js'
import { normalizeWorkspacePath } from './pathUtils.js'

export type MovScriptWorkspaceFileRole = 'editable' | 'built' | 'runtime' | 'external'

export interface MovScriptWorkspaceFilePolicy {
  path: string
  role: MovScriptWorkspaceFileRole
}

export function classifyMovScriptWorkspacePath(path: string): MovScriptWorkspaceFilePolicy {
  const normalized = normalizeWorkspacePath(path)
  if (normalized.startsWith(`${MOVSCRIPT_BUILD_DIR}/`)) return { path: normalized, role: 'built' }
  if (isMovScriptSourcePath(normalized)) return { path: normalized, role: 'editable' }
  if (normalized.startsWith('.movscript/') || normalized.startsWith('runtime/') || normalized.startsWith('tmp/')) {
    return { path: normalized, role: 'runtime' }
  }
  return { path: normalized, role: 'external' }
}

export function isMovScriptSourcePath(path: string): boolean {
  const normalized = normalizeWorkspacePath(path)
  if (MOVSCRIPT_SOURCE_ROOT_FILES.has(normalized)) return true
  const [first] = normalized.split('/')
  const fileName = normalized.split('/').pop()
  return first !== undefined
    && MOVSCRIPT_SOURCE_COLLECTION_DIRS.has(first)
    && fileName !== undefined
    && MOVSCRIPT_SOURCE_ENTITY_FILES.has(fileName)
    && isMovScriptSourceDocumentPath(normalized)
}

export function isMovScriptSourceDocumentPath(path: string): boolean {
  return path.endsWith('.json') || path.endsWith('.md')
}

export function isMovScriptNonSourceRootDirectory(path: string): boolean {
  const normalized = normalizeWorkspacePath(path)
  if (normalized.includes('/')) return false
  return normalized === '.movscript'
    || normalized === '.git'
    || normalized === '.base'
    || normalized === '.update'
    || normalized === 'runtime'
    || normalized === 'tmp'
    || normalized.startsWith('.')
}

export const MOVSCRIPT_SOURCE_COLLECTION_DIRS = new Set([
  'settings',
  'scripts',
  'content_units',
  'productions',
  'project_standards',
])

export const MOVSCRIPT_SOURCE_ROOT_FILES = new Set([
  'project.json',
  'project_standards.json',
])

export const MOVSCRIPT_SOURCE_ENTITY_FILES = new Set([
  'setting.json',
  'setting_state.json',
  'asset.json',
  'script.json',
  'script.md',
  'script_version.json',
  'script_block.json',
  'content_unit.json',
  'keyframe.json',
  'production.json',
  'segment.json',
  'scene_moment.json',
  'storyboard.json',
  'writing_expression.json',
])
