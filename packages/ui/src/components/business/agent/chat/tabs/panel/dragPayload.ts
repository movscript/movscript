export const AGENT_CONVERSATION_TAB_DRAG_TYPE = "application/x-movscript-agent-conversation-tab";

export type AgentConversationTabDropPosition = "before" | "after";

export interface AgentConversationTabClientPoint {
  x: number;
}

export interface AgentConversationTabPointerEvent {
  clientX: number;
}

export interface AgentConversationTabDragPayload {
  kind: "agent-conversation-tab";
  conversationId: string;
}

export interface AgentConversationTabDataTransfer {
  setData(type: string, data: string): void;
  getData(type: string): string;
  effectAllowed?: string;
  dropEffect?: string;
}

export interface AgentConversationTabDropTarget {
  conversationId: string;
  position: AgentConversationTabDropPosition;
}

export function writeAgentConversationTabDragPayload(
  dataTransfer: Pick<AgentConversationTabDataTransfer, "setData">,
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
  dataTransfer: Pick<AgentConversationTabDataTransfer, "getData">,
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

export function startAgentConversationTabDrag(
  dataTransfer: Pick<AgentConversationTabDataTransfer, "effectAllowed" | "setData">,
  conversationId: string,
) {
  const trimmedConversationId = conversationId.trim();
  if (!trimmedConversationId) return false;
  dataTransfer.effectAllowed = "move";
  writeAgentConversationTabDragPayload(dataTransfer, trimmedConversationId);
  return true;
}

export function resolveAgentConversationTabDragOver({
  dataTransfer,
  draggingConversationId,
  targetConversationId,
  point,
  tabElement,
}: {
  dataTransfer: Pick<AgentConversationTabDataTransfer, "dropEffect" | "getData">;
  draggingConversationId?: string | null;
  targetConversationId: string;
  point: AgentConversationTabClientPoint;
  tabElement: Pick<HTMLElement, "getBoundingClientRect">;
}): AgentConversationTabDropTarget | null {
  const draggedConversationId = resolveAgentConversationTabDraggedId(dataTransfer, draggingConversationId);
  if (!draggedConversationId || draggedConversationId === targetConversationId) return null;
  dataTransfer.dropEffect = "move";
  return {
    conversationId: targetConversationId,
    position: agentConversationTabDropPositionFromClientPoint(point, tabElement),
  };
}

export function resolveAgentConversationTabDrop({
  dataTransfer,
  draggingConversationId,
  targetConversationId,
  point,
  tabElement,
}: {
  dataTransfer: Pick<AgentConversationTabDataTransfer, "getData">;
  draggingConversationId?: string | null;
  targetConversationId: string;
  point: AgentConversationTabClientPoint;
  tabElement: Pick<HTMLElement, "getBoundingClientRect">;
}) {
  const draggedConversationId = resolveAgentConversationTabDraggedId(dataTransfer, draggingConversationId);
  if (!draggedConversationId || draggedConversationId === targetConversationId) return null;
  return {
    draggedConversationId,
    targetConversationId,
    position: agentConversationTabDropPositionFromClientPoint(point, tabElement),
  };
}

export function agentConversationTabDropPositionFromClientX(
  clientX: number,
  tabRect: Pick<DOMRectReadOnly, "left" | "width">,
): AgentConversationTabDropPosition {
  return clientX >= tabRect.left + tabRect.width / 2 ? "after" : "before";
}

export function agentConversationTabClientPointFromEvent(
  event: AgentConversationTabPointerEvent,
): AgentConversationTabClientPoint {
  return { x: event.clientX };
}

export function agentConversationTabDropPositionFromClientPoint(
  point: AgentConversationTabClientPoint,
  tabElement: Pick<HTMLElement, "getBoundingClientRect">,
): AgentConversationTabDropPosition {
  return agentConversationTabDropPositionFromClientX(point.x, tabElement.getBoundingClientRect());
}

function resolveAgentConversationTabDraggedId(
  dataTransfer: Pick<AgentConversationTabDataTransfer, "getData">,
  draggingConversationId?: string | null,
) {
  return draggingConversationId?.trim() || readAgentConversationTabDragPayload(dataTransfer)?.conversationId || null;
}
