import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@movscript/ui'
import { ContextDiagnosticCard } from '@/features/agent/components/ContextDiagnosticCard'
import type { ChatContextDiagnostic } from '@/features/agent/state/agentStore'
import type { AgentTimelineItem } from '@/shared/infrastructure/providerSessionClient'

export interface ContextDiagnosticDialogProps {
  timelineItems: AgentTimelineItem[]
}

export function ContextDiagnosticDialog({ timelineItems }: ContextDiagnosticDialogProps) {
  const latestItem = useMemo(() => latestContextDiagnosticTimelineItem(timelineItems), [timelineItems])
  const [openItemId, setOpenItemId] = useState<string | null>(null)
  const diagnostic = latestItem ? contextDiagnosticFromTimelineItem(latestItem) : undefined

  useEffect(() => {
    if (latestItem) setOpenItemId(latestItem.id)
  }, [latestItem?.id])

  return (
    <Dialog
      open={!!diagnostic && openItemId === latestItem?.id}
      onOpenChange={(open) => setOpenItemId(open && latestItem ? latestItem.id : null)}
    >
      <DialogContent className="max-h-[88vh] w-[min(1040px,calc(100vw-32px))] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>上下文诊断</DialogTitle>
          <DialogDescription>
            本地运行上下文快照，不进入发给模型的消息流。
          </DialogDescription>
        </DialogHeader>
        {diagnostic && <ContextDiagnosticCard diagnostic={diagnostic} />}
      </DialogContent>
    </Dialog>
  )
}

export function latestContextDiagnosticTimelineItem(items: AgentTimelineItem[]): AgentTimelineItem | undefined {
  return items
    .filter((item) => !!contextDiagnosticFromTimelineItem(item))
    .sort(compareTimelineDiagnosticItems)
    .at(-1)
}

export function contextDiagnosticFromTimelineItem(item: AgentTimelineItem): ChatContextDiagnostic | undefined {
  if (item.origin !== 'provider_session') return undefined
  if (item.purpose !== 'diagnostic') return undefined
  if (item.surface !== 'debug_panel') return undefined
  if (item.contentPromptEligibility !== 'exclude') return undefined
  return item.meta?.contextDiagnostic
}

function compareTimelineDiagnosticItems(left: AgentTimelineItem, right: AgentTimelineItem): number {
  if (left.revision !== right.revision) return left.revision - right.revision
  const leftTime = Date.parse(left.createdAt) || 0
  const rightTime = Date.parse(right.createdAt) || 0
  if (leftTime !== rightTime) return leftTime - rightTime
  return left.id.localeCompare(right.id)
}
