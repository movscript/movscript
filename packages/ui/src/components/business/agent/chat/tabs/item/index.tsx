"use client";

import * as React from "react";
import { Button } from "../../../../../primitives/button";
import { XIcon } from "../../../../../primitives/icons";
import type { AgentConversationTabItem } from "../../types";

export interface AgentConversationTabProps {
  item: AgentConversationTabItem;
  isActive: boolean;
  isDragging: boolean;
  isEditing: boolean;
  dropPosition?: "before" | "after";
  tabLabel: string;
  conversationTabsLabel: string;
  closeConversationLabel: string;
  renameConversationLabel: string;
  onCloseConversation: (id: string) => void;
  onCloseTabContextMenu: () => void;
  onEditingChange: (editing: boolean) => void;
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
  isEditing,
  dropPosition,
  tabLabel,
  conversationTabsLabel,
  closeConversationLabel,
  renameConversationLabel,
  onCloseConversation,
  onCloseTabContextMenu,
  onEditingChange,
  onOpenKeyboardMenu,
  onOpenMenu,
  onSelectConversation,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: AgentConversationTabProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [draftTitle, setDraftTitle] = React.useState(item.title);

  React.useEffect(() => {
    if (!isEditing) return;
    setDraftTitle(item.title);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [isEditing, item.title]);

  function startEditing(event: React.MouseEvent) {
    if (!item.onRename) return;
    event.preventDefault();
    event.stopPropagation();
    onCloseTabContextMenu();
    onEditingChange(true);
  }

  function cancelEditing() {
    setDraftTitle(item.title);
    onEditingChange(false);
  }

  function commitEditing() {
    const trimmed = draftTitle.trim();
    if (!trimmed || trimmed === item.title.trim()) {
      cancelEditing();
      return;
    }
    onEditingChange(false);
    void item.onRename?.(trimmed);
  }

  return (
    <div
      className="ai-agent-panel-conversation-tab"
      data-active={isActive ? "true" : "false"}
      data-dragging={isDragging ? "true" : undefined}
      data-editing={isEditing ? "true" : undefined}
      data-drop-position={dropPosition}
      draggable={!isEditing}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onContextMenu={(event) => onOpenMenu(event, item.id)}
    >
      {isEditing ? (
        <form
          className="ai-agent-panel-conversation-tab-main ai-agent-panel-conversation-tab-edit"
          onSubmit={(event) => {
            event.preventDefault();
            commitEditing();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
        >
          <input
            ref={inputRef}
            className="ai-agent-panel-conversation-tab-input"
            aria-label={renameConversationLabel}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={commitEditing}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEditing();
              }
            }}
          />
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          role="tab"
          aria-selected={isActive}
          aria-label={tabLabel}
          className="ai-agent-panel-conversation-tab-main"
          title={`${item.title} · ${conversationTabsLabel}`}
          onDoubleClick={startEditing}
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
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="ai-agent-panel-conversation-tab-close"
        draggable={false}
        aria-label={closeConversationLabel}
        title={closeConversationLabel}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onCloseConversation(item.id);
        }}
      >
        <XIcon />
      </Button>
    </div>
  );
}
