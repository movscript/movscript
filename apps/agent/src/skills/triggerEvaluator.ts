import type { ContextSelector, RuntimeContext, SkillTrigger, WorkflowSkill } from '../catalog/types.js'

export interface TriggerEvaluation {
  matched: boolean
  matchedTriggerKind?: SkillTrigger['kind']
  matchedTrigger?: SkillTrigger
  warning?: string
}

export interface WorkflowTriggerTrace {
  id: string
  matched: boolean
  matchedTriggerKind?: SkillTrigger['kind']
  trigger?: SkillTrigger
  priority: number
  selected: boolean
  reason: string
}

export function evaluateWorkflowTriggers(skill: WorkflowSkill, ctx: RuntimeContext): TriggerEvaluation {
  if (skill.triggers.length === 0) return { matched: false }
  for (const trigger of skill.triggers) {
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

export function selectActiveWorkflows(workflows: WorkflowSkill[], ctx: RuntimeContext): { workflows: WorkflowSkill[]; warnings: string[] } {
  return selectActiveWorkflowsWithTrace(workflows, ctx)
}

export function selectActiveWorkflowsWithTrace(workflows: WorkflowSkill[], ctx: RuntimeContext): { workflows: WorkflowSkill[]; warnings: string[]; trace: WorkflowTriggerTrace[] } {
  const warnings: string[] = []
  const evaluations = workflows.map((workflow) => {
    const result = evaluateWorkflowTriggers(workflow, ctx)
    if (result.warning) warnings.push(result.warning)
    return { workflow, result }
  })
  const matched = evaluations.filter((item) => item.result.matched).map((item) => item.workflow)
  const max = Math.min(Math.max(ctx.profile.limits?.maxActiveWorkflows ?? 2, 0), 4)
  const sorted = matched.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
  if (sorted.length > max) warnings.push(`trigger.workflow.limit: kept ${max} of ${sorted.length} matched workflows`)
  const selected = sorted.slice(0, max)
  const selectedIds = new Set(selected.map((workflow) => workflow.id))
  const matchedIds = new Set(matched.map((workflow) => workflow.id))
  const trace = evaluations
    .map(({ workflow, result }): WorkflowTriggerTrace => ({
      id: workflow.id,
      matched: result.matched,
      ...(result.matchedTriggerKind ? { matchedTriggerKind: result.matchedTriggerKind } : {}),
      ...(result.matchedTrigger ? { trigger: result.matchedTrigger } : {}),
      priority: workflow.priority,
      selected: selectedIds.has(workflow.id),
      reason: selectedIds.has(workflow.id)
        ? `selected:${result.matchedTriggerKind ?? 'unknown'}`
        : matchedIds.has(workflow.id)
          ? 'matched_but_over_limit'
          : 'not_matched',
    }))
    .sort((a, b) => Number(b.selected) - Number(a.selected) || Number(b.matched) - Number(a.matched) || b.priority - a.priority || a.id.localeCompare(b.id))
  return { workflows: selected, warnings, trace }
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
  if (selector.mode && !selector.mode.includes(ui.mode ?? ctx.profile.modeAlias ?? '')) return false
  if (selector.route && !selector.route.some((route) => routeMatches(route, ui.route ?? ''))) return false
  if (selector.selectedKind && (!ui.selectedKind || !selector.selectedKind.includes(ui.selectedKind))) return false
  if (selector.selectedScope && (!ui.selectedScope || !selector.selectedScope.includes(ui.selectedScope))) return false
  if (selector.draftStatus && (!ui.draftStatus || !selector.draftStatus.includes(ui.draftStatus))) return false
  if (selector.hasProjectId !== undefined && (ui.projectId !== undefined) !== selector.hasProjectId) return false
  if (selector.hasProductionId !== undefined && (ui.productionId !== undefined) !== selector.hasProductionId) return false
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
