import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, HTMLAttributes, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

export type OverlapPaneState = "default" | "expanded";
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
  onSizeCommit?: (size: number) => void;
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
const RESIZABLE_PANEL_RESIZING_BODY_CLASS = "ui-resizable-panel-resizing";

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

  const setSize = useCallback((nextSize: number, persist = true) => {
    const clampedSize = clampStoredOverlapPaneSize(nextSize, minSize, maxSize);
    setSizeState(clampedSize);
    if (persist) writeStoredOverlapPaneSize(storageKey, clampedSize);
  }, [maxSize, minSize, storageKey]);
  const previewSize = useCallback((nextSize: number) => setSize(nextSize, false), [setSize]);
  const commitSize = useCallback((nextSize: number) => setSize(nextSize), [setSize]);

  const controller = useOverlapPaneController({
    ...controllerOptions,
    minSize,
    maxSize,
    size,
    onSizeChange: previewSize,
    onSizeCommit: commitSize,
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
  onSizeCommit,
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
  const currentSize = useRef(size);
  const onSizeChangeRef = useRef(onSizeChange);
  const onSizeCommitRef = useRef(onSizeCommit);
  const onCollapsedChangeRef = useRef(onCollapsedChange);
  const onExpandedChangeRef = useRef(onExpandedChange);
  const [resizing, setResizing] = useState(false);
  const ariaMinSize = resolvePanelSizeLimit(minSize);
  const ariaMaxSize = resolvePanelSizeLimit(maxSize);
  onSizeChangeRef.current = onSizeChange;
  onSizeCommitRef.current = onSizeCommit;
  onCollapsedChangeRef.current = onCollapsedChange;
  onExpandedChangeRef.current = onExpandedChange;

  const applySize = useCallback((nextSize: number, startSize: number) => {
    const resolvedMinSize = resizeStart.current.minSize;
    const resolvedMaxSize = Math.max(resolvedMinSize, resizeStart.current.maxSize);
    const onSizeChange = onSizeChangeRef.current;
    const onCollapsedChange = onCollapsedChangeRef.current;
    const onExpandedChange = onExpandedChangeRef.current;
    if (nextSize < resolvedMinSize) {
      if (collapseMode === "after-min" && startSize <= resolvedMinSize && onCollapsedChange) {
        onExpandedChange?.(false);
        onCollapsedChange(true);
        setResizing(false);
        return;
      }
      onExpandedChange?.(false);
      if (currentSize.current !== resolvedMinSize) {
        currentSize.current = resolvedMinSize;
        onSizeChange(resolvedMinSize);
      }
      return resolvedMinSize;
    }
    if (nextSize > resolvedMaxSize) {
      if (expanded) return;
      if (expandMode === "after-max" && onExpandedChange) {
        onCollapsedChange?.(false);
        onExpandedChange(true);
        setResizing(false);
        return;
      }
      if (currentSize.current !== resolvedMaxSize) {
        currentSize.current = resolvedMaxSize;
        onSizeChange(resolvedMaxSize);
      }
      return resolvedMaxSize;
    }
    if (expanded) onExpandedChange?.(false);
    onCollapsedChange?.(false);
    const clampedSize = clampPanelSize(nextSize, resolvedMinSize, resolvedMaxSize);
    if (currentSize.current !== clampedSize) {
      currentSize.current = clampedSize;
      onSizeChange(clampedSize);
    }
    return clampedSize;
  }, [collapseMode, expandMode, expanded]);

  useEffect(() => {
    if (!resizing) currentSize.current = size;
  }, [resizing, size]);

  useEffect(() => {
    if (!resizing) return;

    let resizeFrame: number | null = null;
    let pendingPointerCoordinate = resizeStart.current.coordinate;
    const applyPendingPointerMove = () => {
      resizeFrame = null;
      const delta = resizablePanelPointerDelta(pendingPointerCoordinate, resizeStart.current.coordinate, resizeEdge);
      applySize(resizeStart.current.size + delta, resizeStart.current.size);
    };
    const handlePointerMove = (event: PointerEvent) => {
      pendingPointerCoordinate = resizablePanelPointerCoordinate(event, resizeEdge);
      if (resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(applyPendingPointerMove);
    };
    const handlePointerUp = () => {
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
        applyPendingPointerMove();
      }
      onSizeCommitRef.current?.(currentSize.current);
      setResizing(false);
    };
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    const standardResizingBodyClassNames = resizablePanelBodyClassNames(resizeEdge);
    document.body.classList.add(...standardResizingBodyClassNames);
    if (resizingBodyClassNames.length > 0) document.body.classList.add(...resizingBodyClassNames);
    document.body.style.cursor = resizablePanelCursor(resizeEdge);
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      document.body.classList.remove(...standardResizingBodyClassNames);
      if (resizingBodyClassNames.length > 0) document.body.classList.remove(...resizingBodyClassNames);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
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
    const committedSize = applySize(size + delta, size);
    if (committedSize !== undefined) onSizeCommitRef.current?.(committedSize);
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

function resizablePanelBodyClassNames(edge: ResizablePanelEdge): string[] {
  const axis = edge === "top" || edge === "bottom" ? "y" : "x";
  return [
    RESIZABLE_PANEL_RESIZING_BODY_CLASS,
    `${RESIZABLE_PANEL_RESIZING_BODY_CLASS}--${axis}`,
    `${RESIZABLE_PANEL_RESIZING_BODY_CLASS}--${edge}`,
  ];
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
