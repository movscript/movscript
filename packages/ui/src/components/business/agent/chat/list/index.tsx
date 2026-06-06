"use client";

import * as React from "react";
import { ArchiveIcon, ChevronRightIcon, PlusIcon, RefreshIcon, TrashIcon } from "../../../../primitives/icons";
import { Button } from "../../../../primitives/button";
import { ScrollArea } from "../../../../primitives/scroll-area";
import type { AgentConversationListItem, AgentConversationListPanelProps } from "../types";

export function AgentConversationListPanel({
  conversations,
  providerSessionThreads,
  onNew,
  onCollapse,
  onRefreshProviderSessionThreads,
  showCollapse = true,
  emptyLabel,
  providerSessionThreadsLabel,
  providerSessionThreadsEmptyLabel,
  newConversationLabel,
  collapseAssistantLabel,
  archiveConversationLabel,
  deleteConversationLabel,
  renameConversationLabel,
  refreshLabel,
}: AgentConversationListPanelProps) {
  return (
    <main className="ms-agent-main">
      <header className="ms-agent-header ai-agent-panel-list-header">
        <div className="ms-agent-header__actions ai-agent-panel-list-header-actions">
          <Button size="icon-sm" variant="ghost" onClick={onNew} aria-label={newConversationLabel} title={newConversationLabel} className="shrink-0">
            <PlusIcon />
          </Button>
          {showCollapse && (
            <Button size="icon-sm" variant="ghost" onClick={onCollapse} aria-label={collapseAssistantLabel} title={collapseAssistantLabel} className="ai-agent-panel-header-collapse">
              <ChevronRightIcon />
            </Button>
          )}
        </div>
      </header>
      <div className="ms-agent-body">
        <ScrollArea className="h-full">
          {conversations.length === 0 ? (
            <div className="ms-agent-empty min-h-0 py-12">
              <p className="type-body font-medium text-foreground">{emptyLabel}</p>
            </div>
          ) : (
            <div className="ms-agent-sidebar__section">
              {conversations.map((conv) => (
                <div key={conv.id} className="group relative">
                  <EditableConversationListRow item={conv} renameConversationLabel={renameConversationLabel} />
                  {conv.onArchive ? (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        conv.onArchive?.();
                      }}
                      className="absolute bottom-2 right-2 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                      aria-label={String(archiveConversationLabel)}
                      title={String(archiveConversationLabel)}
                    >
                      <ArchiveIcon />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <div className="ms-agent-sidebar__section">
            <div className="mb-1 flex items-center justify-between px-1">
              <h2 className="ms-agent-sidebar__title px-0">
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden="true">•</span>
                  {providerSessionThreadsLabel}
                </span>
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={onRefreshProviderSessionThreads}
                className="px-1 type-tiny text-muted-foreground"
                aria-label={refreshLabel}
                title={refreshLabel}
              >
                <RefreshIcon />
              </Button>
            </div>
            {providerSessionThreads.length === 0 ? (
              <p className="px-1 type-tiny text-muted-foreground">{providerSessionThreadsEmptyLabel}</p>
            ) : (
              providerSessionThreads.map((thread) => (
                <div key={thread.id} className="group relative">
                  <EditableConversationListRow item={thread} renameConversationLabel={renameConversationLabel} />
                  {thread.onDelete ? (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        thread.onDelete?.();
                      }}
                      className="absolute bottom-2 right-2 text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      aria-label={String(deleteConversationLabel)}
                      title={String(deleteConversationLabel)}
                    >
                      <TrashIcon />
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </main>
  );
}

function EditableConversationListRow({
  item,
  renameConversationLabel,
}: {
  item: AgentConversationListItem;
  renameConversationLabel: string;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const clickTimerRef = React.useRef<number | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(item.title);

  React.useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (!editing) return;
    setDraftTitle(item.title);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [editing, item.title]);

  function startEditing(event: React.MouseEvent) {
    if (!item.onRename) return;
    event.preventDefault();
    event.stopPropagation();
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    setEditing(true);
  }

  function handleClick() {
    if (!item.onRename) {
      item.onClick();
      return;
    }
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      item.onClick();
    }, 180);
  }

  function cancelEditing() {
    setDraftTitle(item.title);
    setEditing(false);
  }

  function commitEditing() {
    const trimmed = draftTitle.trim();
    if (!trimmed || trimmed === item.title.trim()) {
      cancelEditing();
      return;
    }
    setEditing(false);
    void item.onRename?.(trimmed);
  }

  if (editing) {
    return (
      <form
        className="ms-agent-conversation ms-agent-conversation--editing pr-10"
        onSubmit={(event) => {
          event.preventDefault();
          commitEditing();
        }}
      >
        <span className="ms-agent-conversation__indicator" aria-hidden="true" />
        <span className="ms-agent-conversation__body">
          <input
            ref={inputRef}
            className="ms-agent-conversation__title-input"
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
          {item.description ? (
            <span className="ms-agent-text ms-agent-text--truncate ms-agent-text--muted ms-agent-conversation__description">{item.description}</span>
          ) : null}
        </span>
        {item.meta ? <span className="ms-agent-text ms-agent-text--truncate ms-agent-text--muted ms-agent-conversation__meta">{item.meta}</span> : null}
      </form>
    );
  }

  return (
    <button type="button" className="ms-agent-conversation pr-10" onClick={handleClick} onDoubleClick={startEditing}>
      <span className="ms-agent-conversation__indicator" aria-hidden="true" />
      <span className="ms-agent-conversation__body">
        <span className="ms-agent-text ms-agent-text--truncate ms-agent-conversation__title">{item.title}</span>
        {item.description ? (
          <span className="ms-agent-text ms-agent-text--truncate ms-agent-text--muted ms-agent-conversation__description">{item.description}</span>
        ) : null}
      </span>
      {item.meta ? <span className="ms-agent-text ms-agent-text--truncate ms-agent-text--muted ms-agent-conversation__meta">{item.meta}</span> : null}
    </button>
  );
}
