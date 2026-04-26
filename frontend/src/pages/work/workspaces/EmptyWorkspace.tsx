import type { EntityKind } from '../config'
import { KIND_CONFIG } from '../config'

export function EmptyWorkspace({ kind }: { kind: EntityKind }) {
  const cfg = KIND_CONFIG[kind]
  const Icon = cfg.icon
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
      <Icon size={40} className="opacity-20" />
      <p className="text-sm">从上方列表选择一个{cfg.label}</p>
    </div>
  )
}
