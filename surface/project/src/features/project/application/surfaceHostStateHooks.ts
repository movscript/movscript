import { useSyncExternalStore } from 'react'
import {
  getSurfaceHostStateSnapshot,
  subscribeSurfaceHostState,
  type SurfaceHostStateSnapshot,
} from '@movscript/shared'

export function useSurfaceHostState<T>(selector: (snapshot: SurfaceHostStateSnapshot) => T): T {
  return selector(useSyncExternalStore(
    subscribeSurfaceHostState,
    getSurfaceHostStateSnapshot,
    getSurfaceHostStateSnapshot,
  ))
}
