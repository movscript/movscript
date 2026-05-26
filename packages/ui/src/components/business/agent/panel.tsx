"use client";

import * as React from "react";

export interface AgentPanelShellProps {
  open: boolean;
  dockLayout: boolean;
  panelRef: React.Ref<HTMLDivElement>;
  panelWidth: number;
  onResizeStart: React.PointerEventHandler<HTMLDivElement>;
  children: React.ReactNode;
}

export function AgentPanelShell({
  open,
  dockLayout,
  panelRef,
  panelWidth,
  onResizeStart,
  children,
}: AgentPanelShellProps) {
  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="ai-agent-panel"
      data-dock-layout={dockLayout ? "true" : "false"}
      style={{ ["--ui-agent-panel-width" as string]: `${panelWidth}px` }}
    >
      {dockLayout && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize assistant panel"
          className="ai-agent-panel__resize-handle"
          onPointerDown={onResizeStart}
        >
          <div className="ai-agent-panel__resize-grip" />
        </div>
      )}

      <div className="ai-agent-panel__body">{children}</div>
    </div>
  );
}
