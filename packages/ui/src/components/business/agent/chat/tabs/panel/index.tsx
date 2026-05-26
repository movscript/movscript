"use client";

import * as React from "react";
import type { AgentConversationTabsPanelProps } from "../../types";
import { AgentConversationTab } from "../item";

type DropTarget = { conversationId: string; position: "before" | "after" };

function dropPositionForEvent(event: React.DragEvent<HTMLElement>): "before" | "after" {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX >= rect.left + rect.width / 2 ? "after" : "before";
}

export function AgentConversationTabsPanel({
  activeConversationId,
  conversations,
  onCloseConversation,
  onCloseTabContextMenu,
  onOpenKeyboardMenu,
  onOpenMenu,
  onReorderConversation,
  onSelectConversation,
  conversationTabsLabel,
  closeConversationLabel,
}: AgentConversationTabsPanelProps) {
  const [draggingConversationId, setDraggingConversationId] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<DropTarget | null>(null);

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
      {conversations.map((item) => (
        <AgentConversationTab
          key={item.id}
          item={item}
          isActive={item.id === activeConversationId}
          isDragging={draggingConversationId === item.id}
          dropPosition={dropTarget?.conversationId === item.id ? dropTarget.position : undefined}
          tabLabel={item.runtimeState ? `${item.title}，Runtime ${item.runtimeState}` : item.title}
          conversationTabsLabel={conversationTabsLabel}
          closeConversationLabel={closeConversationLabel}
          onCloseConversation={onCloseConversation}
          onCloseTabContextMenu={onCloseTabContextMenu}
          onOpenKeyboardMenu={onOpenKeyboardMenu}
          onOpenMenu={onOpenMenu}
          onSelectConversation={onSelectConversation}
          onDragStart={(event) => {
            if ((event.target as HTMLElement).closest(".ai-agent-panel-conversation-tab-close")) {
              event.preventDefault();
              return;
            }
            onCloseTabContextMenu();
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", item.id);
            setDraggingConversationId(item.id);
          }}
          onDragOver={(event) => {
            const draggedId = draggingConversationId ?? event.dataTransfer.getData("text/plain");
            if (!draggedId || draggedId === item.id) {
              setDropTarget(null);
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropTarget({ conversationId: item.id, position: dropPositionForEvent(event) });
          }}
          onDragLeave={(event) => {
            const nextTarget = event.relatedTarget;
            if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
            if (dropTarget?.conversationId === item.id) setDropTarget(null);
          }}
          onDrop={(event) => {
            const draggedId = draggingConversationId ?? event.dataTransfer.getData("text/plain");
            const position = dropPositionForEvent(event);
            event.preventDefault();
            clearDragState();
            if (!draggedId || draggedId === item.id) return;
            onReorderConversation(draggedId, item.id, position);
          }}
          onDragEnd={clearDragState}
        />
      ))}
    </div>
  );
}
