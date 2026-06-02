"use client";

import { ArchiveIcon, ChevronRightIcon, PlusIcon, RefreshIcon, TrashIcon } from "../../../../primitives/icons";
import { Button } from "../../../../primitives/button";
import { ScrollArea } from "../../../../primitives/scroll-area";
import type { AgentConversationListPanelProps } from "../types";

export function AgentConversationListPanel({
  conversations,
  localThreads,
  onNew,
  onCollapse,
  onRefreshLocalThreads,
  showCollapse = true,
  emptyLabel,
  localRuntimeLabel,
  localRuntimeThreadsEmptyLabel,
  newConversationLabel,
  collapseAssistantLabel,
  archiveConversationLabel,
  deleteConversationLabel,
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
                  <button type="button" className="ms-agent-conversation pr-10" onClick={conv.onClick}>
                    <span className="ms-agent-conversation__indicator" aria-hidden="true" />
                    <span className="ms-agent-conversation__body">
                      <span className="ms-agent-text ms-agent-text--truncate ms-agent-conversation__title">{conv.title}</span>
                      {conv.description ? (
                        <span className="ms-agent-text ms-agent-text--truncate ms-agent-text--muted ms-agent-conversation__description">{conv.description}</span>
                      ) : null}
                    </span>
                    {conv.meta ? <span className="ms-agent-text ms-agent-text--truncate ms-agent-text--muted ms-agent-conversation__meta">{conv.meta}</span> : null}
                  </button>
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
                  {localRuntimeLabel}
                </span>
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={onRefreshLocalThreads}
                className="px-1 type-tiny text-muted-foreground"
                aria-label={refreshLabel}
                title={refreshLabel}
              >
                <RefreshIcon />
              </Button>
            </div>
            {localThreads.length === 0 ? (
              <p className="px-1 type-tiny text-muted-foreground">{localRuntimeThreadsEmptyLabel}</p>
            ) : (
              localThreads.map((thread) => (
                <div key={thread.id} className="group relative">
                  <button type="button" className="ms-agent-conversation pr-10" onClick={thread.onClick}>
                    <span className="ms-agent-conversation__indicator" aria-hidden="true" />
                    <span className="ms-agent-conversation__body">
                      <span className="ms-agent-text ms-agent-text--truncate ms-agent-conversation__title">{thread.title}</span>
                      {thread.description ? (
                        <span className="ms-agent-text ms-agent-text--truncate ms-agent-text--muted ms-agent-conversation__description">{thread.description}</span>
                      ) : null}
                    </span>
                    {thread.meta ? <span className="ms-agent-text ms-agent-text--truncate ms-agent-text--muted ms-agent-conversation__meta">{thread.meta}</span> : null}
                  </button>
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
