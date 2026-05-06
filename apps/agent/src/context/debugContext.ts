import type { JSONValue } from '../types.js'
import type {
  AgentDebugContextPanel,
  AgentRunDebugTrace,
  AgentCapabilitiesResponse,
  ResolvedAgentSkill,
} from '../state/types.js'
import type { AgentManifest } from '../manifest/agentManifest.js'
import type { AgentMemory } from '../memory/types.js'
import type { CompiledPromptPreview } from '../state/types.js'
import type { AgentClientResourceRef } from '../state/types.js'
import { parseToolResult } from './runtimeContext.js'
import type { NormalizedClientInput } from './normalizeClientInput.js'

export function buildDebugContext(contextResult: JSONValue, memories: AgentMemory[], clientInput?: NormalizedClientInput): AgentDebugContextPanel {
  const parsed = parseToolResult(contextResult)
  const snapshot = isRecord(parsed) && isRecord(parsed.snapshot) ? parsed.snapshot : parsed
  const project = isRecord(snapshot) && isRecord(snapshot.project) ? snapshot.project : undefined
  const projectId = typeof project?.id === 'number' ? project.id : typeof project?.ID === 'number' ? project.ID : undefined
  const productionId = isRecord(snapshot) && typeof snapshot.productionId === 'number'
    ? snapshot.productionId
    : isRecord(snapshot) && typeof snapshot.currentProductionId === 'number'
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
  const uiProductionId = typeof ui?.productionId === 'number' ? ui.productionId : undefined
  const uiSelection = ui?.selection
  const mergedProjectId = typeof projectId === 'number' ? projectId : uiProject?.id
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
      },
    } : {}),
    ...(typeof productionId === 'number' ? { productionId } : typeof uiProductionId === 'number' ? { productionId: uiProductionId } : {}),
    ...(user && typeof user.id === 'number' && typeof user.username === 'string' ? { user: { id: user.id, username: user.username, ...(typeof user.systemRole === 'string' ? { systemRole: user.systemRole } : {}) } } : {}),
    ...(selection && typeof selection.entityType === 'string' && (typeof selection.entityId === 'number' || typeof selection.entityId === 'string') ? {
      selection: { entityType: selection.entityType, entityId: selection.entityId, ...(typeof selection.label === 'string' ? { label: selection.label } : {}) },
    } : uiSelection && typeof uiSelection.entityType === 'string' && (typeof uiSelection.entityId === 'number' || typeof uiSelection.entityId === 'string') ? {
      selection: { entityType: uiSelection.entityType, entityId: uiSelection.entityId, ...(typeof uiSelection.label === 'string' ? { label: uiSelection.label } : {}) },
    } : { selection: null }),
    recentResources: mergeDebugResources(
      normalizeDebugResources(isRecord(snapshot) ? snapshot.recentResources : undefined),
      ui?.recentResources ?? [],
    ),
    attachments: clientInput?.attachments.map((a) => ({
      id: a.id ?? (a.resourceId !== undefined ? `resource-${a.resourceId}` : a.name ?? 'attachment'),
      name: a.name ?? '未命名附件',
      type: a.type ?? 'file',
      ...(a.resourceId !== undefined ? { resourceId: a.resourceId } : {}),
    })) ?? [],
    memories: memories.map((m) => ({ id: m.id, scope: m.scope, kind: m.kind, content: m.content })),
    labels: ui?.labels ?? [],
  }
}

export function normalizeDebugProjects(value: unknown): AgentDebugContextPanel['projects'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const id = typeof item.id === 'number' ? item.id : typeof item.ID === 'number' ? item.ID : undefined
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
): AgentRunDebugTrace {
  return {
    manifestId: manifest.id,
    manifestVersion: manifest.version,
    skillIds: skills.map((s) => s.id),
    availableToolNames: tools.available.map((t) => t.name),
    blockedTools: tools.blocked.map((t) => ({ name: t.name, ...(t.unavailableReason ? { reason: t.unavailableReason } : {}) })),
    promptPartIds,
    ...(manifest.model ? { model: manifest.model } : {}),
  }
}

export function normalizeDebugResources(value: unknown): AgentDebugContextPanel['recentResources'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const id = typeof item.id === 'number' ? item.id : typeof item.ID === 'number' ? item.ID : undefined
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
    if (typeof r.id !== 'number' || !r.name || !r.type) continue
    byId.set(r.id, { id: r.id, name: r.name, type: r.type, ...(r.mimeType ? { mimeType: r.mimeType } : {}), ...(typeof r.size === 'number' ? { size: r.size } : {}) })
  }
  return Array.from(byId.values())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
