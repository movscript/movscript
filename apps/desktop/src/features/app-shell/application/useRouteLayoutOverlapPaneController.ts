import {
  usePersistentOverlapPaneController,
  type OverlapPaneGroupGeometryProps,
  type OverlapPaneCollapseMode,
  type OverlapPaneExpandMode,
  type OverlapPaneResizeEdge,
  type PersistentOverlapPaneControllerOptions
} from '@movscript/ui/layout'

import type {
  RouteLayoutPaneCollapseMode,
  RouteLayoutPaneExpandMode,
  RouteLayoutPaneSpec,
  RouteLayoutSpec,
} from '@/routes/routeLayoutRegistry'

import { routeLayoutPaneById } from './useRouteLayoutPaneController'

interface UseRouteLayoutOverlapPaneControllerOptions {
  routeLayout: Pick<RouteLayoutSpec, 'panes'>
  paneId: string
  resizeEdge: OverlapPaneResizeEdge
  ariaLabel: string
}

export function useRouteLayoutOverlapPaneController({
  routeLayout,
  paneId,
  resizeEdge,
  ariaLabel,
}: UseRouteLayoutOverlapPaneControllerOptions) {
  const pane = routeLayoutPaneById(routeLayout, paneId)
  return usePersistentOverlapPaneController(routeLayoutOverlapPaneControllerOptionsForPane(pane, {
    resizeEdge,
    ariaLabel,
  }))
}

export function routeLayoutOverlapPaneControllerOptionsForPane(
  pane: RouteLayoutPaneSpec | undefined,
  options: Pick<PersistentOverlapPaneControllerOptions, 'resizeEdge' | 'ariaLabel'>,
): PersistentOverlapPaneControllerOptions {
  if (!pane) throw new Error('Route layout overlap pane spec is missing.')
  if (pane.owner !== 'workbench') throw new Error(`Route layout pane "${pane.id}" is not owned by a workbench.`)
  if (pane.overlapMode !== 'pane-surface') throw new Error(`Route layout pane "${pane.id}" is not a pane-surface overlap pane.`)
  if (pane.defaultSize === undefined) throw new Error(`Route layout pane "${pane.id}" is missing defaultSize.`)
  if (pane.minSize === undefined) throw new Error(`Route layout pane "${pane.id}" is missing minSize.`)
  if (pane.maxSize === undefined) throw new Error(`Route layout pane "${pane.id}" is missing maxSize.`)

  return {
    storageKey: pane.storageKey,
    defaultSize: pane.defaultSize,
    minSize: pane.minSize,
    maxSize: pane.maxSize,
    resizeEdge: options.resizeEdge,
    collapseMode: overlapPaneCollapseModeFromRoutePane(pane.collapseMode),
    expandMode: overlapPaneExpandModeFromRoutePane(pane.expandMode),
    ariaLabel: options.ariaLabel,
  }
}

export function routeLayoutOverlapPaneGroupPropsForVisibility(
  groupProps: OverlapPaneGroupGeometryProps,
  visible: boolean,
): OverlapPaneGroupGeometryProps {
  if (visible) return groupProps
  return {
    ...groupProps,
    'data-overlap-pane-collapsed': 'true',
    'data-overlap-pane-expanded': undefined,
  }
}

function overlapPaneCollapseModeFromRoutePane(mode: RouteLayoutPaneCollapseMode | undefined): OverlapPaneCollapseMode {
  if (mode === 'after-min') return 'after-min'
  return 'none'
}

function overlapPaneExpandModeFromRoutePane(mode: RouteLayoutPaneExpandMode | undefined): OverlapPaneExpandMode {
  if (mode === 'after-max') return 'after-max'
  return 'none'
}
