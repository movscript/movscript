export type RouteLayoutKind = "page" | "redirect" | "overlay-action" | "runtime";
export type RouteLayoutSurface = "home" | "tool" | "project" | "resource" | "agent" | "canvas" | "settings";
export type RouteLayoutChrome = "home" | "tool" | "project" | "resource" | "agent" | "canvas" | "settings";
export type RouteScrollMode = "document" | "workspace" | "canvas" | "hidden";
export type RouteShellLayout = "flush" | "stacked";
export type RouteLayoutPaneSide = "left" | "right" | "top" | "bottom";
export type RouteLayoutPaneState = "default" | "collapsed" | "expanded" | "hidden";
export type RouteLayoutOverlapMode = "none" | "offset-stack" | "pane-surface" | "overlay";
export type RouteLayoutViewportScroll = "auto" | "owned" | "hidden";
export type RouteLayoutPaneSizeLimit = number | ((containerRect: DOMRectReadOnly) => number);
export type RouteLayoutPaneCollapseMode = "button" | "after-min" | "none";
export type RouteLayoutPaneExpandMode = "button" | "after-max" | "none";

export interface RouteLayoutPaneSpec {
  id: string;
  side: RouteLayoutPaneSide;
  owner: "app-shell" | "workbench" | "canvas" | "dialog";
  defaultSize?: number;
  minSize?: RouteLayoutPaneSizeLimit;
  maxSize?: RouteLayoutPaneSizeLimit;
  collapsedSize?: number;
  defaultState?: RouteLayoutPaneState;
  allowedStates?: RouteLayoutPaneState[];
  storageKey?: string;
  stateStorageKey?: string;
  persistState?: boolean;
  collapsible?: boolean;
  expandable?: boolean;
  collapseMode?: RouteLayoutPaneCollapseMode;
  expandMode?: RouteLayoutPaneExpandMode;
  overlapMode?: RouteLayoutOverlapMode;
}

export interface RouteLayoutSpec {
  routeId: string;
  pathnamePattern: string;
  kind: RouteLayoutKind;
  surface: RouteLayoutSurface;
  chrome?: RouteLayoutChrome;
  preserveWorkMode?: boolean;
  scrollMode: RouteScrollMode;
  shellLayout: RouteShellLayout;
  contentWidth?: "narrow" | "normal" | "wide" | "xwide" | "full";
  projectEntryId?: "project_standards" | "orchestration_production" | "content_canvas" | "content_preview" | "content";
  panes: RouteLayoutPaneSpec[];
  notes?: string;
}

export function appRouteViewportScrollForMode(scrollMode: RouteScrollMode): RouteLayoutViewportScroll {
  if (scrollMode === "hidden") return "hidden";
  if (scrollMode === "workspace" || scrollMode === "canvas") return "owned";
  return "auto";
}
