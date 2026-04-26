import { SceneDetail } from '@/components/detail'
import type { Scene } from '@/types'

export function SceneWorkspace({ scene }: { scene: Scene }) {
  return <SceneDetail scene={scene} />
}
