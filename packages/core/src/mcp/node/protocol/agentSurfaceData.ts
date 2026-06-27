import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  normalizeDomainFocus,
  type MovScriptNormalizedFocus,
} from '@movscript/domain'
import {
  domainDecideContentUnitCandidate,
  domainBuildContentUnitBackendPrompt,
  domainProductionStatusSummary,
  domainReadContentUnitDependencyReport,
  domainReadContentUnitGenerationPrompt,
  domainReadContentUnitRuntimePanel,
  domainReadProductionTimeline,
  domainReadContentUnitSelectionValidity,
  domainReadPreviewTimeline,
  domainRegenerationPlan,
  domainUpdateContentUnitPrompt,
  readContentUnitCandidateVisibility,
} from '../tools/domain/actions.js'
import { readBody, writeJSON } from './transport.js'

type Args = Record<string, unknown>
type SurfaceSnapshotTarget = Args & { domain_focus: MovScriptNormalizedFocus }
type SurfaceSnapshot = {
  schema: 'movscript.agent_surface_snapshot.v1'
  status: 'ok' | 'error'
  surface: string
  generated_at: string
  target: SurfaceSnapshotTarget
  data?: Record<string, unknown>
  error?: string
}

export function isAgentSurfaceDataRequest(targetPath: string): boolean {
  return targetPath === '/agent/surfaces'
    || targetPath.startsWith('/agent/surfaces/')
}

export async function handleAgentSurfaceDataRequest(req: IncomingMessage, res: ServerResponse, targetPath: string): Promise<void> {
  const method = req.method?.toUpperCase()
  if (method !== 'GET' && method !== 'POST') {
    writeJSON(res, 405, { error: 'agent surface data requests only support GET or POST' })
    return
  }

  const url = new URL(req.url ?? targetPath, 'http://127.0.0.1')
  const segments = targetPath.replace(/^\/agent\/surfaces\/?/, '').replace(/\/$/, '').split('/').filter(Boolean)
  const surface = segments[0] || String(url.searchParams.get('surface') ?? '')
  const args = argsFromSearchParams(url.searchParams)

  try {
    if (method === 'POST') {
      writeJSON(res, 200, await handleAgentSurfaceAction(req, surface, segments.slice(1), args))
      return
    }
    writeJSON(res, 200, await buildAgentSurfaceSnapshot(surface, args))
  } catch (error) {
    writeJSON(res, 500, errorSnapshot(surface, args, error))
  }
}

async function handleAgentSurfaceAction(req: IncomingMessage, surface: string, actionPath: string[], args: Args): Promise<Record<string, unknown>> {
  const body = await readJSONBody(req)
  const action = actionPath.join('/')
  if (surface === 'content-candidates' && action === 'decision') {
    const nextArgs = { ...args, ...body }
    const result = await domainDecideContentUnitCandidate(nextArgs)
    return {
      schema: 'movscript.agent_surface_action.v1',
      status: 'ok',
      surface,
      action: 'domain_decide_content_unit_candidate',
      generated_at: new Date().toISOString(),
      target: nextArgs,
      result,
    }
  }
  if (surface === 'content-prompt' && action === 'save') {
    const nextArgs = { ...args, ...body }
    const result = await domainUpdateContentUnitPrompt(nextArgs)
    return {
      schema: 'movscript.agent_surface_action.v1',
      status: 'ok',
      surface,
      action: 'domain_update_content_unit_prompt',
      generated_at: new Date().toISOString(),
      target: nextArgs,
      result,
    }
  }
  if (surface === 'impact' && action === 'accept-stale') {
    const nextArgs = {
      ...args,
      ...body,
      decision: 'adopt',
      stalePolicy: 'accept_stale',
    }
    const result = await domainDecideContentUnitCandidate(nextArgs)
    return {
      schema: 'movscript.agent_surface_action.v1',
      status: 'ok',
      surface,
      action: 'domain_decide_content_unit_candidate_accept_stale',
      generated_at: new Date().toISOString(),
      target: nextArgs,
      result,
    }
  }
  throw new Error(`Unknown agent surface action: ${surface}/${action || '(empty)'}`)
}

async function readJSONBody(req: IncomingMessage): Promise<Args> {
  const body = await readBody(req)
  if (!body.trim()) return {}
  const parsed = JSON.parse(body)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('agent surface action body must be a JSON object')
  }
  return parsed as Args
}

async function buildAgentSurfaceSnapshot(surface: string, args: Args): Promise<SurfaceSnapshot> {
  const generatedAt = new Date().toISOString()
  switch (surface) {
    case 'content-prompt':
      return okSnapshot(surface, args, generatedAt, {
        prompt: await domainReadContentUnitGenerationPrompt(args),
        backend_prompt: await optionalData(() => domainBuildContentUnitBackendPrompt(args)),
        runtime_panel: await optionalData(() => domainReadContentUnitRuntimePanel(args)),
        dependency_report: await optionalData(() => domainReadContentUnitDependencyReport(args)),
        selection_validity: await optionalData(() => domainReadContentUnitSelectionValidity(args)),
      })
    case 'content-candidates':
      return okSnapshot(surface, args, generatedAt, {
        candidate_visibility: await readContentUnitCandidateVisibility(args, requiredArg(args, 'contentUnitId', 'content_unit_id')),
        runtime_panel: await optionalData(() => domainReadContentUnitRuntimePanel(args)),
        selection_validity: await optionalData(() => domainReadContentUnitSelectionValidity(args)),
      })
    case 'preview-timeline':
      return okSnapshot(surface, args, generatedAt, {
        preview_timeline: await domainReadPreviewTimeline(args),
        production_timeline: await optionalData(() => domainReadProductionTimeline(args)),
      })
    case 'impact':
      return okSnapshot(surface, args, generatedAt, {
        regeneration_plan: await domainRegenerationPlan(args),
      })
    case 'project-status':
      return okSnapshot(surface, args, generatedAt, {
        status_summary: await domainProductionStatusSummary(args),
      })
    default:
      throw new Error(`Unknown agent surface: ${surface || '(empty)'}`)
  }
}

async function optionalData(action: () => Promise<unknown>): Promise<unknown> {
  try {
    return await action()
  } catch (error) {
    return { status: 'error', error: errorMessage(error) }
  }
}

function okSnapshot(surface: string, args: Args, generatedAt: string, data: Record<string, unknown>): SurfaceSnapshot {
  return {
    schema: 'movscript.agent_surface_snapshot.v1',
    status: 'ok',
    surface,
    generated_at: generatedAt,
    target: agentSurfaceSnapshotTarget(args),
    data,
  }
}

function errorSnapshot(surface: string, args: Args, error: unknown): SurfaceSnapshot {
  return {
    schema: 'movscript.agent_surface_snapshot.v1',
    status: 'error',
    surface,
    generated_at: new Date().toISOString(),
    target: agentSurfaceSnapshotTarget(args),
    error: errorMessage(error),
  }
}

export function agentSurfaceSnapshotTarget(args: Args): SurfaceSnapshotTarget {
  return {
    ...args,
    domain_focus: normalizeDomainFocus(args),
  }
}

function argsFromSearchParams(params: URLSearchParams): Args {
  const args: Args = {}
  for (const [key, value] of params.entries()) {
    if (key === 'mcpApiBaseURL') continue
    args[key] = value
    const snake = camelToSnake(key)
    if (snake !== key && args[snake] === undefined) args[snake] = value
  }
  return args
}

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)
}

function requiredArg(args: Args, ...keys: string[]): string | number {
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  throw new Error(`Missing required argument: ${keys[0]}`)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
