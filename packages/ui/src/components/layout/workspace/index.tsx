import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../lib/cn";
import type { LayoutChrome } from "../chrome";

export type WorkspaceShellChrome = Extract<LayoutChrome, "workspace" | "immersive" | "canvas">;
export type WorkspaceShellSurface = "agent" | "detail" | "canvas";
export type MasterDetailChrome = "split" | "flush";
export type PanelResizeHandleSide = "left" | "right";

export function WorkspaceShell({
  sidebar,
  header,
  leftHeader,
  centerHeader,
  rightHeader,
  rightSlotStyle,
  children,
  assistantPanel,
  surface = "detail",
  chrome,
  layout,
  sidebarCollapsed = false,
  leftPaneHidden = false,
}: {
  sidebar?: ReactNode;
  header?: ReactNode;
  leftHeader?: ReactNode;
  centerHeader?: ReactNode;
  rightHeader?: ReactNode;
  rightSlotStyle?: CSSProperties;
  children: ReactNode;
  assistantPanel?: ReactNode;
  surface?: WorkspaceShellSurface;
  chrome?: WorkspaceShellChrome;
  layout?: "flush" | "stacked";
  sidebarCollapsed?: boolean;
  leftPaneHidden?: boolean;
}) {
  const resolvedChrome = chrome ?? workspaceShellChromeForSurface(surface);
  const resolvedLayout = layout ?? (surface === "canvas" ? "flush" : "stacked");
  const resolvedPaddingClassName = workspaceShellPaddingClassName(resolvedChrome);
  const frameChromeClassName = `app-content-frame--${resolvedChrome}`;
  const resolvedCenterHeader = centerHeader ?? header;

  return (
    <div
      className="app-shell fixed inset-0 flex flex-col overflow-hidden text-foreground"
      data-surface={surface}
      data-chrome={resolvedChrome}
      data-layout={resolvedLayout}
    >
      <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="app-shell__slots flex h-full min-h-0 min-w-0 overflow-hidden">
          {sidebar || leftHeader ? (
            <div
              className="app-shell__slot app-shell__slot--left app-shell-pane"
              data-shell-slot="left"
              data-collapsed={sidebarCollapsed ? "true" : undefined}
              data-hidden={leftPaneHidden ? "true" : undefined}
            >
              <div className="app-shell-pane__header">{leftHeader}</div>
              {sidebar ? <div className="app-shell-pane__body">{sidebar}</div> : null}
            </div>
          ) : null}
          <div className={cn("app-shell__slot app-shell__slot--center min-w-0 flex-1 overflow-hidden", resolvedPaddingClassName)} data-shell-slot="center">
            <div className={cn("app-content-frame h-full min-h-0 min-w-0 overflow-hidden", frameChromeClassName)}>
              <div className="app-content-frame__head-spacer">{resolvedCenterHeader}</div>
              <div className="app-content-frame__body">
                {children}
              </div>
            </div>
          </div>
          {assistantPanel ? (
            <div className="app-shell__slot app-shell__slot--right app-shell-pane" data-shell-slot="right" style={rightSlotStyle}>
              <div className="app-shell-pane__header">{rightHeader}</div>
              <div className="app-shell-pane__body">{assistantPanel}</div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export function PanelResizeHandle({
  className,
  side = "right",
  active = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  side?: PanelResizeHandleSide;
  active?: boolean;
}) {
  return (
    <div
      className={cn("panel-resize-handle", `panel-resize-handle--${side}`, active && "panel-resize-handle--active", className)}
      {...props}
    />
  );
}

function workspaceShellChromeForSurface(surface: WorkspaceShellSurface): WorkspaceShellChrome {
  if (surface === "agent") return "immersive";
  if (surface === "canvas") return "canvas";
  return "workspace";
}

function workspaceShellPaddingClassName(chrome: WorkspaceShellChrome): string {
  return "p-0";
}

export function ContentWorkspaceLayout({
  header,
  overview,
  filters,
  list,
  preview,
  detail,
  upstream,
  downstream,
  bottom,
  listWidth = "360px",
  detailWidth = "minmax(0, 1fr)",
  className,
  flow = false,
}: {
  header?: ReactNode;
  overview: ReactNode;
  filters?: ReactNode;
  list: ReactNode;
  preview: ReactNode;
  detail: ReactNode;
  upstream: ReactNode;
  downstream: ReactNode;
  bottom?: ReactNode;
  listWidth?: string;
  detailWidth?: string;
  className?: string;
  flow?: boolean;
}) {
  const contentStyle = {
    "--ui-content-workspace-columns": `${listWidth} ${detailWidth}`,
  } as CSSProperties;

  return (
    <div className={cn("content-workspace-shell", className)} data-flow={flow ? "flow" : "contained"}>
      <div className="content-workspace-inner" style={contentStyle}>
        {header ? <section className="content-workspace-header">{header}</section> : null}
        <section className="content-workspace-overview">{overview}</section>
        {filters ? <section className="content-workspace-filters">{filters}</section> : null}
        <section className="content-workspace-core">
          <div className="content-workspace-column content-workspace-column--list">{list}</div>
          <div className="content-workspace-column content-workspace-column--detail">
            {detail}
            {preview}
          </div>
        </section>
        <section className="content-workspace-bottom">
          {bottom ?? (
            <div className="content-workspace-related-grid">
              <div className="content-workspace-related-column">{upstream}</div>
              <div className="content-workspace-related-column">{downstream}</div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function MasterDetail({
  list,
  detail,
  chrome = "split",
  listWidth = 288,
  className,
}: {
  list: ReactNode;
  detail: ReactNode;
  chrome?: MasterDetailChrome;
  listWidth?: number;
  className?: string;
}) {
  return (
    <div className={cn("master-detail-layout flex h-full overflow-hidden bg-background", className)} data-chrome={chrome}>
      <div style={{ width: listWidth }} className="master-detail-layout__list shrink-0 flex flex-col overflow-hidden bg-muted/50">
        {list}
      </div>
      <div className="master-detail-layout__detail flex-1 overflow-hidden">{detail}</div>
    </div>
  );
}

export function EmptyDetail({ message }: { message?: string }) {
  return <div className="h-full flex items-center justify-center text-muted-foreground type-body">{message ?? "Empty"}</div>;
}
