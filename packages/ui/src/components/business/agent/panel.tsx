"use client";

import * as React from "react";
import type { LayoutChrome } from "../../layout/chrome";
import { PanelResizeHandle } from "../../layout/workspace";

export type AgentPanelChrome = Extract<LayoutChrome, "dock" | "floating">;

export interface AgentPanelShellProps {
  open: boolean;
  dockLayout: boolean;
  chrome?: AgentPanelChrome;
  collapsed?: boolean;
  panelRef: React.Ref<HTMLDivElement>;
  panelWidth: number;
  onResizeStart: React.PointerEventHandler<HTMLDivElement>;
  children: React.ReactNode;
}

export function AgentPanelShell({
  open,
  dockLayout,
  chrome,
  collapsed = false,
  panelRef,
  panelWidth,
  onResizeStart,
  children,
}: AgentPanelShellProps) {
  if (!open) return null;
  const resolvedChrome = chrome ?? (dockLayout ? "dock" : "floating");

  return (
    <div
      ref={panelRef}
      className="ai-agent-panel"
      data-dock-layout={dockLayout ? "true" : "false"}
      data-chrome={resolvedChrome}
      data-collapsed={collapsed ? "true" : undefined}
      style={{ ["--ui-agent-panel-width" as string]: `${panelWidth}px` }}
    >
      {dockLayout && (
        <PanelResizeHandle
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize assistant panel"
          className="ai-agent-panel__resize-handle"
          side="left"
          onPointerDown={onResizeStart}
        />
      )}

      <div className="ai-agent-panel__body">{children}</div>
    </div>
  );
}
