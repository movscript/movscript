import React from 'react'
import { AgentConversationProjectionContentItemView } from '@/features/agent/components/AgentConversationProjectionContentItem'
import {
  type AgentConversationProjectionContentItem,
  type AgentConversationProjectionItem,
} from '@/features/agent/domain/agentConversationProjectionTypes'
import type { AgentConversationProjectionActions } from '@/features/agent/components/AgentConversationProjectionActions'

export interface AgentConversationProjectionItemsProps extends AgentConversationProjectionActions {
  hiddenActivityActionItemIds: Set<string>
  items: AgentConversationProjectionItem[]
  projectId?: number
}

export function AgentConversationProjectionItems({
  approvingLocalRun,
  hiddenActivityActionItemIds,
  items,
  projectId,
  onAnswerLocalRunInput,
  onApproveLocalRun,
  onRejectLocalRun,
}: AgentConversationProjectionItemsProps) {
  const renderContentItem = (item: AgentConversationProjectionContentItem) => {
    return (
      <AgentConversationProjectionContentItemView
        key={item.id}
        item={item}
        projectId={projectId}
        hiddenActivityActionItemIds={hiddenActivityActionItemIds}
        approvingLocalRun={approvingLocalRun}
        onApproveLocalRun={onApproveLocalRun}
        onRejectLocalRun={onRejectLocalRun}
        onAnswerLocalRunInput={onAnswerLocalRunInput}
      />
    )
  }

  return (
    <React.Fragment>
      {items.map((item) => {
        if (item.type !== 'run_turn') return renderContentItem(item)
        return (
          <div
            key={item.id}
            className="ai-agent-panel-run-group"
            data-has-user={projectionRunTurnHasUserMessage(item.items) ? 'true' : undefined}
            data-agent-run-group-id={item.runId}
          >
            {item.items.map(renderContentItem)}
          </div>
        )
      })}
    </React.Fragment>
  )
}

function projectionRunTurnHasUserMessage(items: AgentConversationProjectionContentItem[]): boolean {
  return items.some((item) => item.type === 'message' && item.item.message.role === 'user')
}
