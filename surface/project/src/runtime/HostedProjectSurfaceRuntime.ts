import type { MovScriptContextEnvelope } from '@movscript/shared'

import {
  createProjectSurfaceRuntime,
  projectSurfaceProjectFromContext,
  type ProjectSurfaceProjectContext,
  type ProjectSurfaceRouteKey,
  type ProjectSurfaceRouteParams,
  type ProjectSurfaceRuntime,
  type ProjectSurfaceRuntimeInput,
} from './ProjectSurfaceRuntime.js'

export type HostedProjectSurfaceHrefResolver = (
  route: ProjectSurfaceRouteKey,
  params: ProjectSurfaceRouteParams | undefined,
  project: ProjectSurfaceProjectContext,
) => string

export type HostedProjectSurfaceHrefOpener = (
  href: string,
  route: ProjectSurfaceRouteKey,
  params: ProjectSurfaceRouteParams | undefined,
  project: ProjectSurfaceProjectContext,
) => void | Promise<void>

export interface HostedProjectSurfaceRuntimeInput extends Omit<ProjectSurfaceRuntimeInput, 'navigator'> {
  href: HostedProjectSurfaceHrefResolver
  openHref: HostedProjectSurfaceHrefOpener
  openExternal?: (url: string) => void | Promise<void>
}

export function createHostedProjectSurfaceRuntime(input: HostedProjectSurfaceRuntimeInput): ProjectSurfaceRuntime {
  const project = projectSurfaceProjectFromContext(input.context, input.project)
  return createProjectSurfaceRuntime({
    context: input.context,
    project,
    diagnostics: input.diagnostics,
    capabilities: input.capabilities,
    notifier: input.notifier,
    gateways: input.gateways,
    navigator: {
      href: (route, params) => input.href(route, params, project),
      open: (route, params) => input.openHref(input.href(route, params, project), route, params, project),
      ...(input.openExternal ? { openExternal: input.openExternal } : {}),
    },
  })
}

export function projectSurfaceContextCommandEnvelope(
  context: MovScriptContextEnvelope | undefined,
): Record<string, unknown> {
  const sessionId = context?.session?.sessionId
  if (!sessionId) return {}
  return {
    context: {
      sessionId,
      revision: context.revision,
    },
  }
}

export function unwrapProjectSurfaceGatewayResult(payload: unknown): unknown {
  if (!isRecord(payload)) return payload
  return Object.prototype.hasOwnProperty.call(payload, 'result') ? payload.result : payload
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
