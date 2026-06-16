import { useEffect, useState } from 'react'
import type { ElectronVideoClipStatus } from '@/shared/contracts/electronApi'
import { getResourceVideoClipStatus, resourceVideoClipApiAvailable } from '@/features/resources/application/resourceVideoClipElectron'

export interface ResourceVideoClipStatusState extends Partial<ElectronVideoClipStatus> {
  loading: boolean
  available: boolean
  unavailableReason?: 'desktop_unavailable' | 'status_failed'
}

export function useResourceVideoClipStatus(): ResourceVideoClipStatusState {
  const [clipStatus, setClipStatus] = useState<ResourceVideoClipStatusState>({
    loading: true,
    available: false,
  })

  useEffect(() => {
    let active = true
    if (!resourceVideoClipApiAvailable()) {
      setClipStatus({ loading: false, available: false, unavailableReason: 'desktop_unavailable' })
      return
    }

    setClipStatus({ loading: true, available: false })
    getResourceVideoClipStatus()
      .then((status) => {
        if (!active) return
        if (!status) {
          setClipStatus({ loading: false, available: false, unavailableReason: 'desktop_unavailable' })
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
