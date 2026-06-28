import {
  listSurfaceSemanticEntities as listSemanticEntities,
  semanticEntityConfig,
  type SurfaceSemanticEntityKind,
  type SemanticEntityRecord,
} from '@movscript/shared/semantic-entities'
import { readSurfaceHostApi } from '@movscript/shared'
import {
  buildContentSourceWorkspaceProjectTimelineStatus,
  type ContentSourceWorkspaceSnapshot,
} from '@movscript/core/content'

export type ProjectOverviewRecord = SemanticEntityRecord & {
  description?: string
  summary?: string
  progress?: number
}

export interface ProjectOverviewData {
  scriptVersions: ProjectOverviewRecord[]
  segments: ProjectOverviewRecord[]
  sceneMoments: ProjectOverviewRecord[]
  productions: ProjectOverviewRecord[]
  settings: ProjectOverviewRecord[]
  assetSlots: ProjectOverviewRecord[]
  contentUnits: ProjectOverviewRecord[]
  keyframes: ProjectOverviewRecord[]
  candidateView?: ProjectOverviewCandidateView
  projectTimelineStatus?: Record<string, unknown>
}

export interface ProjectOverviewCandidateView extends Record<string, unknown> {
  contexts?: Record<string, unknown>[]
}

export const emptyProjectOverviewData: ProjectOverviewData = {
  scriptVersions: [],
  segments: [],
  sceneMoments: [],
  productions: [],
  settings: [],
  assetSlots: [],
  contentUnits: [],
  keyframes: [],
}

export interface ProjectOverviewLoadContext {
  projectDir?: string
  projectUid?: string
  userId?: string | number
  orgId?: string | number
  scopeKind?: 'user' | 'org'
  scopeId?: string | number
  gatewayBaseURL?: string
  projectGateway?: ProjectOverviewProjectGateway
}

export interface ProjectOverviewProjectGateway {
  resourceView?: (input: {
    projectId?: string
    projectDir?: string
    projectUid?: string
    kind: string
    input?: unknown
  }) => Promise<unknown>
  candidateView?: (input: {
    projectId?: string
    projectDir?: string
    projectUid?: string
    contentUnitIds: string[]
    input?: unknown
  }) => Promise<unknown>
}

export async function loadProjectOverviewData(
  projectId: number,
  context: ProjectOverviewLoadContext = {},
): Promise<ProjectOverviewData> {
  const [
    scriptVersions,
    segments,
    sceneMoments,
    productions,
    settings,
    assetSlots,
    contentUnits,
    keyframes,
    projectTimelineStatus,
  ] = await Promise.all([
    safeList(projectId, 'scriptVersions'),
    safeList(projectId, 'segments'),
    safeList(projectId, 'sceneMoments'),
    safeList(projectId, 'productions'),
    safeList(projectId, 'settings'),
    safeList(projectId, 'assetSlots'),
    safeList(projectId, 'contentUnits'),
    safeList(projectId, 'keyframes'),
    safeProjectTimelineStatus(projectId, context),
  ])
  const [resourceAssetSlots, resourceContentUnits] = await Promise.all([
    safeProjectResourceViewRecords(context, 'assets'),
    safeProjectResourceViewRecords(context, 'content-units'),
  ])
  const resolvedAssetSlots = resourceAssetSlots.length ? resourceAssetSlots : assetSlots
  const resolvedContentUnits = resourceContentUnits.length ? resourceContentUnits : contentUnits
  const candidateView = await safeProjectCandidateView(context, settings, resolvedContentUnits)

  return {
    scriptVersions,
    segments,
    sceneMoments,
    productions,
    settings,
    assetSlots: resolvedAssetSlots,
    contentUnits: resolvedContentUnits,
    keyframes,
    ...(candidateView ? { candidateView } : {}),
    ...(projectTimelineStatus ? { projectTimelineStatus } : {}),
  }
}

async function safeList(projectId: number, kind: SurfaceSemanticEntityKind): Promise<ProjectOverviewRecord[]> {
  try {
    return projectOverviewRecordArray(await listSemanticEntities(projectId, semanticEntityConfig(kind)), kind)
  } catch (error) {
    console.warn(`[project-home] failed to load ${kind}`, error)
    return []
  }
}

async function safeProjectTimelineStatus(
  projectId: number,
  context: ProjectOverviewLoadContext,
): Promise<Record<string, unknown> | undefined> {
  const loadSnapshot = readSurfaceHostApi()?.loadMovScriptEngineContentWorkspaceSnapshot
  if (!loadSnapshot) return undefined
  try {
    const snapshot = await loadSnapshot({
      ...context,
      projectId,
    }) as ContentSourceWorkspaceSnapshot
    return buildContentSourceWorkspaceProjectTimelineStatus(snapshot)
  } catch (error) {
    console.warn('[project-home] failed to load project timeline status', error)
    return undefined
  }
}

function projectOverviewRecordArray(value: unknown, kind?: SurfaceSemanticEntityKind): ProjectOverviewRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord) as ProjectOverviewRecord[]
  if (!isRecord(value)) return []
  const candidates = [
    value.items,
    value.records,
    value.data,
    kind ? value[kind] : undefined,
    kind === 'settings' ? value.settings : undefined,
    kind === 'assetSlots' ? value.assets : undefined,
    kind === 'contentUnits' ? value.contentUnits ?? value.content_units : undefined,
    kind === 'scriptVersions' ? value.scriptVersions ?? value.script_versions : undefined,
    kind === 'segments' ? value.segments : undefined,
    kind === 'sceneMoments' ? value.sceneMoments ?? value.scene_moments : undefined,
    kind === 'productions' ? value.productions : undefined,
    kind === 'keyframes' ? value.keyframes : undefined,
  ]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(isRecord) as ProjectOverviewRecord[]
  }
  return []
}

async function safeProjectCandidateView(
  context: ProjectOverviewLoadContext,
  settings: ProjectOverviewRecord[],
  contentUnits: ProjectOverviewRecord[],
): Promise<ProjectOverviewCandidateView | undefined> {
  if (!context.projectDir) return undefined
  const contentUnitIds = projectOverviewCandidateContentUnitIds(settings, contentUnits)
  if (!contentUnitIds.length) return undefined
  try {
    if (context.projectGateway?.candidateView) {
      const payload = await context.projectGateway.candidateView({
        projectDir: context.projectDir,
        projectUid: context.projectUid,
        contentUnitIds,
        input: projectOverviewScopePayload(context),
      })
      return isRecord(payload) ? payload as ProjectOverviewCandidateView : undefined
    }
    const baseURL = projectOverviewGatewayBaseURL(context)
    if (!baseURL) return undefined
    const scope = projectOverviewDataScope(context)
    const decisionStore = context.projectUid && scope ? {
      kind: 'scoped-project-data',
      baseUrl: baseURL,
      projectUid: context.projectUid,
      scopeKind: scope.kind,
      scopeId: scope.id,
    } : undefined
    const response = await fetch(`${baseURL}/v1/project/candidates/view`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectDir: context.projectDir,
        contentUnitIds,
        ...(context.projectUid ? { projectUid: context.projectUid } : {}),
        ...projectOverviewScopePayload(context),
        ...(decisionStore ? { decisionStore } : {}),
      }),
    })
    if (!response.ok) {
      console.warn('[project-home] failed to load candidate view', {
        status: response.status,
        endpoint: '/v1/project/candidates/view',
        contentUnitCount: contentUnitIds.length,
      })
      return undefined
    }
    const payload = await response.json().catch(() => undefined)
    return isRecord(payload) ? payload as ProjectOverviewCandidateView : undefined
  } catch (error) {
    console.warn('[project-home] failed to load candidate view', error)
    return undefined
  }
}

async function safeProjectResourceViewRecords(
  context: ProjectOverviewLoadContext,
  kind: 'assets' | 'content-units',
): Promise<ProjectOverviewRecord[]> {
  if (!context.projectDir) return []
  try {
    if (context.projectGateway?.resourceView) {
      const payload = await context.projectGateway.resourceView({
        projectDir: context.projectDir,
        projectUid: context.projectUid,
        kind,
      })
      return projectOverviewResourceItems(payload)
    }
    const baseURL = projectOverviewGatewayBaseURL(context)
    if (!baseURL) return []
    const response = await fetch(`${baseURL}/v1/project/resources/view`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectDir: context.projectDir,
        kind,
      }),
    })
    if (!response.ok) {
      console.warn('[project-home] failed to load project resource view', {
        kind,
        status: response.status,
        endpoint: '/v1/project/resources/view',
      })
      return []
    }
    const payload = await response.json().catch(() => undefined)
    return projectOverviewResourceItems(payload)
  } catch (error) {
    console.warn('[project-home] failed to load project resource view', { kind, error })
    return []
  }
}

function projectOverviewGatewayBaseURL(context: ProjectOverviewLoadContext): string | undefined {
  return normalizeProjectOverviewBaseURL(context.gatewayBaseURL) ?? browserHTTPOrigin()
}

function normalizeProjectOverviewBaseURL(value: string | undefined): string | undefined {
  const baseURL = value?.trim()
  if (!baseURL || !/^https?:\/\//i.test(baseURL)) return undefined
  return baseURL.replace(/\/+$/, '')
}

function browserHTTPOrigin(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const { protocol, host } = window.location
  if (protocol !== 'http:' && protocol !== 'https:') return undefined
  return normalizeProjectOverviewBaseURL(`${protocol}//${host}`)
}

function projectOverviewDataScope(context: ProjectOverviewLoadContext): { kind: 'user' | 'org'; id: string | number } | undefined {
  if (context.scopeKind === 'org' && context.scopeId !== undefined) return { kind: 'org', id: context.scopeId }
  if (context.scopeKind === 'user' && context.scopeId !== undefined) return { kind: 'user', id: context.scopeId }
  if (context.orgId !== undefined) return { kind: 'org', id: context.orgId }
  if (context.userId !== undefined) return { kind: 'user', id: context.userId }
  return undefined
}

function projectOverviewScopePayload(context: ProjectOverviewLoadContext): Record<string, unknown> {
  const scope = projectOverviewDataScope(context)
  return scope ? { scopeKind: scope.kind, scopeId: scope.id } : {}
}

function projectOverviewResourceItems(payload: unknown): ProjectOverviewRecord[] {
  const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : []
  return items.filter(isRecord) as ProjectOverviewRecord[]
}

function projectOverviewCandidateContentUnitIds(
  settings: ProjectOverviewRecord[],
  contentUnits: ProjectOverviewRecord[],
): string[] {
  const settingTokens = settings.map(projectOverviewSettingToken).filter((token): token is string => Boolean(token))
  const directMatches: string[] = []
  const fallbackImageUnits: string[] = []
  for (const unit of contentUnits) {
    const id = stringValue(unit.id ?? unit.content_unit_id ?? unit.contentUnitId) ?? numberIdValue(unit.ID)
    if (!id) continue
    const haystack = projectOverviewContentUnitSettingHaystack(unit).toLowerCase()
    const type = stringValue(unit.content_unit_type ?? unit.contentUnitType ?? unit.target_kind ?? unit.targetKind)?.toLowerCase() ?? ''
    const outputKind = projectOverviewContentUnitOutputKind(unit)
    const hasAssetReference = Boolean(stringValue(unit.asset_ref ?? unit.assetRef))
    const isAssetUnit = type.includes('asset') || hasAssetReference
    if (outputKind !== 'image' && !isAssetUnit) continue
    const isSettingUnit = type.includes('setting') || isAssetUnit || settingTokens.some((token) => haystack.includes(token))
    if (isSettingUnit) directMatches.push(id)
    fallbackImageUnits.push(id)
  }
  return Array.from(new Set(directMatches.length ? directMatches : fallbackImageUnits)).slice(0, 80)
}

function projectOverviewSettingToken(record: ProjectOverviewRecord): string | undefined {
  const id = stringValue(record.id) ?? numberIdValue(record.ID)
  return id?.toLowerCase()
}

function projectOverviewContentUnitOutputKind(record: ProjectOverviewRecord): string {
  const kind = stringValue(record.output_kind ?? record.outputKind ?? record.kind ?? record.type)?.toLowerCase() ?? ''
  if (kind.startsWith('image/') || kind === 'storyboard' || kind.includes('png') || kind.includes('jpg') || kind.includes('jpeg') || kind.includes('webp')) return 'image'
  return kind || 'unknown'
}

function projectOverviewContentUnitSettingHaystack(record: ProjectOverviewRecord): string {
  return [
    record.id,
    record.content_unit_id,
    record.contentUnitId,
    record.target_ref,
    record.targetRef,
    record.setting_ref,
    record.settingRef,
    record.setting_id,
    record.settingId,
    record.asset_ref,
    record.assetRef,
    record.__workspace_path,
    record.path,
    record.title,
    record.name,
  ].map((part) => stringValue(part)).filter(Boolean).join(' ')
}

function numberIdValue(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
