"use client";

import * as React from "react";
import type { HTMLAttributes } from "react";
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
  resizeHandleProps?: HTMLAttributes<HTMLDivElement> & {
    active?: boolean;
  };
  children: React.ReactNode;
}

export function AgentPanelShell({
  open,
  dockLayout,
  chrome,
  collapsed = false,
  panelRef,
  panelWidth,
  resizeHandleProps,
  children,
}: AgentPanelShellProps) {
  if (!open) return null;
  const resolvedChrome = chrome ?? (dockLayout ? "dock" : "floating");
  const { className: resizeHandleClassName, ...resolvedResizeHandleProps } = resizeHandleProps ?? {};

  return (
    <div
      ref={panelRef}
      className="ai-agent-panel"
      data-dock-layout={dockLayout ? "true" : "false"}
      data-chrome={resolvedChrome}
      data-collapsed={collapsed ? "true" : undefined}
      style={{ ["--ui-agent-panel-width" as string]: `${panelWidth}px` }}
    >
      {dockLayout && resizeHandleProps ? (
        <PanelResizeHandle
          className={["ai-agent-panel__resize-handle", resizeHandleClassName].filter(Boolean).join(" ")}
          side="left"
          {...resolvedResizeHandleProps}
        />
      ) : null}

      <div className="ai-agent-panel__body">{children}</div>
    </div>
  );
}
