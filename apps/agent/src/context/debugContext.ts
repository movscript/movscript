import type { JSONValue } from '../types.js'
import { isRecord } from '../jsonValue.js'
import type {
  AgentDebugContextPanel,
  AgentRunDebugTrace,
  AgentCapabilitiesResponse,
  ResolvedAgentSkill,
} from '../state/types.js'
import type { AgentManifest } from '../catalog/agentManifest.js'
import type { AgentMemory } from '../memory/types.js'
import type { CompiledPromptPreview } from '../state/types.js'
import type { AgentClientResourceRef } from '../state/types.js'
import { isValidAgentEntityId, isValidAgentProjectId, isValidAgentReferenceId, parseToolResult } from './runtimeContext.js'
import type { NormalizedClientInput } from './normalizeClientInput.js'

export function buildDebugContext(contextResult: JSONValue, memories: AgentMemory[], clientInput?: NormalizedClientInput): AgentDebugContextPanel {
  const parsed = parseToolResult(contextResult)
  const snapshot = isRecord(parsed) && isRecord(parsed.focus) ? parsed.focus : isRecord(parsed) && isRecord(parsed.snapshot) ? parsed.snapshot : parsed
  const project = isRecord(snapshot) && isRecord(snapshot.project) ? snapshot.project : undefined
  const projectId = isValidAgentProjectId(project?.id) ? project.id : isValidAgentProjectId(project?.ID) ? project.ID : undefined
  const productionId = isRecord(snapshot) && isValidAgentEntityId(snapshot.productionId)
    ? snapshot.productionId
    : isRecord(snapshot) && isValidAgentEntityId(snapshot.currentProductionId)
      ? snapshot.currentProductionId
      : undefined
  const route = isRecord(snapshot) && isRecord(snapshot.route) ? snapshot.route : undefined
  const user = isRecord(snapshot) && isRecord(snapshot.user) ? snapshot.user : undefined
  const selection = isRecord(snapshot) && isRecord(snapshot.selection) ? snapshot.selection : undefined
  const projects = normalizeDebugProjects(isRecord(parsed) ? parsed.projects : isRecord(snapshot) ? snapshot.projects : undefined)
  const projectsError = isRecord(parsed) && typeof parsed.projectsError === 'string'
    ? parsed.projectsError
    : isRecord(snapshot) && typeof snapshot.projectsError === 'string'
      ? snapshot.projectsError
      : undefined
  const ui = clientInput?.uiSnapshot
  const uiProject = ui?.project
  const uiProductionId = isValidAgentEntityId(ui?.productionId) ? ui.productionId : undefined
  const uiSelection = ui?.selection
  const mergedProjectId = isValidAgentProjectId(projectId)
    ? projectId
    : isValidAgentProjectId(uiProject?.id)
      ? uiProject.id
      : undefined
  return {
    route: {
      pathname: typeof route?.pathname === 'string' ? route.pathname : ui?.route?.pathname ?? '/',
      ...(typeof route?.search === 'string' ? { search: route.search } : typeof ui?.route?.search === 'string' ? { search: ui.route.search } : {}),
      ...(typeof route?.hash === 'string' ? { hash: route.hash } : typeof ui?.route?.hash === 'string' ? { hash: ui.route.hash } : {}),
    },
    projects,
    ...(projectsError ? { projectsError } : {}),
    ...((project || uiProject) && mergedProjectId !== undefined ? {
      project: {
        id: mergedProjectId,
        ...(typeof project?.name === 'string' ? { name: project.name } : typeof uiProject?.name === 'string' ? { name: uiProject.name } : {}),
        ...(typeof project?.status === 'string' ? { status: project.status } : typeof uiProject?.status === 'string' ? { status: uiProject.status } : {}),
        ...(typeof project?.description === 'string' ? { description: project.description } : typeof uiProject?.description === 'string' ? { description: uiProject.description } : {}),
        ...(typeof project?.aspect_ratio === 'string' ? { aspect_ratio: project.aspect_ratio } : typeof uiProject?.aspect_ratio === 'string' ? { aspect_ratio: uiProject.aspect_ratio } : {}),
        ...(typeof project?.visual_style === 'string' ? { visual_style: project.visual_style } : typeof uiProject?.visual_style === 'string' ? { visual_style: uiProject.visual_style } : {}),
        ...(typeof project?.project_style === 'string' ? { project_style: project.project_style } : typeof uiProject?.project_style === 'string' ? { project_style: uiProject.project_style } : {}),
      },
    } : {}),
    ...(isValidAgentEntityId(productionId) ? { productionId } : isValidAgentEntityId(uiProductionId) ? { productionId: uiProductionId } : {}),
    ...(user && isValidAgentEntityId(user.id) && typeof user.username === 'string' ? { user: { id: user.id, username: user.username, ...(typeof user.systemRole === 'string' ? { systemRole: user.systemRole } : {}) } } : {}),
    ...(selection && typeof selection.entityType === 'string' && isValidAgentReferenceId(selection.entityId) ? {
      selection: { entityType: selection.entityType, entityId: selection.entityId, ...(typeof selection.label === 'string' ? { label: selection.label } : {}) },
    } : uiSelection && typeof uiSelection.entityType === 'string' && isValidAgentReferenceId(uiSelection.entityId) ? {
      selection: { entityType: uiSelection.entityType, entityId: uiSelection.entityId, ...(typeof uiSelection.label === 'string' ? { label: uiSelection.label } : {}) },
    } : { selection: null }),
    recentResources: mergeDebugResources(
      normalizeDebugResources(isRecord(snapshot) ? snapshot.recentResources : undefined),
      ui?.recentResources ?? [],
    ),
    attachments: clientInput?.attachments.map((a) => ({
      id: a.id ?? (isValidAgentEntityId(a.resourceId) ? `resource-${a.resourceId}` : a.name ?? 'attachment'),
      name: a.name ?? '未命名附件',
      type: a.type ?? 'file',
      ...(isValidAgentEntityId(a.resourceId) ? { resourceId: a.resourceId } : {}),
    })) ?? [],
    memories: memories.map((m) => ({ id: m.id, projectId: m.projectId, title: m.title, kind: m.kind, content: m.content })),
    labels: ui?.labels ?? [],
    statusDigest: buildStatusDigest(snapshot),
    rawContextHints: buildRawContextHints(snapshot),
  }
}

export function normalizeDebugProjects(value: unknown): AgentDebugContextPanel['projects'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const id = isValidAgentProjectId(item.id) ? item.id : isValidAgentProjectId(item.ID) ? item.ID : undefined
    const name = typeof item.name === 'string' && item.name.trim()
      ? item.name.trim()
      : typeof item.title === 'string' && item.title.trim()
        ? item.title.trim()
        : undefined
    if (id === undefined || !name) return []
    const totalEpisodes = typeof item.totalEpisodes === 'number'
      ? item.totalEpisodes
      : typeof item.total_episodes === 'number'
        ? item.total_episodes
        : undefined
    return [{
      id,
      name,
      ...(typeof item.description === 'string' && item.description.trim() ? { description: item.description.trim() } : {}),
      ...(typeof item.status === 'string' && item.status.trim() ? { status: item.status.trim() } : {}),
      ...(typeof totalEpisodes === 'number' ? { totalEpisodes } : {}),
    }]
  })
}

export function buildDebugTrace(
  manifest: AgentManifest,
  skills: ResolvedAgentSkill[],
  tools: AgentCapabilitiesResponse['resolvedTools'],
  promptPartIds: string[],
  layerTrace?: {
    profileId: string
    profileVersion: string
    profileLayers: Array<{ source: string; id: string; version: string }>
    personaId?: string
    policyIds: string[]
    workflowIds: string[]
    intentSignals?: Array<{
      intent: string
      source: string
      confidence: string
      evidence: string
    }>
    workflowTriggers?: Array<{
      id: string
      matched: boolean
      matchedTriggerKind?: string
      priority: number
      selected: boolean
      reason: string
    }>
  },
): AgentRunDebugTrace {
  return {
    manifestId: manifest.id,
    manifestVersion: manifest.version,
    skillIds: skills.map((s) => s.id),
    availableToolNames: tools.available.map((t) => t.name),
    blockedTools: tools.blocked.map((t) => ({ name: t.name, ...(t.unavailableReason ? { reason: t.unavailableReason } : {}) })),
    promptPartIds,
    ...(manifest.model ? { model: manifest.model } : {}),
    ...(layerTrace ? { layerTrace } : {}),
  }
}

export function normalizeDebugResources(value: unknown): AgentDebugContextPanel['recentResources'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const id = isValidAgentEntityId(item.id) ? item.id : isValidAgentEntityId(item.ID) ? item.ID : undefined
    const name = typeof item.name === 'string' ? item.name : undefined
    const type = typeof item.type === 'string' ? item.type : undefined
    if (id === undefined || !name || !type) return []
    return [{ id, name, type, ...(typeof item.mimeType === 'string' ? { mimeType: item.mimeType } : typeof item.mime_type === 'string' ? { mimeType: item.mime_type } : {}), ...(typeof item.size === 'number' ? { size: item.size } : {}) }]
  })
}

export function mergeDebugResources(base: AgentDebugContextPanel['recentResources'], extra: AgentClientResourceRef[]): AgentDebugContextPanel['recentResources'] {
  const byId = new Map<number, AgentDebugContextPanel['recentResources'][number]>()
  for (const r of base) byId.set(r.id, r)
  for (const r of extra) {
    if (!isValidAgentEntityId(r.id) || !r.name || !r.type) continue
    byId.set(r.id, { id: r.id, name: r.name, type: r.type, ...(r.mimeType ? { mimeType: r.mimeType } : {}), ...(typeof r.size === 'number' ? { size: r.size } : {}) })
  }
  return Array.from(byId.values())
}

function buildStatusDigest(snapshot: unknown): string[] {
  if (!isRecord(snapshot)) return []
  const lines: string[] = []
  for (const key of ['production', 'currentProduction', 'script', 'currentScript']) {
    const value = snapshot[key]
    if (isRecord(value)) lines.push(`${labelize(key)}: ${summarizeRecord(value)}`)
  }
  for (const key of ['productions', 'scripts', 'creativeReferences', 'semanticEntities', 'assetSlots', 'drafts', 'recentResources']) {
    const value = snapshot[key]
    if (Array.isArray(value)) lines.push(`${labelize(key)}: ${value.length} item(s)${sampleRecords(value)}`)
  }
  for (const key of ['productionSummary', 'scriptSummary', 'currentStatus', 'status', 'summary']) {
    const value = snapshot[key]
    if (typeof value === 'string' && value.trim()) lines.push(`${labelize(key)}: ${value.trim().slice(0, 300)}`)
  }
  return Array.from(new Set(lines)).slice(0, 20)
}

function buildRawContextHints(snapshot: unknown): string[] {
  if (!isRecord(snapshot)) return []
  return Object.entries(snapshot)
    .flatMap(([key, value]) => {
      if (value === null || value === undefined) return []
      if (Array.isArray(value)) return [`${key}: array(${value.length})`]
      if (isRecord(value)) return [`${key}: object(${Object.keys(value).slice(0, 12).join(', ')})`]
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [`${key}: ${String(value).slice(0, 160)}`]
      return []
    })
    .slice(0, 30)
}

function sampleRecords(_items: unknown[]): string {
  return ''
}

function summarizeRecord(record: Record<string, unknown>): string {
  const parts = [
    readString(record, ['name', 'title', 'label']),
    readString(record, ['status', 'kind', 'type']),
    readString(record, ['summary', 'description']),
  ].filter(Boolean)
  const id = typeof record.id === 'number' || typeof record.id === 'string'
    ? `#${record.id}`
    : typeof record.ID === 'number' || typeof record.ID === 'string'
      ? `#${record.ID}`
      : undefined
  return [id, ...parts].filter(Boolean).join(' ').slice(0, 240) || Object.keys(record).slice(0, 8).join(', ')
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function labelize(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}
