export const AGENT_CONVERSATION_TAB_DRAG_TYPE = "application/x-movscript-agent-conversation-tab";

export type AgentConversationTabDropPosition = "before" | "after";

export interface AgentConversationTabDragPayload {
  kind: "agent-conversation-tab";
  conversationId: string;
}

type WritableDataTransfer = Pick<DataTransfer, "setData">;
type ReadableDataTransfer = Pick<DataTransfer, "getData">;

export function writeAgentConversationTabDragPayload(
  dataTransfer: WritableDataTransfer,
  conversationId: string,
) {
  const trimmedConversationId = conversationId.trim();
  if (!trimmedConversationId) return;
  dataTransfer.setData(AGENT_CONVERSATION_TAB_DRAG_TYPE, JSON.stringify({
    kind: "agent-conversation-tab",
    conversationId: trimmedConversationId,
  } satisfies AgentConversationTabDragPayload));
}

export function readAgentConversationTabDragPayload(
  dataTransfer: ReadableDataTransfer,
): AgentConversationTabDragPayload | null {
  const rawPayload = dataTransfer.getData(AGENT_CONVERSATION_TAB_DRAG_TYPE);
  if (!rawPayload) return null;

  try {
    const parsed = JSON.parse(rawPayload) as Partial<AgentConversationTabDragPayload>;
    if (parsed.kind !== "agent-conversation-tab") return null;
    const conversationId = typeof parsed.conversationId === "string" ? parsed.conversationId.trim() : "";
    if (!conversationId) return null;
    return { kind: "agent-conversation-tab", conversationId };
  } catch {
    return null;
  }
}

export function agentConversationTabDropPositionFromClientX(
  clientX: number,
  tabRect: Pick<DOMRectReadOnly, "left" | "width">,
): AgentConversationTabDropPosition {
  return clientX >= tabRect.left + tabRect.width / 2 ? "after" : "before";
}
