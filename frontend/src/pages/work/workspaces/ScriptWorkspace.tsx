import { ScriptDetail } from '@/components/detail'
import type { Script } from '@/types'

export function ScriptWorkspace({ script }: { script: Script }) {
  return <ScriptDetail script={script} />
}
