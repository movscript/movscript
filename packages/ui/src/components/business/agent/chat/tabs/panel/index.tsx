"use client";

import * as React from "react";
import type { AgentConversationTabsPanelProps } from "../../types";
import { AgentConversationTab } from "../item";
import {
  agentConversationTabClientPointFromEvent,
  resolveAgentConversationTabDragOver,
  resolveAgentConversationTabDrop,
  startAgentConversationTabDrag,
  type AgentConversationTabDropPosition,
} from "./dragPayload";

type DropTarget = { conversationId: string; position: AgentConversationTabDropPosition };

export function AgentConversationTabsPanel({
  activeConversationId,
  conversations,
  endAccessory,
  onCloseConversation,
  onCloseTabContextMenu,
  onOpenKeyboardMenu,
  onOpenMenu,
  onReorderConversation,
  onSelectConversation,
  conversationTabsLabel,
  closeConversationLabel,
  renameConversationLabel,
}: AgentConversationTabsPanelProps) {
  const [draggingConversationId, setDraggingConversationId] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<DropTarget | null>(null);
  const [editingConversationId, setEditingConversationId] = React.useState<string | null>(null);

  function clearDragState() {
    setDraggingConversationId(null);
    setDropTarget(null);
  }

  return (
    <div
      className="ai-agent-panel-conversation-tabs"
      role="tablist"
      aria-label={conversationTabsLabel}
      data-density={conversations.length > 4 ? "scroll" : "fit"}
    >
      <div className="ai-agent-panel-conversation-tabs__items">
        {conversations.map((item) => (
          <AgentConversationTab
            key={item.id}
            item={item}
            isActive={item.id === activeConversationId}
            isDragging={draggingConversationId === item.id}
            isEditing={editingConversationId === item.id}
            dropPosition={dropTarget?.conversationId === item.id ? dropTarget.position : undefined}
            tabLabel={item.sessionState ? `${item.title}，Session ${item.sessionState}` : item.title}
            conversationTabsLabel={conversationTabsLabel}
            closeConversationLabel={closeConversationLabel}
            renameConversationLabel={renameConversationLabel}
            onCloseConversation={onCloseConversation}
            onCloseTabContextMenu={onCloseTabContextMenu}
            onEditingChange={(editing) => setEditingConversationId(editing ? item.id : null)}
            onOpenKeyboardMenu={onOpenKeyboardMenu}
            onOpenMenu={onOpenMenu}
            onSelectConversation={onSelectConversation}
            onDragStart={(event) => {
              if ((event.target as HTMLElement).closest(".ai-agent-panel-conversation-tab-close")) {
                event.preventDefault();
                return;
              }
              onCloseTabContextMenu();
              startAgentConversationTabDrag(event.dataTransfer, item.id);
              setDraggingConversationId(item.id);
            }}
            onDragOver={(event) => {
              const target = resolveAgentConversationTabDragOver({
                dataTransfer: event.dataTransfer,
                draggingConversationId,
                targetConversationId: item.id,
                point: agentConversationTabClientPointFromEvent(event),
                tabElement: event.currentTarget,
              });
              if (!target) {
                setDropTarget(null);
                return;
              }
              event.preventDefault();
              setDropTarget(target);
            }}
            onDragLeave={(event) => {
              const nextTarget = event.relatedTarget;
              if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
              if (dropTarget?.conversationId === item.id) setDropTarget(null);
            }}
            onDrop={(event) => {
              const drop = resolveAgentConversationTabDrop({
                dataTransfer: event.dataTransfer,
                draggingConversationId,
                targetConversationId: item.id,
                point: agentConversationTabClientPointFromEvent(event),
                tabElement: event.currentTarget,
              });
              event.preventDefault();
              clearDragState();
              if (!drop) return;
              onReorderConversation(drop.draggedConversationId, drop.targetConversationId, drop.position);
            }}
            onDragEnd={clearDragState}
          />
        ))}
      </div>
      {endAccessory ? (
        <div className="ai-agent-panel-conversation-tabs__end">
          {endAccessory}
        </div>
      ) : null}
    </div>
  );
}
