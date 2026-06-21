import React from 'react'

import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { listenToWindowEvent, publishWindowEvent } from '@/shared/infrastructure/windowEvents'
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
const ROUTE_LAYOUT_PANE_DESKTOP_PREFIX = 'movscript-route-layout-pane-v1'
const ROUTE_LAYOUT_PANE_STORAGE_CHANGED_EVENT = 'movscript:route-layout-pane-storage-changed'

const routeLayoutPaneStorageCache = new Map<string, string | undefined>()
const routeLayoutPaneStorageHydrations = new Set<string>()
const routeLayoutPaneStorageVersions = new Map<string, number>()
let routeLayoutPaneStorageWindow: Window | undefined

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

export function clampRouteLayoutPaneSize(
  pane: RouteLayoutPaneSpec | undefined,
  size: number,
  fallbackSize = 0,
): number {
  const roundedSize = Math.round(Number.isFinite(size) ? size : fallbackSize)
  const minSize = typeof pane?.minSize === 'number' ? pane.minSize : undefined
  const maxSize = typeof pane?.maxSize === 'number' ? pane.maxSize : undefined
  const minClampedSize = minSize === undefined ? roundedSize : Math.max(roundedSize, minSize)
  return maxSize === undefined ? minClampedSize : Math.min(minClampedSize, maxSize)
}

function sameRouteLayoutPaneSizeState(
  current: { storageKey: string | undefined; defaultSize: number; value: number },
  next: { storageKey: string | undefined; defaultSize: number; value: number },
): boolean {
  return current.storageKey === next.storageKey &&
    current.defaultSize === next.defaultSize &&
    current.value === next.value
}

function sameRouteLayoutPaneState(
  current: { storageKey: string | undefined; value: RouteLayoutPaneState },
  next: { storageKey: string | undefined; value: RouteLayoutPaneState },
): boolean {
  return current.storageKey === next.storageKey && current.value === next.value
}

export function useRouteLayoutPaneController({
  routeLayout,
  paneId,
  fallbackState = 'default',
  fallbackSize = 0,
  clampSize,
  controlledState,
  onStateChange,
}: UseRouteLayoutPaneControllerOptions): RouteLayoutPaneController {
  const pane = React.useMemo(() => routeLayoutPaneById(routeLayout, paneId), [paneId, routeLayout])
  const stateStorageKey = routeLayoutPaneStateStorageKey(pane)
  const sizeStorageKey = pane?.storageKey
  const defaultSize = pane?.defaultSize ?? fallbackSize
  const clampPaneSize = React.useCallback((size: number) => {
    if (clampSize) return clampSize(size)
    return clampRouteLayoutPaneSize(pane, size, defaultSize)
  }, [clampSize, defaultSize, pane])
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
      value: readRouteLayoutPaneSize(sizeStorageKey, defaultSize, clampPaneSize),
    }
  })
  const size = sizeState.storageKey === sizeStorageKey && sizeState.defaultSize === defaultSize
    ? sizeState.value
    : readRouteLayoutPaneSize(sizeStorageKey, defaultSize, clampPaneSize)

  React.useEffect(() => {
    if (controlledState !== undefined) return
    setUncontrolledState((current) => {
      if (current.storageKey !== stateStorageKey) {
        const next = {
          storageKey: stateStorageKey,
          value: readRouteLayoutPaneState(pane, stateStorageKey, fallbackState),
        }
        return sameRouteLayoutPaneState(current, next) ? current : next
      }
      const next = {
        storageKey: stateStorageKey,
        value: allowedRouteLayoutPaneState(pane, current.value, routeLayoutPaneDefaultState(pane, fallbackState)),
      }
      return sameRouteLayoutPaneState(current, next) ? current : next
    })
  }, [controlledState, fallbackState, pane, stateStorageKey])

  React.useEffect(() => {
    setSizeValue((current) => {
      const next = {
        storageKey: sizeStorageKey,
        defaultSize,
        value: readRouteLayoutPaneSize(sizeStorageKey, defaultSize, clampPaneSize),
      }
      return sameRouteLayoutPaneSizeState(current, next) ? current : next
    })
  }, [clampPaneSize, defaultSize, sizeStorageKey])

  React.useEffect(() => {
    if (!stateStorageKey) return
    writeStoredPaneState(stateStorageKey, state)
  }, [state, stateStorageKey])

  React.useEffect(() => {
    if (!sizeStorageKey || state === 'hidden') return
    writeStoredPaneSize(sizeStorageKey, size)
  }, [size, sizeStorageKey, state])

  React.useEffect(() => {
    const keys = new Set([stateStorageKey, sizeStorageKey].filter((key): key is string => !!key))
    if (!keys.size) return undefined
    const handleStoredPaneValueChanged = (event: Event) => {
      const changedKey = (event as CustomEvent<{ key?: string }>).detail?.key
      if (changedKey && !keys.has(changedKey)) return
      if (controlledState === undefined) {
        setUncontrolledState((current) => {
          const next = {
            storageKey: stateStorageKey,
            value: readRouteLayoutPaneState(pane, stateStorageKey, fallbackState),
          }
          return sameRouteLayoutPaneState(current, next) ? current : next
        })
      }
      setSizeValue((current) => {
        const next = {
          storageKey: sizeStorageKey,
          defaultSize,
          value: readRouteLayoutPaneSize(sizeStorageKey, defaultSize, clampPaneSize),
        }
        return sameRouteLayoutPaneSizeState(current, next) ? current : next
      })
    }
    return listenToWindowEvent(ROUTE_LAYOUT_PANE_STORAGE_CHANGED_EVENT, handleStoredPaneValueChanged)
  }, [clampPaneSize, controlledState, defaultSize, fallbackState, pane, sizeStorageKey, stateStorageKey])

  const setSize = React.useCallback((nextSize: number) => {
    const nextValue = clampPaneSize(nextSize)
    setSizeValue((current) => {
      const next = {
        storageKey: sizeStorageKey,
        defaultSize,
        value: nextValue,
      }
      return sameRouteLayoutPaneSizeState(current, next) ? current : next
    })
    if (state !== 'hidden') writeStoredPaneSize(sizeStorageKey, nextValue)
  }, [clampPaneSize, defaultSize, sizeStorageKey, state])
  const setAllowedState = React.useCallback((nextState: RouteLayoutPaneState) => {
    const allowedState = allowedRouteLayoutPaneState(pane, nextState, routeLayoutPaneDefaultState(pane, fallbackState))
    if (controlledState === undefined) {
      setUncontrolledState((current) => {
        const next = {
          storageKey: stateStorageKey,
          value: allowedState,
        }
        return sameRouteLayoutPaneState(current, next) ? current : next
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
  const value = readStoredPaneValue(storageKey)
  if (isRouteLayoutPaneState(value)) return value
  if (value === '1') return 'default'
  if (value === '0') return 'hidden'
  if (value === 'true') return 'collapsed'
  if (value === 'false') return 'default'
  return undefined
}

function readStoredPaneSize(storageKey: string | undefined): number | undefined {
  if (!storageKey) return undefined
  const storedValue = readStoredPaneValue(storageKey)
  if (storedValue === null) return undefined
  const value = Number(storedValue)
  return Number.isFinite(value) ? value : undefined
}

function writeStoredPaneState(storageKey: string | undefined, state: RouteLayoutPaneState): void {
  if (!storageKey) return
  writeStoredPaneValue(storageKey, state)
}

function writeStoredPaneSize(storageKey: string | undefined, size: number): void {
  if (!storageKey) return
  writeStoredPaneValue(storageKey, String(size))
}

function readStoredPaneValue(storageKey: string): string | null {
  syncRouteLayoutPaneStorageWindow()
  const api = readElectronApi()
  if (!api?.getDesktopState) return readBrowserStorageItem('local', storageKey)
  hydrateStoredPaneValue(storageKey)
  if (routeLayoutPaneStorageCache.has(storageKey)) return routeLayoutPaneStorageCache.get(storageKey) ?? null
  const legacy = readBrowserStorageItem('local', storageKey)
  routeLayoutPaneStorageCache.set(storageKey, legacy ?? undefined)
  return legacy
}

function writeStoredPaneValue(storageKey: string, value: string): void {
  syncRouteLayoutPaneStorageWindow()
  routeLayoutPaneStorageCache.set(storageKey, value)
  routeLayoutPaneStorageHydrations.add(storageKey)
  bumpRouteLayoutPaneStorageVersion(storageKey)
  dispatchRouteLayoutPaneStorageChanged(storageKey)

  const api = readElectronApi()
  if (!api?.getDesktopState || !api.setDesktopState) {
    writeBrowserStorageItem('local', storageKey, value)
    return
  }
  void api.setDesktopState({ key: routeLayoutPaneDesktopKey(storageKey), value })
    .then(() => removeBrowserStorageItem('local', storageKey))
    .catch(() => writeBrowserStorageItem('local', storageKey, value))
}

function hydrateStoredPaneValue(storageKey: string): void {
  if (routeLayoutPaneStorageHydrations.has(storageKey)) return
  routeLayoutPaneStorageHydrations.add(storageKey)
  const legacy = readBrowserStorageItem('local', storageKey)
  if (!routeLayoutPaneStorageCache.has(storageKey)) {
    routeLayoutPaneStorageCache.set(storageKey, legacy ?? undefined)
  }
  const hydrationVersion = routeLayoutPaneStorageVersions.get(storageKey) ?? 0
  const api = readElectronApi()
  if (!api?.getDesktopState) return
  void api.getDesktopState({ key: routeLayoutPaneDesktopKey(storageKey) }).then((result) => {
    if ((routeLayoutPaneStorageVersions.get(storageKey) ?? 0) !== hydrationVersion) return
    if (typeof result.value === 'string') {
      routeLayoutPaneStorageCache.set(storageKey, result.value)
      removeBrowserStorageItem('local', storageKey)
      dispatchRouteLayoutPaneStorageChanged(storageKey)
      return
    }
    if (legacy !== null && api.setDesktopState) {
      void api.setDesktopState({ key: routeLayoutPaneDesktopKey(storageKey), value: legacy })
        .then(() => removeBrowserStorageItem('local', storageKey))
        .catch(() => undefined)
    }
  }).catch(() => undefined)
}

function syncRouteLayoutPaneStorageWindow(): void {
  if (typeof window === 'undefined') {
    if (routeLayoutPaneStorageWindow !== undefined) {
      routeLayoutPaneStorageCache.clear()
      routeLayoutPaneStorageHydrations.clear()
      routeLayoutPaneStorageVersions.clear()
      routeLayoutPaneStorageWindow = undefined
    }
    return
  }
  if (routeLayoutPaneStorageWindow === window) return
  routeLayoutPaneStorageCache.clear()
  routeLayoutPaneStorageHydrations.clear()
  routeLayoutPaneStorageVersions.clear()
  routeLayoutPaneStorageWindow = window
}

function bumpRouteLayoutPaneStorageVersion(storageKey: string): void {
  routeLayoutPaneStorageVersions.set(storageKey, (routeLayoutPaneStorageVersions.get(storageKey) ?? 0) + 1)
}

function dispatchRouteLayoutPaneStorageChanged(storageKey: string): void {
  if (typeof window === 'undefined') return
  if (typeof CustomEvent === 'undefined') return
  publishWindowEvent(new CustomEvent(ROUTE_LAYOUT_PANE_STORAGE_CHANGED_EVENT, {
    detail: { key: storageKey },
  }))
}

function routeLayoutPaneDesktopKey(storageKey: string): string {
  return `${ROUTE_LAYOUT_PANE_DESKTOP_PREFIX}.${stableHash(storageKey)}`
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function isRouteLayoutPaneState(value: unknown): value is RouteLayoutPaneState {
  return value === 'default' || value === 'collapsed' || value === 'expanded' || value === 'hidden'
}
