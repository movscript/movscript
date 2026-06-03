import type { ContextSelector, RuntimeContext, SkillDefinition, SkillTrigger } from '../../../catalog/registry/shared/types.js'

export interface TriggerEvaluation {
  matched: boolean
  matchedTriggerKind?: SkillTrigger['kind']
  matchedTrigger?: SkillTrigger
  warning?: string
}

export interface SkillTriggerTrace {
  id: string
  matched: boolean
  matchedTriggerKind?: SkillTrigger['kind']
  trigger?: SkillTrigger
  priority: number
  selected: boolean
  reason: string
}

export function evaluateSkillTriggers(skill: SkillDefinition, ctx: RuntimeContext): TriggerEvaluation {
  if ((skill.triggers?.length ?? 0) === 0) return { matched: false }
  for (const trigger of skill.triggers ?? []) {
    try {
      if (matchesTrigger(trigger, ctx)) return { matched: true, matchedTriggerKind: trigger.kind, matchedTrigger: trigger }
    } catch (error) {
      return {
        matched: false,
        warning: `trigger.eval.error: ${skill.id}: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
  return { matched: false }
}

export function selectActiveTriggeredSkills(skills: SkillDefinition[], ctx: RuntimeContext): { skills: SkillDefinition[]; warnings: string[] } {
  return selectActiveTriggeredSkillsWithTrace(skills, ctx)
}

export function selectActiveTriggeredSkillsWithTrace(skills: SkillDefinition[], ctx: RuntimeContext): { skills: SkillDefinition[]; warnings: string[]; trace: SkillTriggerTrace[] } {
  const warnings: string[] = []
  const evaluations = skills.map((skill) => {
    const result = evaluateSkillTriggers(skill, ctx)
    if (result.warning) warnings.push(result.warning)
    return { skill, result }
  })
  const matched = evaluations.filter((item) => item.result.matched).map((item) => item.skill)
  const max = Math.min(Math.max(ctx.configFile.limits?.maxActiveTriggeredSkills ?? 2, 0), 4)
  const sorted = matched.sort((a, b) => triggeredSkillSelectionPriority(b, ctx) - triggeredSkillSelectionPriority(a, ctx) || a.id.localeCompare(b.id))
  if (sorted.length > max) warnings.push(`trigger.skill.limit: kept ${max} of ${sorted.length} matched skills`)
  const selected = sorted.slice(0, max)
  const selectedIds = new Set(selected.map((skill) => skill.id))
  const matchedIds = new Set(matched.map((skill) => skill.id))
  const trace = evaluations
    .map(({ skill, result }): SkillTriggerTrace => ({
      id: skill.id,
      matched: result.matched,
      ...(result.matchedTriggerKind ? { matchedTriggerKind: result.matchedTriggerKind } : {}),
      ...(result.matchedTrigger ? { trigger: result.matchedTrigger } : {}),
      priority: skill.priority,
      selected: selectedIds.has(skill.id),
      reason: selectedIds.has(skill.id)
        ? `selected:${result.matchedTriggerKind ?? 'unknown'}`
        : matchedIds.has(skill.id)
          ? 'matched_but_over_limit'
          : 'not_matched',
    }))
    .sort((a, b) => Number(b.selected) - Number(a.selected) || Number(b.matched) - Number(a.matched) || b.priority - a.priority || a.id.localeCompare(b.id))
  return { skills: selected, warnings, trace }
}

function triggeredSkillSelectionPriority(skill: SkillDefinition, ctx: RuntimeContext): number {
  if (!hasGenerationExecutionIntent(ctx)) return skill.priority
  if (ctx.intents.includes('asset_candidate_generation') && skill.id === 'candidate.asset_planning') return skill.priority + 10000
  if (skill.id === 'generation.visual_execution') return skill.priority + 9000
  if (skill.id === 'candidate.asset_planning') return skill.priority + 8000
  return skill.priority
}

function hasGenerationExecutionIntent(ctx: RuntimeContext): boolean {
  return ctx.intents.includes('visual_generation') || ctx.intents.includes('asset_candidate_generation')
}

function matchesTrigger(trigger: SkillTrigger, ctx: RuntimeContext): boolean {
  if (trigger.kind === 'always') return true
  if (trigger.kind === 'keyword') {
    const normalized = ctx.message.toLowerCase()
    return trigger.any.some((keyword) => normalized.includes(keyword.toLowerCase()))
  }
  if (trigger.kind === 'regex') return new RegExp(trigger.pattern, trigger.flags ?? '').test(ctx.message)
  if (trigger.kind === 'intent') return ctx.intents.includes(trigger.id)
  return matchSelector(trigger.selector, ctx)
}

export function matchSelector(selector: ContextSelector, ctx: RuntimeContext): boolean {
  const ui = ctx.uiContext
  if (selector.route && !selector.route.some((route) => routeMatches(route, ui.route ?? ''))) return false
  if (selector.selectedKind && (!ui.selectedKind || !selector.selectedKind.includes(ui.selectedKind))) return false
  if (selector.selectedScope && (!ui.selectedScope || !selector.selectedScope.includes(ui.selectedScope))) return false
  if (selector.workspaceStatus && (!ui.workspaceStatus || !selector.workspaceStatus.includes(ui.workspaceStatus))) return false
  if (selector.hasProjectId !== undefined && (ui.projectId !== undefined) !== selector.hasProjectId) return false
  if (selector.custom) {
    for (const [key, expected] of Object.entries(selector.custom)) {
      const actual = ui[key]
      if (Array.isArray(expected)) {
        if (!expected.includes(String(actual))) return false
      } else if (actual !== expected) return false
    }
  }
  return true
}

function routeMatches(pattern: string, route: string): boolean {
  if (pattern === route) return true
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\:[^/]+/g, '[^/]+')
  return new RegExp(`^${escaped}$`).test(route)
}
