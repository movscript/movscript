export const resourceKeys = {
  all: ['resources'] as const,
  libraryPage: (input: {
    scope: string
    filter: string
    search: string
    page: number
    pageSize: number
  }) => ['resources', input.scope, input.filter, input.search, input.page, input.pageSize] as const,
  agentPanel: ['resources', 'agent-panel'] as const,
  panel: (input: {
    inputType: string
    resourceType: string
    keyword: string
    page: number
  }) => ['resources', 'panel', input.inputType, input.resourceType, input.keyword, input.page] as const,
  assetSlotsPanel: (projectId: number | undefined) => ['asset-slots', 'panel', projectId] as const,
  contentWorkspaceCandidates: (input: {
    search: string
    type: string
    page: number
  }) => ['content-source-workspace-candidate-resources', input.search, input.type, input.page] as const,
  shotLibraryPicker: (input: {
    search: string
    page: number
  }) => ['shot-library-resource-picker', input.search, input.page] as const,
}

export const resourceBindingKeys = {
  all: ['resource-bindings'] as const,
  projectLibraryScope: (projectId: number | undefined) => ['resource-bindings', projectId, 'library-scope'] as const,
}

export const externalResourceKeys = {
  sources: ['external-resource-sources'] as const,
  search: (input: {
    sourceId: number | undefined
    query: string
    mediaTypeKey: string
    orientation: string
    page: number
  }) => ['external-resources', input.sourceId, input.query, input.mediaTypeKey, input.orientation, input.page] as const,
}

export const resourceFolderKeys = {
  mine: ['resource-folders', 'mine'] as const,
}

export const resourceShareTargetKeys = {
  projects: ['projects', 'resource-share-targets'] as const,
}

export const resourceCandidateKeys = {
  targets: (projectId: number | undefined, entityKind?: string) => ['resource-candidate-targets', projectId, entityKind] as const,
  targetsForProject: (projectId: number) => ['resource-candidate-targets', projectId] as const,
  generatedTargets: (projectId: number | undefined, entityKind?: string) => entityKind
    ? ['agent-generated-candidate-targets', projectId, entityKind] as const
    : ['agent-generated-candidate-targets', projectId] as const,
}

export const canvasResourceKeys = {
  nodeResources: ['canvas-node-resources'] as const,
  shelf: ['canvas-resource-shelf', 'resources'] as const,
  textNodeResource: (url: string) => ['canvas-text-node-resource', url] as const,
}

export const resourceTextKeys = {
  thumb: (url: string) => ['resource-text-thumb', url] as const,
  preview: (url: string) => ['resource-text-preview', url] as const,
}

export interface ResourceQueryInvalidator {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => unknown
}
