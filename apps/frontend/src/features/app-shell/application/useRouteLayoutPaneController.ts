import React from 'react'

import { readBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
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
  const defaultSize = pane?.defaultSize ?? fallbackSize
  const [uncontrolledState, setUncontrolledState] = React.useState<{
    storageKey: string | undefined
    value: RouteLayoutPaneState
  }>(() => {
    return {
      storageKey: stateStorageKey,
      value: readRouteLayoutPaneState(pane, stateStorageKey, fallbackState),
    }
  })
  const uncontrolledStateValue = uncontrolledState.storageKey === stateStorageKey
    ? uncontrolledState.value
    : readRouteLayoutPaneState(pane, stateStorageKey, fallbackState)
  const state = allowedRouteLayoutPaneState(pane, controlledState ?? uncontrolledStateValue, fallbackState)
  const [sizeState, setSizeValue] = React.useState<{
    storageKey: string | undefined
    defaultSize: number
    value: number
  }>(() => {
    return {
      storageKey: sizeStorageKey,
      defaultSize,
      value: readRouteLayoutPaneSize(sizeStorageKey, defaultSize, clampSize),
    }
  })
  const size = sizeState.storageKey === sizeStorageKey && sizeState.defaultSize === defaultSize
    ? sizeState.value
    : readRouteLayoutPaneSize(sizeStorageKey, defaultSize, clampSize)

  React.useEffect(() => {
    if (controlledState !== undefined) return
    setUncontrolledState((current) => {
      if (current.storageKey !== stateStorageKey) {
        return {
          storageKey: stateStorageKey,
          value: readRouteLayoutPaneState(pane, stateStorageKey, fallbackState),
        }
      }
      return {
        storageKey: stateStorageKey,
        value: allowedRouteLayoutPaneState(pane, current.value, routeLayoutPaneDefaultState(pane, fallbackState)),
      }
    })
  }, [controlledState, fallbackState, pane, stateStorageKey])

  React.useEffect(() => {
    setSizeValue((current) => {
      if (current.storageKey === sizeStorageKey && current.defaultSize === defaultSize) return current
      return {
        storageKey: sizeStorageKey,
        defaultSize,
        value: readRouteLayoutPaneSize(sizeStorageKey, defaultSize, clampSize),
      }
    })
  }, [clampSize, defaultSize, sizeStorageKey])

  React.useEffect(() => {
    if (!stateStorageKey) return
    writeStoredPaneState(stateStorageKey, state)
  }, [state, stateStorageKey])

  React.useEffect(() => {
    if (!sizeStorageKey || state === 'hidden') return
    writeStoredPaneSize(sizeStorageKey, size)
  }, [size, sizeStorageKey, state])

  const setSize = React.useCallback((nextSize: number) => {
    const nextValue = clampSize(nextSize)
    setSizeValue({
      storageKey: sizeStorageKey,
      defaultSize,
      value: nextValue,
    })
    if (state !== 'hidden') writeStoredPaneSize(sizeStorageKey, nextValue)
  }, [clampSize, defaultSize, sizeStorageKey, state])
  const setAllowedState = React.useCallback((nextState: RouteLayoutPaneState) => {
    const allowedState = allowedRouteLayoutPaneState(pane, nextState, routeLayoutPaneDefaultState(pane, fallbackState))
    if (controlledState === undefined) {
      setUncontrolledState({
        storageKey: stateStorageKey,
        value: allowedState,
      })
    }
    writeStoredPaneState(stateStorageKey, allowedState)
    onStateChange?.(allowedState)
  }, [controlledState, fallbackState, onStateChange, pane, stateStorageKey])

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

export function readRouteLayoutPaneState(
  pane: RouteLayoutPaneSpec | undefined,
  storageKey: string | undefined,
  fallbackState: RouteLayoutPaneState = 'default',
): RouteLayoutPaneState {
  const savedState = readStoredPaneState(storageKey)
  return allowedRouteLayoutPaneState(pane, savedState ?? routeLayoutPaneDefaultState(pane, fallbackState), fallbackState)
}

export function readRouteLayoutPaneSize(
  storageKey: string | undefined,
  defaultSize: number,
  clampSize: (size: number) => number = (size) => size,
): number {
  return clampSize(readStoredPaneSize(storageKey) ?? defaultSize)
}

function readStoredPaneState(storageKey: string | undefined): RouteLayoutPaneState | undefined {
  if (!storageKey) return undefined
  const value = readBrowserStorageItem('local', storageKey)
  if (isRouteLayoutPaneState(value)) return value
  if (value === '1') return 'default'
  if (value === '0') return 'hidden'
  if (value === 'true') return 'collapsed'
  if (value === 'false') return 'default'
  return undefined
}

function readStoredPaneSize(storageKey: string | undefined): number | undefined {
  if (!storageKey) return undefined
  const storedValue = readBrowserStorageItem('local', storageKey)
  if (storedValue === null) return undefined
  const value = Number(storedValue)
  return Number.isFinite(value) ? value : undefined
}

function writeStoredPaneState(storageKey: string | undefined, state: RouteLayoutPaneState): void {
  if (!storageKey) return
  writeBrowserStorageItem('local', storageKey, state)
}

function writeStoredPaneSize(storageKey: string | undefined, size: number): void {
  if (!storageKey) return
  writeBrowserStorageItem('local', storageKey, String(size))
}

function isRouteLayoutPaneState(value: unknown): value is RouteLayoutPaneState {
  return value === 'default' || value === 'collapsed' || value === 'expanded' || value === 'hidden'
}
