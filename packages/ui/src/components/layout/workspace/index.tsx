import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

import { cn } from "../../../lib/cn";
import { Button, type ButtonProps } from "../../primitives";
import type { LayoutChrome } from "../chrome";
import type { OverlapPaneState } from "./resize";

export * from "./resize";

export type WorkspaceShellChrome = Extract<LayoutChrome, "workspace" | "immersive" | "canvas">;
export type WorkspaceShellSurface = "home" | "agent" | "project" | "resource" | "tool" | "canvas" | "settings";
export type MasterDetailChrome = "split" | "flush";
export type PanelResizeHandleSide = "left" | "right" | "top" | "bottom";
export type OverlapPaneSide = "left" | "right";
export type OverlapPaneElement = "section" | "main" | "aside" | "div";
export type OverlapPaneChrome = "plain" | "card";
export type OverlapPaneGroupElement = "section" | "main" | "aside" | "div";
export type OverlapPaneRevealAction = "show" | "restore";
export type OverlapPaneRevealPlacement = "center" | "top";

export function WorkspaceShell({
  sidebar,
  header,
  leftHeader,
  centerHeader,
  rightHeader,
  leftSlotStyle,
  rightSlotStyle,
  children,
  assistantPanel,
  terminalPanel,
  terminalOpen = Boolean(terminalPanel),
  terminalPlacement = "center",
  surface = "tool",
  chrome,
  layout,
  sidebarCollapsed = false,
  leftPaneHidden = false,
  rightPaneCollapsed = false,
}: {
  sidebar?: ReactNode;
  header?: ReactNode;
  leftHeader?: ReactNode;
  centerHeader?: ReactNode;
  rightHeader?: ReactNode;
  leftSlotStyle?: CSSProperties;
  rightSlotStyle?: CSSProperties;
  children: ReactNode;
  assistantPanel?: ReactNode;
  terminalPanel?: ReactNode;
  terminalOpen?: boolean;
  terminalPlacement?: "center" | "center-right";
  surface?: WorkspaceShellSurface;
  chrome?: WorkspaceShellChrome;
  layout?: "flush" | "stacked";
  sidebarCollapsed?: boolean;
  leftPaneHidden?: boolean;
  rightPaneCollapsed?: boolean;
}) {
  const resolvedChrome = chrome ?? workspaceShellChromeForSurface(surface);
  const resolvedLayout = layout ?? (surface === "canvas" ? "flush" : "stacked");
  const resolvedPaddingClassName = workspaceShellPaddingClassName(resolvedChrome);
  const frameChromeClassName = `app-content-frame--${resolvedChrome}`;
  const resolvedCenterHeader = centerHeader ?? header;
  const hasLeftSlot = Boolean(sidebar || leftHeader || leftPaneHidden);
  const hasRightSlot = Boolean(assistantPanel || rightHeader);
  const hasCenterRightSlotGroup = Boolean(terminalPanel && terminalPlacement === "center-right");
  const centerSlot = (
    <div
      className={cn("app-shell__slot app-shell__slot--center min-w-0 flex-1 overflow-hidden", resolvedPaddingClassName)}
      data-shell-slot="center"
      data-has-next-slot={hasRightSlot ? "true" : undefined}
      data-next-slot-collapsed={hasRightSlot && rightPaneCollapsed ? "true" : undefined}
      data-terminal-host={terminalPanel && terminalOpen && terminalPlacement === "center" ? terminalPlacement : undefined}
    >
      <div className={cn("app-content-frame h-full min-h-0 min-w-0 overflow-hidden", frameChromeClassName)}>
        <div className="app-content-frame__head-spacer">{resolvedCenterHeader}</div>
        <div className="app-content-frame__body">
          {children}
        </div>
        {terminalPanel && terminalPlacement === "center" ? (
          <div className="app-shell-terminal-region" data-open={terminalOpen ? "true" : "false"} data-placement={terminalPlacement}>
            {terminalPanel}
          </div>
        ) : null}
      </div>
    </div>
  );
  const rightSlot = hasRightSlot ? (
    <div
      className="app-shell__slot app-shell__slot--right app-shell-pane"
      data-shell-slot="right"
      data-collapsed={rightPaneCollapsed ? "true" : undefined}
      style={rightSlotStyle}
    >
      <div className="app-shell-pane__header">{rightHeader}</div>
      <div className="app-shell-pane__body">{assistantPanel}</div>
    </div>
  ) : null;
  const centerRightSlots = hasCenterRightSlotGroup ? (
    <div className="app-shell__slot-group app-shell__slot-group--center-right" data-terminal-host={terminalOpen ? "center-right" : undefined}>
      <div className="app-shell__slot-group-row">
        {centerSlot}
        {rightSlot}
      </div>
      <div className="app-shell-terminal-region" data-open={terminalOpen ? "true" : "false"} data-placement={terminalPlacement}>
        {terminalPanel}
      </div>
    </div>
  ) : (
    <>
      {centerSlot}
      {rightSlot}
    </>
  );

  return (
    <div
      className="app-shell fixed inset-0 flex flex-col overflow-hidden text-foreground"
      data-surface={surface}
      data-chrome={resolvedChrome}
      data-layout={resolvedLayout}
    >
      <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="app-shell__slots flex h-full min-h-0 min-w-0 overflow-hidden">
          {hasLeftSlot ? (
            <div
              className="app-shell__slot app-shell__slot--left app-shell-pane"
              data-shell-slot="left"
              data-has-next-slot="true"
              data-collapsed={sidebarCollapsed ? "true" : undefined}
              data-hidden={leftPaneHidden ? "true" : undefined}
              style={leftSlotStyle}
            >
              <div className="app-shell-pane__header">{leftHeader}</div>
              {sidebar ? <div className="app-shell-pane__body">{sidebar}</div> : null}
            </div>
          ) : null}
          {centerRightSlots}
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

export function OverlapPaneGroup({
  as = "div",
  overlapSide,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: OverlapPaneGroupElement;
  overlapSide?: OverlapPaneSide;
}) {
  const Component = as;

  return (
    <Component className={cn("overlap-pane-layout", className)} data-overlap-side={overlapSide} {...props}>
      {children}
    </Component>
  );
}

export function OverlapPane({
  as = "section",
  side = "left",
  overlapState = "default",
  resizeHandle,
  resizeHandleProps,
  resizeHandleSide,
  chrome = "plain",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: OverlapPaneElement;
  side?: OverlapPaneSide;
  overlapState?: OverlapPaneState;
  chrome?: OverlapPaneChrome;
  resizeHandle?: ReactNode;
  resizeHandleProps?: HTMLAttributes<HTMLDivElement> & {
    active?: boolean;
  };
  resizeHandleSide?: PanelResizeHandleSide;
}) {
  const Component = as;
  const { className: resizeHandleClassName, ...resolvedResizeHandleProps } = resizeHandleProps ?? {};
  const resolvedResizeHandleSide = resizeHandleSide ?? (side === "left" ? "left" : "right");

  return (
    <Component
      className={cn("overlap-pane", className)}
      data-overlap-side={side}
      data-overlap-state={overlapState === "default" ? undefined : overlapState}
      data-overlap-chrome={chrome === "plain" ? undefined : chrome}
      {...props}
    >
      {children}
      {resizeHandle ?? (resizeHandleProps ? (
        <PanelResizeHandle
          side={resolvedResizeHandleSide}
          className={resizeHandleClassName}
          {...resolvedResizeHandleProps}
        />
      ) : null)}
    </Component>
  );
}

export function OverlapPaneRevealButton({
  action,
  label,
  side = "right",
  placement = "top",
  className,
  type,
  title,
  "aria-label": ariaLabel,
  ...props
}: Omit<ButtonProps, "children" | "size" | "variant"> & {
  action: OverlapPaneRevealAction;
  label: string;
  side?: OverlapPaneSide;
  placement?: OverlapPaneRevealPlacement;
}) {
  const Icon = action === "show" ? PanelRightOpen : PanelRightClose;

  return (
    <Button
      type={type ?? "button"}
      variant="soft"
      size="icon-sm"
      className={cn(
        "overlap-pane-reveal-button",
        placement === "top" && "overlap-pane-reveal-button--top",
        `overlap-pane-reveal-button--${side}`,
        className,
      )}
      title={title ?? label}
      aria-label={ariaLabel ?? label}
      {...props}
    >
      <Icon size={14} />
    </Button>
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
