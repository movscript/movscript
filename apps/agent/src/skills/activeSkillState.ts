import { isRecord } from '../jsonValue.js'
import type { AgentRun, JSONValue } from '../state/types.js'

export interface ActiveSkillState {
  loadedSkillIds: string[]
  unloadedSkillIds: string[]
  reason?: string
  updatedAt?: string
}

export function activeSkillStateFromRun(run: Pick<AgentRun, 'metadata'>): ActiveSkillState {
  const value = run.metadata?.skillState
  if (!isRecord(value)) return { loadedSkillIds: [], unloadedSkillIds: [] }
  return {
    loadedSkillIds: stringList(value.loadedSkillIds),
    unloadedSkillIds: stringList(value.unloadedSkillIds),
    ...(typeof value.reason === 'string' && value.reason.trim() ? { reason: value.reason.trim() } : {}),
    ...(typeof value.updatedAt === 'string' && value.updatedAt.trim() ? { updatedAt: value.updatedAt.trim() } : {}),
  }
}

export function writeActiveSkillStateToRun(run: AgentRun, state: ActiveSkillState): void {
  run.metadata = {
    ...(run.metadata ?? {}),
    skillState: {
      loadedSkillIds: state.loadedSkillIds,
      unloadedSkillIds: state.unloadedSkillIds,
      ...(state.reason ? { reason: state.reason } : {}),
      ...(state.updatedAt ? { updatedAt: state.updatedAt } : {}),
    } as unknown as JSONValue,
  }
}

export function applyActiveSkillStateUpdate(input: {
  current: ActiveSkillState
  load?: string[]
  unload?: string[]
  reason?: string
  now?: string
}): ActiveSkillState {
  const loaded = new Set(input.current.loadedSkillIds)
  const unloaded = new Set(input.current.unloadedSkillIds)
  for (const id of input.load ?? []) {
    loaded.add(id)
    unloaded.delete(id)
  }
  for (const id of input.unload ?? []) {
    unloaded.add(id)
    loaded.delete(id)
  }
  return {
    loadedSkillIds: Array.from(loaded).sort(),
    unloadedSkillIds: Array.from(unloaded).sort(),
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : input.current.reason ? { reason: input.current.reason } : {}),
    ...(input.now ? { updatedAt: input.now } : input.current.updatedAt ? { updatedAt: input.current.updatedAt } : {}),
  }
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))).sort()
}
