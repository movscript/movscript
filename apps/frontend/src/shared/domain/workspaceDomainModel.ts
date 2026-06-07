import {
  listMovScriptDomainWorkspaceModels,
  type MovScriptDomainWorkspaceKind,
  type MovScriptDomainWorkspaceModel,
} from '@movscript/core/workspace'

export interface WorkspaceDomainModel {
  kind: MovScriptDomainWorkspaceKind
  title: string
  targetEntityType: string
  contentSchemaId: string
  entityTypes: string[]
  schemaIds: string[]
  instructions: string[]
  fieldGuide: {
    owns: string[]
    references: string[]
    forbids: string[]
  }
  applyBoundary: {
    backendApply: string
  }
}

export const WORKSPACE_DOMAIN_MODELS: WorkspaceDomainModel[] = listMovScriptDomainWorkspaceModels()
  .map(workspaceDomainModelFromCore)

export function getWorkspaceDomainModel(kind: MovScriptDomainWorkspaceKind): WorkspaceDomainModel | undefined {
  return WORKSPACE_DOMAIN_MODELS.find((model) => model.kind === kind)
}

function workspaceDomainModelFromCore(model: MovScriptDomainWorkspaceModel): WorkspaceDomainModel {
  return {
    kind: model.kind,
    title: model.title,
    targetEntityType: model.entityKinds[0] ?? model.kind,
    contentSchemaId: model.schemaIds[0] ?? `movscript.${model.kind}.v1`,
    entityTypes: model.entityKinds,
    schemaIds: model.schemaIds,
    instructions: model.instructions,
    fieldGuide: {
      owns: model.entityKinds,
      references: [],
      forbids: [],
    },
    applyBoundary: {
      backendApply: 'workspace_build',
    },
  }
}
