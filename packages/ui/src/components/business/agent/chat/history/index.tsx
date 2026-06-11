import type { CSSProperties, HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";

export interface AgentConversationHistoryPanelProps extends HTMLAttributes<HTMLElement> {
  height?: number | null;
}

export function AgentConversationHistoryPanel({
  className,
  height,
  style,
  ...props
}: AgentConversationHistoryPanelProps) {
  const resolvedStyle =
    height === undefined || height === null
      ? style
      : ({ ...style, flexBasis: height } satisfies CSSProperties);

  return (
    <section
      className={cn("ai-agent-panel-empty-history", className)}
      style={resolvedStyle}
      {...props}
    />
  );
}
