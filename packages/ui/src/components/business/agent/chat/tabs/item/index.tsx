"use client";

import type * as React from "react";
import { Button } from "../../../../../primitives/button";
import { XIcon } from "../../../../../primitives/icons";
import type { AgentConversationTabItem } from "../../types";

export interface AgentConversationTabProps {
  item: AgentConversationTabItem;
  isActive: boolean;
  isDragging: boolean;
  dropPosition?: "before" | "after";
  tabLabel: string;
  conversationTabsLabel: string;
  closeConversationLabel: string;
  onCloseConversation: (id: string) => void;
  onCloseTabContextMenu: () => void;
  onOpenKeyboardMenu: (event: React.KeyboardEvent, conversationId: string) => void;
  onOpenMenu: (event: React.MouseEvent, conversationId: string) => void;
  onSelectConversation: (id: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

export function AgentConversationTab({
  item,
  isActive,
  isDragging,
  dropPosition,
  tabLabel,
  conversationTabsLabel,
  closeConversationLabel,
  onCloseConversation,
  onCloseTabContextMenu,
  onOpenKeyboardMenu,
  onOpenMenu,
  onSelectConversation,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: AgentConversationTabProps) {
  return (
    <div
      className="ai-agent-panel-conversation-tab"
      data-active={isActive ? "true" : "false"}
      data-dragging={isDragging ? "true" : undefined}
      data-drop-position={dropPosition}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onContextMenu={(event) => onOpenMenu(event, item.id)}
    >
      <Button
        type="button"
        variant="ghost"
        role="tab"
        aria-selected={isActive}
        aria-label={tabLabel}
        className="ai-agent-panel-conversation-tab-main"
        title={`${item.title} · ${conversationTabsLabel}`}
        onClick={() => {
          onCloseTabContextMenu();
          onSelectConversation(item.id);
        }}
        onKeyDown={(event) => onOpenKeyboardMenu(event, item.id)}
        onAuxClick={(event) => {
          if (event.button !== 1) return;
          event.preventDefault();
          onCloseConversation(item.id);
        }}
      >
        {item.runtimeState ? (
          <span
            className="ai-agent-panel-conversation-tab-runtime-light"
            data-runtime-state={item.runtimeState}
            aria-hidden="true"
            title={item.runtimeDetail}
          />
        ) : null}
        <span className="ai-agent-panel-conversation-tab-title">{item.title}</span>
        {typeof item.messageCount === "number" ? (
          <span className="ai-agent-panel-conversation-tab-count" aria-label={String(item.messageCount)}>
            {item.messageCount}
          </span>
        ) : null}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="ai-agent-panel-conversation-tab-close"
        aria-label={closeConversationLabel}
        title={closeConversationLabel}
        onClick={(event) => {
          event.stopPropagation();
          onCloseConversation(item.id);
        }}
      >
        <XIcon />
      </Button>
    </div>
  );
}
