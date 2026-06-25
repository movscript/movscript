import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronUp, CircleDot, CornerDownLeft, Loader2, Pencil, Trash2 } from 'lucide-react'
import { AppFeedbackText } from '@movscript/ui/business/app'
import { AgentSurfaceBlock } from '@movscript/ui/business/agent'
import { Input } from '@movscript/ui/primitives'
import type { AgentPendingActiveRunInputQueueItem } from '@movscript/agent-protocol'
import {
  agentChatQueuedInputSummary,
  agentThreadGoalStatusLabel,
  type AgentChatQueuedInputPreviewItem,
  type AgentChatQueuedInputStatus,
  type AgentThreadGoalState,
} from '@movscript/agent-chat'

export interface AgentQueuedInputPreviewProps {
  goal: AgentThreadGoalState | null
  items: AgentChatQueuedInputPreviewItem[]
  pendingActiveRunItems: AgentPendingActiveRunInputQueueItem[]
  collapsed: boolean
  steerEnabled: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  onDelete?: (id: string) => void
  onEdit?: (id: string) => void
  onEditCancel?: (id: string) => void
  onSteerNow?: (id: string) => void
  onTextChange?: (id: string, text: string) => void
}

export function AgentQueuedInputPreview({
  goal,
  items,
  pendingActiveRunItems,
  collapsed,
  steerEnabled,
  onCollapsedChange,
  onDelete,
  onEdit,
  onEditCancel,
  onSteerNow,
  onTextChange,
}: AgentQueuedInputPreviewProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const previewItems = items.length > 0
    ? items
    : pendingActiveRunItems.map((item, index): AgentChatQueuedInputPreviewItem => ({
        id: item.id,
        text: item.content,
        inputs: [],
        status: 'draft' as AgentChatQueuedInputStatus,
        createdAt: index,
      }))
  const editingItem = editingId ? previewItems.find((item) => item.id === editingId) : undefined

  useEffect(() => {
    if (!editingId || editingItem) return
    setEditingId(null)
    setEditingText('')
  }, [editingId, editingItem])

  if (previewItems.length === 0 && !goal) return null

  function startEditing(item: AgentChatQueuedInputPreviewItem) {
    if (item.status === 'sending') return
    setEditingId(item.id)
    setEditingText(item.text)
    onEdit?.(item.id)
  }

  function commitEditing(item: AgentChatQueuedInputPreviewItem) {
    if (editingId !== item.id) return
    setEditingId(null)
    onTextChange?.(item.id, editingText)
  }

  function cancelEditing(item: AgentChatQueuedInputPreviewItem) {
    if (editingId !== item.id) return
    setEditingId(null)
    setEditingText(item.text)
    onEditCancel?.(item.id)
  }

  const isCollapsed = collapsed && previewItems.length > 1
  const visibleItems = isCollapsed ? previewItems.slice(0, 1) : previewItems

  return (
    <div className="mb-2 flex justify-center">
      <div className="w-[calc(100%-32px)] max-w-[680px] space-y-1.5">
        {goal ? <AgentGoalStatusPill goal={goal} /> : null}
        {previewItems.length > 0 ? (
          <div className="rounded-md border border-border bg-muted/45 px-2.5 py-2 shadow-sm">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left type-tiny text-muted-foreground"
              onClick={() => onCollapsedChange?.(!collapsed)}
              aria-expanded={!isCollapsed}
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                {previewItems.some((item) => item.status === 'sending')
                  ? <Loader2 size={10} className="shrink-0 animate-spin" />
                  : <CornerDownLeft size={11} className="shrink-0" />}
                <span className="truncate">等待进入会话</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5">
                <span>{previewItems.length}</span>
                {isCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
              </span>
            </button>
            <div className="mt-1.5 space-y-1">
              {visibleItems.map((item) => (
                <div
                  key={item.id}
                  className="flex min-h-8 items-center gap-2 border-t border-border/70 pt-1 first:border-t-0 first:pt-0"
                >
                  <div className="min-w-0 flex-1">
                    {editingId === item.id ? (
                      <Input
                        autoFocus
                        className="h-7 w-full rounded-sm border border-border bg-background px-2 type-tiny text-foreground outline-none focus:border-primary"
                        value={editingText}
                        aria-label="编辑等待消息内容"
                        onChange={(event) => setEditingText(event.currentTarget.value)}
                        onBlur={() => commitEditing(item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            commitEditing(item)
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            event.stopPropagation()
                            cancelEditing(item)
                          }
                        }}
                      />
                    ) : (
                      <div className="truncate type-tiny text-foreground" title={agentChatQueuedInputSummary(item)}>
                        {agentChatQueuedInputSummary(item)}
                      </div>
                    )}
                    {item.error ? (
                      <AppFeedbackText as="div" className="truncate type-tiny" title={item.error}>{item.error}</AppFeedbackText>
                    ) : null}
                  </div>
                  {item.status === 'sending' ? (
                    <Loader2 size={13} className="shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        className="ms-control h-6 w-6 justify-center p-0"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => editingId === item.id ? commitEditing(item) : startEditing(item)}
                        aria-label={editingId === item.id ? '保存等待消息' : '编辑等待消息'}
                        title={editingId === item.id ? '保存等待消息' : '编辑等待消息'}
                      >
                        {editingId === item.id ? <Check size={12} /> : <Pencil size={12} />}
                      </button>
                      <button
                        type="button"
                        className="ms-control h-6 w-6 justify-center p-0"
                        disabled={editingId === item.id || !steerEnabled}
                        onClick={() => onSteerNow?.(item.id)}
                        aria-label="立即插队"
                        title={steerEnabled ? '立即插队' : '当前后端不支持运行中插队'}
                      >
                        <CornerDownLeft size={12} />
                      </button>
                      <button
                        type="button"
                        className="ms-control h-6 w-6 justify-center p-0"
                        disabled={editingId === item.id}
                        onClick={() => onDelete?.(item.id)}
                        aria-label="删除等待消息"
                        title="删除等待消息"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function AgentGoalStatusPill({ goal }: { goal: AgentThreadGoalState }) {
  const usage = goal.tokenBudget && goal.tokensUsed !== undefined
    ? `${goal.tokensUsed}/${goal.tokenBudget}`
    : goal.tokensUsed !== undefined
      ? `${goal.tokensUsed} tokens`
      : undefined

  return (
    <AgentSurfaceBlock className="flex min-h-8 items-center gap-2 px-2.5 py-1.5">
      <CircleDot size={12} className="shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="truncate type-tiny font-medium text-foreground" title={goal.objective}>
          {goal.objective}
        </div>
      </div>
      <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 type-tiny text-muted-foreground">
        {agentThreadGoalStatusLabel(goal.status)}
      </span>
      {usage ? (
        <span className="hidden shrink-0 type-tiny text-muted-foreground sm:inline">
          {usage}
        </span>
      ) : null}
    </AgentSurfaceBlock>
  )
}
