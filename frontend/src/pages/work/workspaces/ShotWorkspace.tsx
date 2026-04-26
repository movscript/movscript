import { ShotDetail } from '@/components/detail'
import type { Shot } from '@/types'

export function ShotWorkspace({ shot }: { shot: Shot }) {
  return <ShotDetail shot={shot} />
}
