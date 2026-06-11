import type * as React from "react";

export interface AgentConversationTabItem {
  id: string;
  title: string;
  messageCount?: number;
  sessionState?: "stopped" | "waiting" | "active" | "error";
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
