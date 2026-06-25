import {
  currentSurfaceWorkspaceOwnerContext,
  currentSurfaceWorkspaceProjectDir,
} from '@movscript/shared'
import { readSurfaceHostApi } from './surfaceHostApiAccess'

type ProjectContext = {
  projectId?: string | number
  projectDir?: string
  userId?: string | number
  orgId?: string | number
}

type WorkspaceQuery = Record<string, unknown> | undefined

function projectInput(context: ProjectContext, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const projectDir = context.projectDir?.trim() || currentSurfaceWorkspaceProjectDir()
  const ownerContext = context.userId !== undefined || context.orgId !== undefined
    ? {}
    : currentSurfaceWorkspaceOwnerContext()
  return {
    ...ownerContext,
    ...context,
    ...(projectDir ? { projectDir } : {}),
    projectId: Number(context.projectId) || context.projectId,
    ...extra,
  }
}

function mutationInput(context: ProjectContext, payload: unknown): Record<string, unknown> {
  return projectInput(context, {
    expectedWorkspaceVersions: {},
    payload,
  })
}

function requireApiMethod(name: string): (...args: unknown[]) => Promise<any> {
  const api = readSurfaceHostApi() as Record<string, unknown> | undefined
  const method = api?.[name]
  if (typeof method !== 'function') throw new Error(`MovScript workspace API is unavailable: ${name}`)
  return method as (...args: unknown[]) => Promise<any>
}

export function createElectronMovScriptWorkspaceService(context: ProjectContext = {}) {
  return {
    queryEntities(query?: WorkspaceQuery) {
      return requireApiMethod('queryMovScriptEngineWorkspaceEntities')(projectInput(context, { query }))
    },
    querySettings(query?: WorkspaceQuery) {
      return requireApiMethod('queryMovScriptEngineWorkspaceSettings')(projectInput(context, { query }))
    },
    queryAssets(query?: WorkspaceQuery) {
      return requireApiMethod('queryMovScriptEngineWorkspaceAssets')(projectInput(context, { query }))
    },
    readScriptSource(input: Record<string, unknown>) {
      return requireApiMethod('readMovScriptEngineWorkspaceScriptSource')(
        projectInput(context, { payload: input }),
      )
    },
    upsertScript(input: Record<string, unknown>) {
      return requireApiMethod('upsertMovScriptEngineWorkspaceScript')(
        mutationInput(context, input),
      )
    },
    upsertProjectStandards(input: Record<string, unknown>) {
      return requireApiMethod('upsertMovScriptEngineWorkspaceProjectStandards')(
        mutationInput(context, input),
      )
    },
    readContentUnitGenerationPrompt(contentUnitId: string | number) {
      return requireApiMethod('readMovScriptEngineContentUnitGenerationPrompt')(
        projectInput(context, { contentUnitId }),
      )
    },
    updateContentUnitEditPrompt(input: Record<string, unknown>) {
      return requireApiMethod('updateMovScriptEngineContentUnitEditPrompt')(
        projectInput(context, {
          expectedWorkspaceVersions: {},
          ...input,
        }),
      )
    },
    createAssetSlotCandidate(input: Record<string, unknown>) {
      return requireApiMethod('createMovScriptEngineWorkspaceAssetSlotCandidate')(
        projectInput(context, { payload: input }),
      )
    },
    createKeyframeCandidate(input: Record<string, unknown>) {
      return requireApiMethod('createMovScriptEngineWorkspaceKeyframeCandidate')(
        projectInput(context, { payload: input }),
      )
    },
  }
}
