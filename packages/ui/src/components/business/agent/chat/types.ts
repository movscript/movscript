import type * as React from "react";

export interface AgentConversationListItem {
  id: string;
  title: string;
  description?: string;
  meta?: string;
  onClick: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}

export interface AgentConversationListPanelProps {
  conversations: AgentConversationListItem[];
  localThreads: AgentConversationListItem[];
  onNew: () => void;
  onCollapse: () => void;
  onRefreshLocalThreads: () => void;
  showCollapse?: boolean;
  emptyLabel: string;
  localRuntimeLabel: string;
  localRuntimeThreadsEmptyLabel: string;
  newConversationLabel: string;
  collapseAssistantLabel: string;
  archiveConversationLabel: string;
  deleteConversationLabel: string;
  refreshLabel: string;
}

export interface AgentConversationTabItem {
  id: string;
  title: string;
  messageCount?: number;
  runtimeState?: "stopped" | "waiting" | "active";
  runtimeDetail?: string;
}

export interface AgentConversationTabsPanelProps {
  activeConversationId: string;
  conversations: AgentConversationTabItem[];
  onCloseConversation: (id: string) => void;
  onCloseTabContextMenu: () => void;
  onOpenKeyboardMenu: (event: React.KeyboardEvent, conversationId: string) => void;
  onOpenMenu: (event: React.MouseEvent, conversationId: string) => void;
  onReorderConversation: (draggedId: string, targetId: string, position: "before" | "after") => void;
  onSelectConversation: (id: string) => void;
  conversationTabsLabel: string;
  archiveConversationLabel: string;
  closeConversationLabel: string;
}
