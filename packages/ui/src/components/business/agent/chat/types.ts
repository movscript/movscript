import type * as React from "react";

export interface AgentConversationListItem {
  id: string;
  title: string;
  description?: string;
  meta?: string;
  onClick: () => void;
  onRename?: (title: string) => void | Promise<void>;
  onArchive?: () => void;
  onDelete?: () => void;
}

export interface AgentConversationListPanelProps {
  conversations: AgentConversationListItem[];
  providerSessionThreads: AgentConversationListItem[];
  onNew: () => void;
  onCollapse: () => void;
  onRefreshProviderSessionThreads: () => void;
  showCollapse?: boolean;
  emptyLabel: string;
  providerSessionThreadsLabel: string;
  providerSessionThreadsEmptyLabel: string;
  newConversationLabel: string;
  collapseAssistantLabel: string;
  archiveConversationLabel: string;
  deleteConversationLabel: string;
  renameConversationLabel: string;
  refreshLabel: string;
}

export interface AgentConversationTabItem {
  id: string;
  title: string;
  messageCount?: number;
  sessionState?: "stopped" | "waiting" | "active";
  sessionDetail?: string;
  onRename?: (title: string) => void | Promise<void>;
}

export interface AgentConversationTabsPanelProps {
  activeConversationId: string;
  conversations: AgentConversationTabItem[];
  endAccessory?: React.ReactNode;
  onCloseConversation: (id: string) => void;
  onCloseTabContextMenu: () => void;
  onOpenKeyboardMenu: (event: React.KeyboardEvent, conversationId: string) => void;
  onOpenMenu: (event: React.MouseEvent, conversationId: string) => void;
  onReorderConversation: (draggedId: string, targetId: string, position: "before" | "after") => void;
  onSelectConversation: (id: string) => void;
  conversationTabsLabel: string;
  archiveConversationLabel: string;
  closeConversationLabel: string;
  renameConversationLabel: string;
}
