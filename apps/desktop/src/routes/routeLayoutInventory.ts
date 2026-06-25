import {
  registeredRouteLayoutSpecs,
  type RouteLayoutPaneSpec,
  type RouteLayoutSpec,
  type RouteScrollMode,
  type RouteShellLayout,
} from './routeLayoutRegistry'

export type LayoutInventoryPaneOwner = RouteLayoutPaneSpec['owner']
export type LayoutInventoryCoordinateAdapter = 'none' | 'required' | 'existing'
export type LayoutInventoryPreferenceMigration = 'reset' | 'required'
export type LayoutInventoryTestAction = 'keep' | 'rewrite' | 'delete'

export interface LayoutInventoryPaneItem {
  id: string
  currentOwner: string
  targetOwner: LayoutInventoryPaneOwner
  storageKey: string
  preferenceMigration: LayoutInventoryPreferenceMigration
}

export interface LayoutInventoryDragSurface {
  id: string
  payloadKinds: string[]
  coordinateAdapter: LayoutInventoryCoordinateAdapter
}

export interface LayoutInventoryTestItem {
  path: string
  action: LayoutInventoryTestAction
}

export interface LayoutInventoryItem {
  routeId: string
  pathnamePattern: string
  currentOwner: string
  targetScrollMode: RouteScrollMode
  targetShellLayout: RouteShellLayout
  panes: LayoutInventoryPaneItem[]
  dragSurfaces: LayoutInventoryDragSurface[]
  escapeHatches: string[]
  tests: LayoutInventoryTestItem[]
}

const toolResourceDragSurface: LayoutInventoryDragSurface = {
  id: 'tools.resource-pane',
  payloadKinds: ['resource', 'file'],
  coordinateAdapter: 'none',
}

const dragSurfacesByRouteId: Record<string, LayoutInventoryDragSurface[]> = {
  'canvas.editor': [
    {
      id: 'canvas.viewport',
      payloadKinds: ['canvas-node-template', 'canvas-workflow', 'resource', 'file'],
      coordinateAdapter: 'existing',
    },
  ],
  resources: [
    {
      id: 'resources.collection',
      payloadKinds: ['resource'],
      coordinateAdapter: 'none',
    },
  ],
  'tools.refImageGen': [toolResourceDragSurface],
  'tools.refVideoGen': [toolResourceDragSurface],
  'tools.motionImitation': [toolResourceDragSurface],
  'tools.styleTransfer': [toolResourceDragSurface],
  'tools.multiAngle': [toolResourceDragSurface],
}

export const routeLayoutInventory: readonly LayoutInventoryItem[] = registeredRouteLayoutSpecs.map((spec) => ({
  routeId: spec.routeId,
  pathnamePattern: spec.pathnamePattern,
  currentOwner: currentRouteLayoutOwner(spec),
  targetScrollMode: spec.scrollMode,
  targetShellLayout: spec.shellLayout,
  panes: spec.panes.map(layoutInventoryPaneFromSpec),
  dragSurfaces: dragSurfacesByRouteId[spec.routeId] ?? [],
  escapeHatches: [],
  tests: layoutInventoryTestsForSpec(spec),
}))

export function routeLayoutInventoryItemForRouteId(routeId: string): LayoutInventoryItem | undefined {
  return routeLayoutInventory.find((item) => item.routeId === routeId)
}

function layoutInventoryPaneFromSpec(pane: RouteLayoutPaneSpec): LayoutInventoryPaneItem {
  return {
    id: pane.id,
    currentOwner: pane.owner,
    targetOwner: pane.owner,
    storageKey: pane.storageKey ?? pane.stateStorageKey ?? '',
    preferenceMigration: 'reset',
  }
}

function currentRouteLayoutOwner(spec: RouteLayoutSpec): string {
  if (spec.kind === 'redirect') return 'redirect route'
  if (spec.kind === 'overlay-action') return 'overlay route action'
  if (spec.surface === 'canvas') return 'canvas shell'
  if (spec.surface === 'agent') return 'agent shell'
  if (spec.projectEntryId) return `${spec.projectEntryId} project entry`
  return 'app route shell'
}

function layoutInventoryTestsForSpec(spec: RouteLayoutSpec): LayoutInventoryTestItem[] {
const tests: LayoutInventoryTestItem[] = [
    { path: 'src/routes/routeLayoutRegistry.test.ts', action: 'keep' },
  ]
  if (spec.routeId === 'canvas.editor') {
    tests.push({ path: 'src/features/canvas/application/canvasWorkflowLayoutContract.test.ts', action: 'keep' })
  }
  if (spec.routeId.startsWith('agent.')) {
    tests.push({ path: 'src/features/agent/application/agentGenerationUiContract.test.tsx', action: 'keep' })
  }
  return tests
}
