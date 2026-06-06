import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  ensureMovScriptWorkspaceRoot,
  resolveDefaultMovScriptWorkspaceDir as resolveDefaultMovScriptWorkspaceDirFromEnv,
  resolveMovScriptContentUnitProjectionPaths,
  resolveMovScriptProductionProjectionPaths,
  resolveMovScriptProjectProjectionPaths,
  resolveMovScriptWorkspaceRootPaths,
} from '@movscript/workspaces/node'
import type { MovScriptWorkspaceKind } from '../../../src/shared/contracts/movscriptWorkspace'
import { getMCPContextSnapshot } from '../context/store'

export interface WorkspaceModelProjectionResult {
  materialized: boolean
  created: boolean
  reason?: string
  workspaceRoot: string
  controlDir: string
  workspacePath?: string
  metaPath?: string
  syncPath?: string
  absoluteWorkspacePath?: string
  absoluteMetaPath?: string
  absoluteSyncPath?: string
  agentWritable: false
}

export interface WorkspaceModelProjectionReadResult {
  projection: WorkspaceModelProjectionResult
  snapshot?: Record<string, unknown>
  meta?: Record<string, unknown>
  exists: boolean
}

export async function materializeWorkspaceModelProjection(input: {
  kind: MovScriptWorkspaceKind
  target: Record<string, unknown>
  initialContent: Record<string, unknown>
  sourceVersions?: Record<string, unknown>
}): Promise<WorkspaceModelProjectionResult> {
  const target = await resolveWorkspaceProjectionTarget({
    kind: input.kind,
    target: input.target,
    snapshot: input.initialContent,
  })
  if (!target.targetPaths) return target.projection

  const created = writeWorkspaceProjectionIfMissing(target.targetPaths.workspacePath, input.initialContent)
  const meta = writeWorkspaceProjectionMetaIfMissing(target.targetPaths.metaPath, {
    schema: 'movscript.projection-meta.v1',
    workspaceKind: input.kind,
    entity: target.targetPaths.entity,
    source: {
      sourceVersions: input.sourceVersions ?? {},
    },
    state: {
      dirty: false,
      conflicts: [],
    },
  })
  writeWorkspaceProjectionSyncRecord({
    root: target.root,
    workspaceKind: input.kind,
    targetPaths: target.targetPaths,
    snapshot: input.initialContent,
    meta,
    action: created ? 'materialized' : 'opened',
  })

  return {
    materialized: true,
    created,
    workspaceRoot: target.root.workspaceDir,
    controlDir: target.root.controlDir,
    workspacePath: toControlRelativePath(target.root.controlDir, target.targetPaths.workspacePath),
    metaPath: toControlRelativePath(target.root.controlDir, target.targetPaths.metaPath),
    syncPath: toControlRelativePath(target.root.controlDir, target.targetPaths.syncPath),
    absoluteWorkspacePath: target.targetPaths.workspacePath,
    absoluteMetaPath: target.targetPaths.metaPath,
    absoluteSyncPath: target.targetPaths.syncPath,
    agentWritable: false,
  }
}

export async function writeWorkspaceModelProjectionSnapshot(input: {
  kind: MovScriptWorkspaceKind
  target: Record<string, unknown>
  snapshot: Record<string, unknown>
  sourceVersions?: Record<string, unknown>
}): Promise<WorkspaceModelProjectionResult> {
  const target = await resolveWorkspaceProjectionTarget({
    kind: input.kind,
    target: input.target,
    snapshot: input.snapshot,
  })
  if (!target.targetPaths) return target.projection
  writeJSONFile(target.targetPaths.workspacePath, input.snapshot)
  const meta = {
    schema: 'movscript.projection-meta.v1',
    workspaceKind: input.kind,
    entity: target.targetPaths.entity,
    source: {
      sourceVersions: input.sourceVersions ?? {},
    },
    state: {
      dirty: true,
      updatedAt: new Date().toISOString(),
      conflicts: [],
    },
  }
  writeJSONFile(target.targetPaths.metaPath, meta)
  writeWorkspaceProjectionSyncRecord({
    root: target.root,
    workspaceKind: input.kind,
    targetPaths: target.targetPaths,
    snapshot: input.snapshot,
    meta,
    action: 'updated',
  })
  return {
    materialized: true,
    created: false,
    workspaceRoot: target.root.workspaceDir,
    controlDir: target.root.controlDir,
    workspacePath: toControlRelativePath(target.root.controlDir, target.targetPaths.workspacePath),
    metaPath: toControlRelativePath(target.root.controlDir, target.targetPaths.metaPath),
    syncPath: toControlRelativePath(target.root.controlDir, target.targetPaths.syncPath),
    absoluteWorkspacePath: target.targetPaths.workspacePath,
    absoluteMetaPath: target.targetPaths.metaPath,
    absoluteSyncPath: target.targetPaths.syncPath,
    agentWritable: false,
  }
}

export async function refreshWorkspaceModelProjectionSnapshot(input: {
  kind: MovScriptWorkspaceKind
  target: Record<string, unknown>
  snapshot: Record<string, unknown>
  sourceVersions?: Record<string, unknown>
}): Promise<WorkspaceModelProjectionResult> {
  const target = await resolveWorkspaceProjectionTarget({
    kind: input.kind,
    target: input.target,
    snapshot: input.snapshot,
  })
  if (!target.targetPaths) return target.projection
  writeJSONFile(target.targetPaths.workspacePath, input.snapshot)
  const meta = {
    schema: 'movscript.projection-meta.v1',
    workspaceKind: input.kind,
    entity: target.targetPaths.entity,
    source: {
      sourceVersions: input.sourceVersions ?? {},
    },
    state: {
      dirty: false,
      refreshedAt: new Date().toISOString(),
      conflicts: [],
    },
  }
  writeJSONFile(target.targetPaths.metaPath, meta)
  writeWorkspaceProjectionSyncRecord({
    root: target.root,
    workspaceKind: input.kind,
    targetPaths: target.targetPaths,
    snapshot: input.snapshot,
    meta,
    action: 'refreshed',
  })
  return {
    materialized: true,
    created: false,
    workspaceRoot: target.root.workspaceDir,
    controlDir: target.root.controlDir,
    workspacePath: toControlRelativePath(target.root.controlDir, target.targetPaths.workspacePath),
    metaPath: toControlRelativePath(target.root.controlDir, target.targetPaths.metaPath),
    syncPath: toControlRelativePath(target.root.controlDir, target.targetPaths.syncPath),
    absoluteWorkspacePath: target.targetPaths.workspacePath,
    absoluteMetaPath: target.targetPaths.metaPath,
    absoluteSyncPath: target.targetPaths.syncPath,
    agentWritable: false,
  }
}

export async function readWorkspaceModelProjectionSnapshot(input: {
  kind?: MovScriptWorkspaceKind
  target?: Record<string, unknown>
  snapshot?: Record<string, unknown>
  workspacePath?: string
}): Promise<WorkspaceModelProjectionReadResult> {
  const workspaceDir = await resolveDefaultMovScriptWorkspaceDir()
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  ensureMovScriptWorkspaceRoot(root)

  if (input.workspacePath) {
    const absoluteWorkspacePath = resolveControlRelativePath(root.controlDir, input.workspacePath)
    const absoluteMetaPath = metaPathForWorkspacePath(absoluteWorkspacePath)
    const absoluteSyncPath = syncPathForWorkspacePath(root, absoluteWorkspacePath)
    const projection: WorkspaceModelProjectionResult = {
      materialized: true,
      created: false,
      workspaceRoot: root.workspaceDir,
      controlDir: root.controlDir,
      workspacePath: toControlRelativePath(root.controlDir, absoluteWorkspacePath),
      metaPath: toControlRelativePath(root.controlDir, absoluteMetaPath),
      syncPath: toControlRelativePath(root.controlDir, absoluteSyncPath),
      absoluteWorkspacePath,
      absoluteMetaPath,
      absoluteSyncPath,
      agentWritable: false,
    }
    const exists = existsSync(absoluteWorkspacePath)
    return {
      projection,
      exists,
      ...(exists ? { snapshot: readJSONRecord(absoluteWorkspacePath) } : {}),
      ...(existsSync(absoluteMetaPath) ? { meta: readJSONRecord(absoluteMetaPath) } : {}),
    }
  }

  if (!input.kind) {
    return {
      projection: {
        materialized: false,
        created: false,
        reason: 'workspace projection read requires kind or workspacePath',
        workspaceRoot: root.workspaceDir,
        controlDir: root.controlDir,
        agentWritable: false,
      },
      exists: false,
    }
  }

  const target = await resolveWorkspaceProjectionTarget({
    kind: input.kind,
    target: input.target ?? {},
    snapshot: input.snapshot ?? {},
  })
  if (!target.targetPaths) return { projection: target.projection, exists: false }
  const exists = existsSync(target.targetPaths.workspacePath)
  return {
    projection: {
      materialized: true,
      created: false,
      workspaceRoot: target.root.workspaceDir,
      controlDir: target.root.controlDir,
      workspacePath: toControlRelativePath(target.root.controlDir, target.targetPaths.workspacePath),
      metaPath: toControlRelativePath(target.root.controlDir, target.targetPaths.metaPath),
      syncPath: toControlRelativePath(target.root.controlDir, target.targetPaths.syncPath),
      absoluteWorkspacePath: target.targetPaths.workspacePath,
      absoluteMetaPath: target.targetPaths.metaPath,
      absoluteSyncPath: target.targetPaths.syncPath,
      agentWritable: false,
    },
    exists,
    ...(exists ? { snapshot: readJSONRecord(target.targetPaths.workspacePath) } : {}),
    ...(existsSync(target.targetPaths.metaPath) ? { meta: readJSONRecord(target.targetPaths.metaPath) } : {}),
  }
}

export function patchWorkspaceModelProjectionMetaState(
  projection: unknown,
  statePatch: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!isProjectionRecord(projection)) return undefined
  const metaPath = projection.absoluteMetaPath
    ?? (projection.controlDir && projection.metaPath ? resolveControlRelativePath(projection.controlDir, projection.metaPath) : undefined)
  if (!metaPath) return undefined
  const current = existsSync(metaPath) ? readJSONRecord(metaPath) : {}
  const currentState = isRecord(current.state) ? current.state : {}
  const next = {
    ...current,
    schema: 'movscript.projection-meta.v1',
    state: {
      ...currentState,
      ...statePatch,
      updatedAt: new Date().toISOString(),
    },
  }
  writeJSONFile(metaPath, next)
  writeWorkspaceProjectionSyncRecordFromProjection(projection, next, 'state_patched')
  return next
}

async function resolveWorkspaceProjectionTarget(input: {
  kind: MovScriptWorkspaceKind
  target: Record<string, unknown>
  snapshot: Record<string, unknown>
}): Promise<{
  root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>
  projection: WorkspaceModelProjectionResult
  targetPaths?: { workspacePath: string; metaPath: string; syncPath: string; entity: Record<string, unknown> }
}> {
  const workspaceDir = await resolveDefaultMovScriptWorkspaceDir()
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  ensureMovScriptWorkspaceRoot(root)

  const projectId = numericId(input.target.projectId) ?? numericId(input.snapshot.projectId)
  const userId = getMCPContextSnapshot().user?.id ?? 'local'
  if (projectId === undefined) {
    return {
      root,
      projection: {
        materialized: false,
        created: false,
        reason: 'projectId unavailable; workspace projection was not materialized',
        workspaceRoot: root.workspaceDir,
        controlDir: root.controlDir,
        agentWritable: false,
      },
    }
  }

  const projectPaths = resolveMovScriptProjectProjectionPaths({
    workspaceDir,
    userId,
    projectId,
  })
  const targetPaths = projectionTargetPaths(input.kind, projectPaths, projectId, input.target, input.snapshot)
  if (!targetPaths) {
    return {
      root,
      projection: {
        materialized: false,
        created: false,
        reason: `workspace kind ${input.kind} does not have a file projection path yet`,
        workspaceRoot: root.workspaceDir,
        controlDir: root.controlDir,
        agentWritable: false,
      },
    }
  }
  return {
    root,
    targetPaths: {
      ...targetPaths,
      syncPath: syncPathForWorkspacePath(root, targetPaths.workspacePath),
    },
    projection: {
      materialized: true,
      created: false,
      workspaceRoot: root.workspaceDir,
      controlDir: root.controlDir,
      workspacePath: toControlRelativePath(root.controlDir, targetPaths.workspacePath),
      metaPath: toControlRelativePath(root.controlDir, targetPaths.metaPath),
      syncPath: toControlRelativePath(root.controlDir, syncPathForWorkspacePath(root, targetPaths.workspacePath)),
      absoluteWorkspacePath: targetPaths.workspacePath,
      absoluteMetaPath: targetPaths.metaPath,
      absoluteSyncPath: syncPathForWorkspacePath(root, targetPaths.workspacePath),
      agentWritable: false,
    },
  }
}

function projectionTargetPaths(
  kind: MovScriptWorkspaceKind,
  projectPaths: ReturnType<typeof resolveMovScriptProjectProjectionPaths>,
  projectId: number,
  target: Record<string, unknown>,
  initialContent: Record<string, unknown>,
): { workspacePath: string; metaPath: string; entity: Record<string, unknown> } | undefined {
  if (kind === 'project_standards_workspace') {
    return {
      workspacePath: projectPaths.projectStandardsWorkspaceFile,
      metaPath: projectPaths.projectStandardsMetaFile,
      entity: { type: 'project', id: projectId, projectId },
    }
  }
  if (kind === 'setting_workspace') {
    return {
      workspacePath: projectPaths.settingWorkspaceFile,
      metaPath: projectPaths.settingMetaFile,
      entity: { type: 'project', id: projectId, projectId },
    }
  }
  if (kind === 'asset_workspace') {
    return {
      workspacePath: projectPaths.assetWorkspaceFile,
      metaPath: projectPaths.assetMetaFile,
      entity: { type: 'project', id: projectId, projectId },
    }
  }
  if (kind === 'production_workspace') {
    const productionId = numericId(target.entityId) ?? numericId(target.productionId) ?? numericId(initialContent.productionId)
    if (productionId === undefined) return undefined
    const productionPaths = resolveMovScriptProductionProjectionPaths(projectPaths, productionId)
    return {
      workspacePath: productionPaths.productionWorkspaceFile,
      metaPath: productionPaths.productionMetaFile,
      entity: { type: 'production', id: productionId, projectId },
    }
  }
  if (kind === 'content_unit_workspace') {
    const productionId = numericId(initialContent.productionId) ?? numericId(initialContent.production_id) ?? numericId(target.productionId) ?? numericId(target.production_id)
    const contentUnitId = numericId(target.contentUnitId)
      ?? numericId(target.content_unit_id)
      ?? numericId(initialContent.contentUnitId)
      ?? numericId(initialContent.content_unit_id)
      ?? (target.entityType === 'content_unit' ? numericId(target.entityId) : undefined)
    const sceneMomentId = numericId(target.sceneMomentId)
      ?? numericId(target.scene_moment_id)
      ?? numericId(initialContent.sceneMomentId)
      ?? numericId(initialContent.scene_moment_id)
      ?? (target.entityType === 'scene_moment' ? numericId(target.entityId) : undefined)
    if (productionId === undefined || sceneMomentId === undefined) return undefined
    const productionPaths = resolveMovScriptProductionProjectionPaths(projectPaths, productionId)
    const contentUnitPaths = resolveMovScriptContentUnitProjectionPaths(productionPaths, {
      sceneMomentId,
      ...(contentUnitId !== undefined ? { contentUnitId } : {}),
    })
    if (contentUnitId !== undefined) {
      return {
        workspacePath: contentUnitPaths.contentUnitWorkspaceFile,
        metaPath: contentUnitPaths.contentUnitMetaFile,
        entity: { type: 'content_unit', id: contentUnitId, sceneMomentId, productionId, projectId },
      }
    }
    return {
      workspacePath: contentUnitPaths.contentUnitWorkspaceFile,
      metaPath: contentUnitPaths.contentUnitMetaFile,
      entity: { type: 'scene_moment', id: sceneMomentId, productionId, projectId },
    }
  }
  return undefined
}

function writeWorkspaceProjectionIfMissing(path: string, value: Record<string, unknown>): boolean {
  if (existsSync(path)) return false
  writeJSONFile(path, value)
  return true
}

function writeWorkspaceProjectionMetaIfMissing(path: string, value: Record<string, unknown>): Record<string, unknown> {
  if (existsSync(path)) return readJSONRecord(path)
  writeJSONFile(path, value)
  return value
}

function writeWorkspaceProjectionSyncRecord(input: {
  root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>
  workspaceKind: MovScriptWorkspaceKind
  targetPaths: { workspacePath: string; metaPath: string; syncPath: string; entity: Record<string, unknown> }
  snapshot: Record<string, unknown>
  meta: Record<string, unknown>
  action: string
}): void {
  writeJSONFile(input.targetPaths.syncPath, {
    schema: 'movscript.projection-sync.v1',
    workspaceKind: input.workspaceKind,
    entity: input.targetPaths.entity,
    workspacePath: toControlRelativePath(input.root.controlDir, input.targetPaths.workspacePath),
    metaPath: toControlRelativePath(input.root.controlDir, input.targetPaths.metaPath),
    contentHash: projectionContentHash(input.snapshot),
    hashAlgorithm: 'sha256:stable-json-v1',
    action: input.action,
    updatedAt: new Date().toISOString(),
    ...(isRecord(input.meta.source) ? { source: input.meta.source } : {}),
    ...(isRecord(input.meta.state) ? { state: input.meta.state } : {}),
  })
}

function writeWorkspaceProjectionSyncRecordFromProjection(
  projection: {
    controlDir?: string
    workspacePath?: string
    metaPath?: string
    syncPath?: string
    absoluteWorkspacePath?: string
    absoluteMetaPath?: string
    absoluteSyncPath?: string
  },
  meta: Record<string, unknown>,
  action: string,
): void {
  const controlDir = projection.controlDir
  if (!controlDir) return
  const workspacePath = projection.absoluteWorkspacePath
    ?? (projection.workspacePath ? resolveControlRelativePath(controlDir, projection.workspacePath) : undefined)
  if (!workspacePath || !existsSync(workspacePath)) return
  const metaPath = projection.absoluteMetaPath
    ?? (projection.metaPath ? resolveControlRelativePath(controlDir, projection.metaPath) : metaPathForWorkspacePath(workspacePath))
  const syncPath = projection.absoluteSyncPath
    ?? (projection.syncPath ? resolveControlRelativePath(controlDir, projection.syncPath) : syncPathForControlWorkspacePath(controlDir, workspacePath))
  const snapshot = readJSONRecord(workspacePath)
  writeJSONFile(syncPath, {
    schema: 'movscript.projection-sync.v1',
    ...(typeof meta.workspaceKind === 'string' ? { workspaceKind: meta.workspaceKind } : {}),
    ...(isRecord(meta.entity) ? { entity: meta.entity } : {}),
    workspacePath: toControlRelativePath(controlDir, workspacePath),
    metaPath: toControlRelativePath(controlDir, metaPath),
    contentHash: projectionContentHash(snapshot),
    hashAlgorithm: 'sha256:stable-json-v1',
    action,
    updatedAt: new Date().toISOString(),
    ...(isRecord(meta.source) ? { source: meta.source } : {}),
    ...(isRecord(meta.state) ? { state: meta.state } : {}),
  })
}

function toControlRelativePath(controlDir: string, path: string): string {
  return relative(controlDir, path).split('\\').join('/')
}

function numericId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function readJSONRecord(path: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`workspace projection file must contain a JSON object: ${path}`)
  }
  return parsed as Record<string, unknown>
}

function isProjectionRecord(value: unknown): value is {
  controlDir?: string
  metaPath?: string
  absoluteMetaPath?: string
} {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function writeJSONFile(path: string, value: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function projectionContentHash(value: Record<string, unknown>): string {
  return createHash('sha256').update(stableJSONStringify(value)).digest('hex')
}

function stableJSONStringify(value: unknown): string {
  if (!isRecord(value)) return JSON.stringify(value) ?? 'undefined'
  return JSON.stringify(sortJSONValue(value))
}

function sortJSONValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJSONValue)
  if (!isRecord(value)) return value
  const next: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) next[key] = sortJSONValue(value[key])
  return next
}

function resolveControlRelativePath(controlDir: string, path: string): string {
  const normalized = path.replace(/^[/\\]+/, '')
  const absolutePath = resolve(controlDir, normalized)
  const relativePath = relative(controlDir, absolutePath)
  if (relativePath === '' || (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))) {
    return absolutePath
  }
  throw new Error('workspace projection path must stay inside the MovScript workspace directory')
}

function metaPathForWorkspacePath(path: string): string {
  if (path.endsWith('.workspace.json')) return path.replace(/\.workspace\.json$/, '.meta.json')
  if (path.endsWith('.json')) return path.replace(/\.json$/, '.meta.json')
  return `${path}.meta.json`
}

function syncPathForWorkspacePath(root: ReturnType<typeof resolveMovScriptWorkspaceRootPaths>, workspacePath: string): string {
  const projectionRelativePath = relative(root.projectionRootDir, workspacePath)
  if (projectionRelativePath === '' || projectionRelativePath.startsWith(`..${sep}`) || projectionRelativePath === '..' || isAbsolute(projectionRelativePath)) {
    throw new Error('workspace sync path requires a projection under .movscript/data')
  }
  return join(root.syncDir, syncRelativePathForProjectionPath(projectionRelativePath))
}

function syncPathForControlWorkspacePath(controlDir: string, workspacePath: string): string {
  const projectionRootDir = join(controlDir, 'data')
  const syncDir = join(controlDir, 'sync')
  const projectionRelativePath = relative(projectionRootDir, workspacePath)
  if (projectionRelativePath === '' || projectionRelativePath.startsWith(`..${sep}`) || projectionRelativePath === '..' || isAbsolute(projectionRelativePath)) {
    throw new Error('workspace sync path requires a projection under .movscript/data')
  }
  return join(syncDir, syncRelativePathForProjectionPath(projectionRelativePath))
}

function syncRelativePathForProjectionPath(projectionRelativePath: string): string {
  if (projectionRelativePath.endsWith('.workspace.json')) return projectionRelativePath.replace(/\.workspace\.json$/, '.sync.json')
  if (projectionRelativePath.endsWith('.json')) return projectionRelativePath.replace(/\.json$/, '.sync.json')
  return `${projectionRelativePath}.sync.json`
}

async function resolveDefaultMovScriptWorkspaceDir(): Promise<string> {
  if (process.env.MOVSCRIPT_WORKSPACE_DIR) return process.env.MOVSCRIPT_WORKSPACE_DIR
  try {
    const { resolveDesktopDefaultMovScriptWorkspaceDir } = await import('../../services/movscriptWorkspaceDefaults')
    return resolveDesktopDefaultMovScriptWorkspaceDir()
  } catch (error) {
    if (isElectronAppExportError(error)) return resolveDefaultMovScriptWorkspaceDirFromEnv()
    throw error
  }
}

function isElectronAppExportError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error)
  return message.includes("does not provide an export named 'app'")
    || message.includes("Cannot read properties of undefined (reading 'isPackaged')")
}
