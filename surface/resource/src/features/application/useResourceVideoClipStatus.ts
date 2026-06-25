import { useEffect, useState } from 'react'
import type { SurfaceHostVideoClipStatus } from '@movscript/shared'
import { getResourceMediaPipelineTrimStatus, resourceMediaPipelineTrimApiAvailable } from './resourceVideoClipHost'

export interface ResourceVideoClipStatusState extends Partial<SurfaceHostVideoClipStatus> {
  loading: boolean
  available: boolean
  unavailableReason?: 'host_unavailable' | 'status_failed'
}

export function useResourceVideoClipStatus(): ResourceVideoClipStatusState {
  const [clipStatus, setClipStatus] = useState<ResourceVideoClipStatusState>({
    loading: true,
    available: false,
  })

  useEffect(() => {
    let active = true
    if (!resourceMediaPipelineTrimApiAvailable()) {
      setClipStatus({ loading: false, available: false, unavailableReason: 'host_unavailable' })
      return
    }

    setClipStatus({ loading: true, available: false })
    getResourceMediaPipelineTrimStatus()
      .then((status) => {
        if (!active) return
        if (!status) {
          setClipStatus({ loading: false, available: false, unavailableReason: 'host_unavailable' })
          return
        }
        setClipStatus({ ...status, loading: false })
      })
      .catch(() => {
        if (active) setClipStatus({ loading: false, available: false, unavailableReason: 'status_failed' })
      })

    return () => {
      active = false
    }
  }, [])

  return clipStatus
}
