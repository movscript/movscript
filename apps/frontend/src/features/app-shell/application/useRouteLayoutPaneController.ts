import React from 'react'

import type {
  RouteLayoutPaneSpec,
  RouteLayoutPaneState,
  RouteLayoutSpec,
} from '@/routes/routeLayoutRegistry'

export interface RouteLayoutPaneController {
  pane?: RouteLayoutPaneSpec
  state: RouteLayoutPaneState
  hidden: boolean
  collapsed: boolean
  expanded: boolean
  size: number
  setSize: (size: number) => void
  show: () => void
  hide: () => void
  collapse: () => void
  expand: () => void
}

interface UseRouteLayoutPaneControllerOptions {
  routeLayout: Pick<RouteLayoutSpec, 'panes'>
  paneId: string
  fallbackState?: RouteLayoutPaneState
  fallbackSize?: number
  clampSize?: (size: number) => number
  controlledState?: RouteLayoutPaneState
  onStateChange?: (state: RouteLayoutPaneState) => void
}

const PANE_STATE_STORAGE_SUFFIX = '.state'

export function routeLayoutPaneById(
  routeLayout: Pick<RouteLayoutSpec, 'panes'>,
  paneId: string,
): RouteLayoutPaneSpec | undefined {
  return routeLayout.panes.find((pane) => pane.id === paneId)
}

export function routeLayoutPaneStateStorageKey(pane: RouteLayoutPaneSpec | undefined): string | undefined {
  if (!pane?.persistState) return undefined
  if (pane.stateStorageKey) return pane.stateStorageKey
  if (!pane.storageKey) return undefined
  return `${pane.storageKey}${PANE_STATE_STORAGE_SUFFIX}`
}

export function routeLayoutPaneDefaultState(
  pane: RouteLayoutPaneSpec | undefined,
  fallbackState: RouteLayoutPaneState = 'default',
): RouteLayoutPaneState {
  return allowedRouteLayoutPaneState(pane, pane?.defaultState ?? fallbackState, fallbackState)
}

export function allowedRouteLayoutPaneState(
  pane: RouteLayoutPaneSpec | undefined,
  state: RouteLayoutPaneState,
  fallbackState: RouteLayoutPaneState = 'default',
): RouteLayoutPaneState {
  const allowedStates = pane?.allowedStates
  if (!allowedStates?.length || allowedStates.includes(state)) return state
  if (allowedStates.includes(fallbackState)) return fallbackState
  return allowedStates[0] ?? fallbackState
}

export function useRouteLayoutPaneController({
  routeLayout,
  paneId,
  fallbackState = 'default',
  fallbackSize = 0,
  clampSize = (size) => size,
  controlledState,
  onStateChange,
}: UseRouteLayoutPaneControllerOptions): RouteLayoutPaneController {
  const pane = React.useMemo(() => routeLayoutPaneById(routeLayout, paneId), [paneId, routeLayout])
  const stateStorageKey = routeLayoutPaneStateStorageKey(pane)
  const sizeStorageKey = pane?.storageKey
  const [uncontrolledState, setUncontrolledState] = React.useState<RouteLayoutPaneState>(() => {
    const savedState = readStoredPaneState(stateStorageKey)
    return allowedRouteLayoutPaneState(pane, savedState ?? routeLayoutPaneDefaultState(pane, fallbackState), fallbackState)
  })
  const state = allowedRouteLayoutPaneState(pane, controlledState ?? uncontrolledState, fallbackState)
  const [size, setSizeValue] = React.useState(() => {
    const defaultSize = pane?.defaultSize ?? fallbackSize
    return clampSize(readStoredPaneSize(sizeStorageKey) ?? defaultSize)
  })

  React.useEffect(() => {
    if (controlledState !== undefined) return
    setUncontrolledState((current) => allowedRouteLayoutPaneState(pane, current, routeLayoutPaneDefaultState(pane, fallbackState)))
  }, [controlledState, fallbackState, pane])

  React.useEffect(() => {
    if (!stateStorageKey) return
    window.localStorage.setItem(stateStorageKey, state)
  }, [state, stateStorageKey])

  React.useEffect(() => {
    if (!sizeStorageKey || state === 'hidden') return
    window.localStorage.setItem(sizeStorageKey, String(size))
  }, [size, sizeStorageKey, state])

  const setSize = React.useCallback((nextSize: number) => {
    setSizeValue(clampSize(nextSize))
  }, [clampSize])
  const setAllowedState = React.useCallback((nextState: RouteLayoutPaneState) => {
    const allowedState = allowedRouteLayoutPaneState(pane, nextState, routeLayoutPaneDefaultState(pane, fallbackState))
    if (controlledState === undefined) setUncontrolledState(allowedState)
    onStateChange?.(allowedState)
  }, [controlledState, fallbackState, onStateChange, pane])

  return {
    pane,
    state,
    hidden: state === 'hidden',
    collapsed: state === 'collapsed',
    expanded: state === 'expanded',
    size,
    setSize,
    show: () => setAllowedState('default'),
    hide: () => setAllowedState('hidden'),
    collapse: () => setAllowedState('collapsed'),
    expand: () => setAllowedState('expanded'),
  }
}

function readStoredPaneState(storageKey: string | undefined): RouteLayoutPaneState | undefined {
  if (!storageKey || typeof window === 'undefined') return undefined
  const value = window.localStorage.getItem(storageKey)
  if (isRouteLayoutPaneState(value)) return value
  if (value === '1') return 'default'
  if (value === '0') return 'hidden'
  if (value === 'true') return 'collapsed'
  if (value === 'false') return 'default'
  return undefined
}

function readStoredPaneSize(storageKey: string | undefined): number | undefined {
  if (!storageKey || typeof window === 'undefined') return undefined
  const storedValue = window.localStorage.getItem(storageKey)
  if (storedValue === null) return undefined
  const value = Number(storedValue)
  return Number.isFinite(value) ? value : undefined
}

function isRouteLayoutPaneState(value: unknown): value is RouteLayoutPaneState {
  return value === 'default' || value === 'collapsed' || value === 'expanded' || value === 'hidden'
}
