import { isJSONRecord } from '../jsonValue.js'
import type { JSONValue } from '../state/types.js'

export function summarizeResult(value: JSONValue | undefined): string {
  if (value === undefined || value === null) return 'null'
  if (typeof value !== 'object') return String(value).slice(0, 180)
  if (Array.isArray(value)) return `${value.length} item(s)`
  const skillSummary = summarizeSkillStateResult(value)
  if (skillSummary) return skillSummary
  const catalogSummary = summarizeCatalogInspectResult(value)
  if (catalogSummary) return catalogSummary
  const keys = Object.keys(value)
  const status = typeof value.status === 'string' ? `${value.status}; ` : ''
  return `${status}${keys.length} key(s): ${keys.slice(0, 6).join(', ')}`
}

function summarizeSkillStateResult(value: Record<string, JSONValue>): string | undefined {
  if (value.eventType !== 'skill.state_requested') return undefined
  const status = typeof value.status === 'string' ? value.status : 'updated'
  const loaded = stringArray(value.loadedSkillIds)
  const unloaded = stringArray(value.unloadedSkillIds)
  const corrected = isJSONRecord(value.correctedSkillActivation)
  const parts = [
    `${status}; skill state`,
    loaded.length > 0 ? `loaded=${loaded.join(', ')}` : undefined,
    unloaded.length > 0 ? `unloaded=${unloaded.join(', ')}` : undefined,
    corrected ? 'corrected=true' : undefined,
  ].filter(Boolean)
  return parts.join('; ')
}

function summarizeCatalogInspectResult(value: Record<string, JSONValue>): string | undefined {
  if (value.status !== 'ok' || typeof value.view !== 'string') return undefined
  if (value.view === 'summary') {
    const activeSkillIds = stringArray(value.activeSkillIds)
    const availableSkillIds = stringArray(value.availableSkillIds)
    const enabledPackIds = stringArray(value.enabledPackIds)
    const counts = isJSONRecord(value.counts) ? value.counts : undefined
    const tools = typeof counts?.tools === 'number' ? `tools=${counts.tools}` : undefined
    const skills = typeof counts?.skills === 'number' ? `skills=${counts.skills}` : undefined
    return [
      'ok; catalog summary',
      activeSkillIds.length > 0 ? `active=${activeSkillIds.join(', ')}` : 'active=none',
      availableSkillIds.length > 0 ? `available=${availableSkillIds.slice(0, 6).join(', ')}` : 'available=none',
      enabledPackIds.length > 0 ? `packs=${enabledPackIds.slice(0, 4).join(', ')}` : undefined,
      [tools, skills].filter(Boolean).join(', ') || undefined,
    ].filter(Boolean).join('; ')
  }
  if (value.view === 'skill' && isJSONRecord(value.skill)) {
    const skill = value.skill
    const id = stringField(skill.id) ?? 'unknown'
    const active = value.active === true ? 'active=true' : 'active=false'
    const covered = value.coveredByEnabledPack === true ? 'coveredByPack=true' : 'coveredByPack=false'
    const toolRefs = stringArray(skill.toolRefs)
    const loadMode = stringField(skill.loadMode)
    return [
      `ok; catalog skill ${id}`,
      active,
      covered,
      loadMode ? `load=${loadMode}` : undefined,
      toolRefs.length > 0 ? `tools=${toolRefs.map(stripToolRef).join(', ')}` : undefined,
    ].filter(Boolean).join('; ')
  }
  if (value.view === 'tool' && isJSONRecord(value.tool)) {
    const tool = value.tool
    const name = stringField(tool.name) ?? 'unknown'
    const grant = isJSONRecord(value.grant) ? stringField(grantMode(value.grant)) : undefined
    return [
      `ok; catalog tool ${name}`,
      value.enabledByPack === true ? 'enabledByPack=true' : 'enabledByPack=false',
      grant ? `grant=${grant}` : 'grant=none',
    ].join('; ')
  }
  return undefined
}

function stringArray(value: JSONValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

function stripToolRef(value: string): string {
  return value.startsWith('tool://') ? value.slice('tool://'.length) : value
}

function grantMode(value: Record<string, JSONValue>): JSONValue | undefined {
  return value.mode
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
