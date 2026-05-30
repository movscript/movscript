import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, HTMLAttributes, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

import { cn } from "../../../lib/cn";
import { Button, type ButtonProps } from "../../primitives";
import type { LayoutChrome } from "../chrome";

export type WorkspaceShellChrome = Extract<LayoutChrome, "workspace" | "immersive" | "canvas">;
export type WorkspaceShellSurface = "agent" | "detail" | "canvas";
export type MasterDetailChrome = "split" | "flush";
export type PanelResizeHandleSide = "left" | "right";
export type OverlapPaneSide = "left" | "right";
export type OverlapPaneElement = "section" | "main" | "aside" | "div";
export type OverlapPaneState = "default" | "expanded";
export type OverlapPaneChrome = "plain" | "card";
export type OverlapPaneGroupElement = "section" | "main" | "aside" | "div";
export type OverlapPaneRevealAction = "show" | "restore";
export type OverlapPaneRevealPlacement = "center" | "top";
export type OverlapPaneResizeEdge = "left" | "right";
export type OverlapPaneCollapseMode = "none" | "after-min";
export type OverlapPaneExpandMode = "none" | "after-max";
export type OverlapPaneSizeLimit = number | ((containerRect: DOMRectReadOnly) => number);
export type ResizablePanelEdge = "left" | "right" | "top" | "bottom";
export type ResizablePanelCollapseMode = "none" | "after-min";
export type ResizablePanelExpandMode = "none" | "after-max";
export type ResizablePanelSizeLimit = number | ((containerRect: DOMRectReadOnly) => number);

export interface ResizablePanelOptions {
  size: number;
  onSizeChange: (size: number) => void;
  minSize: ResizablePanelSizeLimit;
  maxSize: ResizablePanelSizeLimit;
  resizeEdge: ResizablePanelEdge;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  collapseMode?: ResizablePanelCollapseMode;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  expandMode?: ResizablePanelExpandMode;
  keyboardStep?: number;
  keyboardLargeStep?: number;
  ariaLabel?: string;
  getContainer?: (handle: HTMLElement) => HTMLElement | null;
  resizingBodyClassNames?: string[];
}

export interface ResizablePanelState {
  resizing: boolean;
  resizeHandleProps: HTMLAttributes<HTMLDivElement> & {
    active: boolean;
  };
}

export interface ResizableOverlapPaneOptions extends ResizablePanelOptions {
  maxSize: OverlapPaneSizeLimit;
  resizeEdge: OverlapPaneResizeEdge;
  collapseMode?: OverlapPaneCollapseMode;
  expandMode?: OverlapPaneExpandMode;
}

export interface ResizableOverlapPaneState extends ResizablePanelState {}

export interface OverlapPaneDisclosureOptions {
  defaultCollapsed?: boolean;
  defaultExpanded?: boolean;
}

export interface OverlapPaneDisclosureState {
  collapsed: boolean;
  expanded: boolean;
  setCollapsed: (collapsed: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  collapse: () => void;
  show: () => void;
  restore: () => void;
  overlapState: OverlapPaneState | undefined;
  collapsedDataAttribute: "true" | undefined;
  expandedDataAttribute: "true" | undefined;
}

export interface OverlapPaneControllerOptions
  extends OverlapPaneDisclosureOptions,
    Omit<ResizableOverlapPaneOptions, "collapsed" | "onCollapsedChange" | "expanded" | "onExpandedChange"> {}

export interface OverlapPaneControllerState extends OverlapPaneDisclosureState, ResizableOverlapPaneState {}

export interface PersistentOverlapPaneControllerOptions
  extends OverlapPaneDisclosureOptions,
    Omit<ResizableOverlapPaneOptions, "size" | "onSizeChange" | "collapsed" | "onCollapsedChange" | "expanded" | "onExpandedChange"> {
  defaultSize: number;
  storageKey?: string;
  sizeVariableName?: `--${string}`;
}

export interface OverlapPaneGroupGeometryProps extends HTMLAttributes<HTMLElement> {
  "data-overlap-pane-collapsed": "true" | undefined;
  "data-overlap-pane-expanded": "true" | undefined;
  "data-overlap-pane-resized": "true" | undefined;
  style: CSSProperties;
}

export interface PersistentOverlapPaneControllerState extends OverlapPaneControllerState {
  size: number;
  setSize: (size: number) => void;
  groupProps: OverlapPaneGroupGeometryProps;
}

const EMPTY_RESIZING_BODY_CLASS_NAMES: string[] = [];

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

export function useOverlapPaneDisclosure({
  defaultCollapsed = false,
  defaultExpanded = false,
}: OverlapPaneDisclosureOptions = {}): OverlapPaneDisclosureState {
  const [collapsed, setCollapsedState] = useState(defaultCollapsed);
  const [expanded, setExpandedState] = useState(defaultExpanded);

  const setCollapsed = useCallback((nextCollapsed: boolean) => {
    if (nextCollapsed) setExpandedState(false);
    setCollapsedState(nextCollapsed);
  }, []);

  const setExpanded = useCallback((nextExpanded: boolean) => {
    if (nextExpanded) setCollapsedState(false);
    setExpandedState(nextExpanded);
  }, []);

  const collapse = useCallback(() => {
    setExpandedState(false);
    setCollapsedState(true);
  }, []);

  const show = useCallback(() => {
    setExpandedState(false);
    setCollapsedState(false);
  }, []);

  const restore = useCallback(() => setExpandedState(false), []);

  return {
    collapsed,
    expanded,
    setCollapsed,
    setExpanded,
    collapse,
    show,
    restore,
    overlapState: expanded ? "expanded" : undefined,
    collapsedDataAttribute: collapsed ? "true" : undefined,
    expandedDataAttribute: expanded ? "true" : undefined,
  };
}

export function useOverlapPaneController({
  defaultCollapsed,
  defaultExpanded,
  ...resizeOptions
}: OverlapPaneControllerOptions): OverlapPaneControllerState {
  const disclosure = useOverlapPaneDisclosure({ defaultCollapsed, defaultExpanded });
  const resize = useResizableOverlapPane({
    ...resizeOptions,
    collapsed: disclosure.collapsed,
    onCollapsedChange: disclosure.setCollapsed,
    expanded: disclosure.expanded,
    onExpandedChange: disclosure.setExpanded,
  });

  return {
    ...disclosure,
    ...resize,
  };
}

export function usePersistentOverlapPaneController({
  defaultSize,
  storageKey,
  sizeVariableName = "--overlap-pane-size",
  minSize,
  maxSize,
  ...controllerOptions
}: PersistentOverlapPaneControllerOptions): PersistentOverlapPaneControllerState {
  const [size, setSizeState] = useState(() => readStoredOverlapPaneSize(storageKey, defaultSize, minSize, maxSize));

  const setSize = useCallback((nextSize: number) => {
    const clampedSize = clampStoredOverlapPaneSize(nextSize, minSize, maxSize);
    setSizeState(clampedSize);
    writeStoredOverlapPaneSize(storageKey, clampedSize);
  }, [maxSize, minSize, storageKey]);

  const controller = useOverlapPaneController({
    ...controllerOptions,
    minSize,
    maxSize,
    size,
    onSizeChange: setSize,
  });

  return {
    ...controller,
    size,
    setSize,
    groupProps: {
      "data-overlap-pane-collapsed": controller.collapsedDataAttribute,
      "data-overlap-pane-expanded": controller.expandedDataAttribute,
      "data-overlap-pane-resized": size !== defaultSize ? "true" : undefined,
      style: { [sizeVariableName]: `${size}px` } as CSSProperties,
    },
  };
}

export function useResizableOverlapPane({
  getContainer = defaultOverlapPaneResizeContainer,
  ...options
}: ResizableOverlapPaneOptions): ResizableOverlapPaneState {
  return useResizablePanel({
    ...options,
    getContainer,
  });
}

export function useResizablePanel({
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
  getContainer,
  resizingBodyClassNames = EMPTY_RESIZING_BODY_CLASS_NAMES,
}: ResizablePanelOptions): ResizablePanelState {
  const resizeStart = useRef({
    coordinate: 0,
    size,
    minSize: resolvePanelSizeLimit(minSize),
    maxSize: resolvePanelSizeLimit(maxSize),
  });
  const [resizing, setResizing] = useState(false);
  const ariaMinSize = resolvePanelSizeLimit(minSize);
  const ariaMaxSize = resolvePanelSizeLimit(maxSize);

  const applySize = useCallback((nextSize: number, startSize: number) => {
    const resolvedMinSize = resizeStart.current.minSize;
    const resolvedMaxSize = Math.max(resolvedMinSize, resizeStart.current.maxSize);
    if (nextSize < resolvedMinSize) {
      if (collapseMode === "after-min" && startSize <= resolvedMinSize && onCollapsedChange) {
        onExpandedChange?.(false);
        onCollapsedChange(true);
        setResizing(false);
        return;
      }
      onExpandedChange?.(false);
      onSizeChange(resolvedMinSize);
      return;
    }
    if (nextSize > resolvedMaxSize) {
      if (expanded) return;
      if (expandMode === "after-max" && onExpandedChange) {
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
    onSizeChange(clampPanelSize(nextSize, resolvedMinSize, resolvedMaxSize));
  }, [collapseMode, expandMode, expanded, onCollapsedChange, onExpandedChange, onSizeChange]);

  useEffect(() => {
    if (!resizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      const pointerCoordinate = resizablePanelPointerCoordinate(event, resizeEdge);
      const delta = resizablePanelPointerDelta(pointerCoordinate, resizeStart.current.coordinate, resizeEdge);
      applySize(resizeStart.current.size + delta, resizeStart.current.size);
    };
    const handlePointerUp = () => setResizing(false);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    if (resizingBodyClassNames.length > 0) document.body.classList.add(...resizingBodyClassNames);
    document.body.style.cursor = resizablePanelCursor(resizeEdge);
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      if (resizingBodyClassNames.length > 0) document.body.classList.remove(...resizingBodyClassNames);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [applySize, resizeEdge, resizing, resizingBodyClassNames]);

  const startResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (collapsed || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const handle = event.currentTarget;
    const rect = getContainer?.(handle)?.getBoundingClientRect();
    const resolvedMinSize = resolvePanelSizeLimit(minSize, rect);
    const resolvedMaxSize = Math.max(resolvedMinSize, resolvePanelSizeLimit(maxSize, rect));
    const startSize = expanded && rect
      ? Math.max(size, resizablePanelContainerSize(rect, resizeEdge))
      : clampPanelSize(size, resolvedMinSize, resolvedMaxSize);
    resizeStart.current = {
      coordinate: resizablePanelPointerCoordinate(event, resizeEdge),
      size: startSize,
      minSize: resolvedMinSize,
      maxSize: resolvedMaxSize,
    };
    setResizing(true);
  }, [collapsed, expanded, getContainer, maxSize, minSize, resizeEdge, size]);

  const adjustSize = useCallback((delta: number) => {
    if (collapsed) return;
    const resolvedMinSize = resolvePanelSizeLimit(minSize);
    resizeStart.current = {
      coordinate: 0,
      size,
      minSize: resolvedMinSize,
      maxSize: resolvePanelSizeLimit(maxSize),
    };
    applySize(size + delta, size);
  }, [applySize, collapsed, maxSize, minSize, size]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!resizablePanelKeyboardKeys(resizeEdge).includes(event.key)) return;
    event.preventDefault();

    const step = event.shiftKey ? keyboardLargeStep : keyboardStep;
    adjustSize(resizablePanelKeyboardDirection(event.key, resizeEdge) * step);
  }, [adjustSize, keyboardLargeStep, keyboardStep, resizeEdge]);

  return {
    resizing,
    resizeHandleProps: {
      role: "separator",
      "aria-orientation": resizablePanelAriaOrientation(resizeEdge),
      "aria-label": ariaLabel,
      ...(Number.isFinite(ariaMinSize) ? { "aria-valuemin": ariaMinSize } : {}),
      ...(Number.isFinite(ariaMaxSize) ? { "aria-valuemax": Math.max(Number.isFinite(ariaMinSize) ? ariaMinSize : 0, ariaMaxSize) } : {}),
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

function resolvePanelSizeLimit(limit: ResizablePanelSizeLimit, containerRect?: DOMRectReadOnly | null): number {
  if (typeof limit === "number") return limit;
  if (containerRect) return limit(containerRect);
  return Number.POSITIVE_INFINITY;
}

function clampPanelSize(size: number, minSize: number, maxSize: number): number {
  return Math.min(Math.max(Math.round(size), minSize), maxSize);
}

function readStoredOverlapPaneSize(
  storageKey: string | undefined,
  defaultSize: number,
  minSize: ResizablePanelSizeLimit,
  maxSize: ResizablePanelSizeLimit,
): number {
  if (!storageKey || typeof window === "undefined") return clampStoredOverlapPaneSize(defaultSize, minSize, maxSize);
  try {
    const storedSize = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(storedSize)
      ? clampStoredOverlapPaneSize(storedSize, minSize, maxSize)
      : clampStoredOverlapPaneSize(defaultSize, minSize, maxSize);
  } catch {
    return clampStoredOverlapPaneSize(defaultSize, minSize, maxSize);
  }
}

function writeStoredOverlapPaneSize(storageKey: string | undefined, size: number): void {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, String(size));
  } catch {
    // Storage can be unavailable in private browsing or restricted embeds.
  }
}

function clampStoredOverlapPaneSize(
  size: number,
  minSize: ResizablePanelSizeLimit,
  maxSize: ResizablePanelSizeLimit,
): number {
  const resolvedMinSize = resolveInitialStoredOverlapPaneLimit(minSize, 0);
  const resolvedMaxSize = resolveInitialStoredOverlapPaneLimit(maxSize, Number.POSITIVE_INFINITY);
  return clampPanelSize(size, resolvedMinSize, Math.max(resolvedMinSize, resolvedMaxSize));
}

function resolveInitialStoredOverlapPaneLimit(limit: ResizablePanelSizeLimit, fallback: number): number {
  return typeof limit === "number" && Number.isFinite(limit) ? limit : fallback;
}

function resizablePanelPointerCoordinate(event: Pick<PointerEvent | ReactPointerEvent<HTMLDivElement>, "clientX" | "clientY">, edge: ResizablePanelEdge): number {
  return edge === "top" || edge === "bottom" ? event.clientY : event.clientX;
}

function resizablePanelPointerDelta(pointerCoordinate: number, startCoordinate: number, edge: ResizablePanelEdge): number {
  if (edge === "right" || edge === "bottom") return pointerCoordinate - startCoordinate;
  return startCoordinate - pointerCoordinate;
}

function resizablePanelContainerSize(rect: DOMRectReadOnly, edge: ResizablePanelEdge): number {
  return edge === "top" || edge === "bottom" ? rect.height : rect.width;
}

function resizablePanelCursor(edge: ResizablePanelEdge): string {
  return edge === "top" || edge === "bottom" ? "row-resize" : "col-resize";
}

function resizablePanelAriaOrientation(edge: ResizablePanelEdge): "horizontal" | "vertical" {
  return edge === "top" || edge === "bottom" ? "horizontal" : "vertical";
}

function resizablePanelKeyboardKeys(edge: ResizablePanelEdge): string[] {
  return edge === "top" || edge === "bottom" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
}

function resizablePanelKeyboardDirection(key: string, edge: ResizablePanelEdge): number {
  if (edge === "right") return key === "ArrowRight" ? 1 : -1;
  if (edge === "left") return key === "ArrowLeft" ? 1 : -1;
  if (edge === "bottom") return key === "ArrowDown" ? 1 : -1;
  return key === "ArrowUp" ? 1 : -1;
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
