import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, HTMLAttributes, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { cn } from "../../../lib/cn";
import type { LayoutChrome } from "../chrome";

export type WorkspaceShellChrome = Extract<LayoutChrome, "workspace" | "immersive" | "canvas">;
export type WorkspaceShellSurface = "agent" | "detail" | "canvas";
export type MasterDetailChrome = "split" | "flush";
export type PanelResizeHandleSide = "left" | "right";
export type OverlapPaneSide = "left" | "right";
export type OverlapPaneElement = "section" | "main" | "aside" | "div";
export type OverlapPaneChrome = "edge" | "card";
export type OverlapPaneGroupElement = "section" | "main" | "aside" | "div";
export type OverlapPaneResizeEdge = "left" | "right";
export type OverlapPaneCollapseMode = "none" | "after-min";
export type OverlapPaneExpandMode = "none" | "after-max";
export type OverlapPaneSizeLimit = number | ((containerRect: DOMRectReadOnly) => number);

export interface ResizableOverlapPaneOptions {
  size: number;
  onSizeChange: (size: number) => void;
  minSize: number;
  maxSize: OverlapPaneSizeLimit;
  resizeEdge: OverlapPaneResizeEdge;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  collapseMode?: OverlapPaneCollapseMode;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  expandMode?: OverlapPaneExpandMode;
  keyboardStep?: number;
  keyboardLargeStep?: number;
  ariaLabel?: string;
  getContainer?: (handle: HTMLElement) => HTMLElement | null;
}

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
  surface = "detail",
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
              data-collapsed={sidebarCollapsed ? "true" : undefined}
              data-hidden={leftPaneHidden ? "true" : undefined}
              style={leftSlotStyle}
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
          {hasRightSlot ? (
            <div
              className="app-shell__slot app-shell__slot--right app-shell-pane"
              data-shell-slot="right"
              data-collapsed={rightPaneCollapsed ? "true" : undefined}
              style={rightSlotStyle}
            >
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

export function OverlapPaneGroup({
  as = "div",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: OverlapPaneGroupElement;
}) {
  const Component = as;

  return (
    <Component className={cn("overlap-pane-layout", className)} {...props}>
      {children}
    </Component>
  );
}

export function OverlapPane({
  as = "section",
  side = "left",
  chrome = "edge",
  resizeHandle,
  resizeHandleProps,
  resizeHandleSide,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: OverlapPaneElement;
  side?: OverlapPaneSide;
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
      data-overlap-chrome={chrome}
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

export function useResizableOverlapPane({
  size,
  onSizeChange,
  minSize,
  maxSize,
  resizeEdge,
  collapsed = false,
  onCollapsedChange,
  collapseMode = "none",
  expanded = false,
  onExpandedChange,
  expandMode = "none",
  keyboardStep = 12,
  keyboardLargeStep = 32,
  ariaLabel,
  getContainer = defaultOverlapPaneResizeContainer,
}: ResizableOverlapPaneOptions) {
  const resizeStart = useRef({ x: 0, size, maxSize: resolveOverlapPaneSizeLimit(maxSize) });
  const [resizing, setResizing] = useState(false);
  const ariaMaxSize = resolveOverlapPaneSizeLimit(maxSize);

  const applySize = useCallback((nextSize: number, startSize: number) => {
    const resolvedMaxSize = Math.max(minSize, resizeStart.current.maxSize);
    if (nextSize < minSize) {
      if (collapseMode === "after-min" && startSize <= minSize && onCollapsedChange) {
        onExpandedChange?.(false);
        onCollapsedChange(true);
        setResizing(false);
        return;
      }
      onExpandedChange?.(false);
      onSizeChange(minSize);
      return;
    }
    if (nextSize > resolvedMaxSize) {
      if (expanded) return;
      if (expandMode === "after-max" && startSize >= resolvedMaxSize && onExpandedChange) {
        onCollapsedChange?.(false);
        onExpandedChange(true);
        setResizing(false);
        return;
      }
      onSizeChange(resolvedMaxSize);
      return;
    }
    if (expanded) onExpandedChange?.(false);
    onCollapsedChange?.(false);
    onSizeChange(clampOverlapPaneSize(nextSize, minSize, resolvedMaxSize));
  }, [collapseMode, expandMode, expanded, minSize, onCollapsedChange, onExpandedChange, onSizeChange]);

  useEffect(() => {
    if (!resizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      const delta = resizeEdge === "right"
        ? event.clientX - resizeStart.current.x
        : resizeStart.current.x - event.clientX;
      applySize(resizeStart.current.size + delta, resizeStart.current.size);
    };
    const handlePointerUp = () => setResizing(false);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [applySize, resizeEdge, resizing]);

  const startResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (collapsed || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const handle = event.currentTarget;
    const rect = getContainer(handle)?.getBoundingClientRect();
    const startSize = expanded && rect ? Math.max(size, rect.width) : size;
    resizeStart.current = {
      x: event.clientX,
      size: startSize,
      maxSize: resolveOverlapPaneSizeLimit(maxSize, rect),
    };
    setResizing(true);
  }, [collapsed, expanded, getContainer, maxSize, size]);

  const adjustSize = useCallback((delta: number) => {
    if (collapsed) return;
    resizeStart.current = {
      x: 0,
      size,
      maxSize: resolveOverlapPaneSizeLimit(maxSize),
    };
    applySize(size + delta, size);
  }, [applySize, collapsed, maxSize, size]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();

    const step = event.shiftKey ? keyboardLargeStep : keyboardStep;
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const edgeMultiplier = resizeEdge === "right" ? 1 : -1;
    adjustSize(direction * edgeMultiplier * step);
  }, [adjustSize, keyboardLargeStep, keyboardStep, resizeEdge]);

  return {
    resizing,
    resizeHandleProps: {
      role: "separator",
      "aria-orientation": "vertical" as const,
      "aria-label": ariaLabel,
      "aria-valuemin": minSize,
      ...(Number.isFinite(ariaMaxSize) ? { "aria-valuemax": Math.max(minSize, ariaMaxSize) } : {}),
      "aria-valuenow": size,
      tabIndex: 0,
      active: resizing,
      onPointerDown: startResize,
      onKeyDown: handleKeyDown,
    },
  };
}

function defaultOverlapPaneResizeContainer(handle: HTMLElement): HTMLElement | null {
  return handle.closest(".overlap-pane-layout") as HTMLElement | null;
}

function resolveOverlapPaneSizeLimit(limit: OverlapPaneSizeLimit, containerRect?: DOMRectReadOnly | null): number {
  if (typeof limit === "number") return limit;
  if (containerRect) return limit(containerRect);
  return Number.POSITIVE_INFINITY;
}

function clampOverlapPaneSize(size: number, minSize: number, maxSize: number): number {
  return Math.min(Math.max(Math.round(size), minSize), maxSize);
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
