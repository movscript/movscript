import type { ButtonHTMLAttributes, ComponentProps, HTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import { cn } from "../../../../lib/cn";
import { Badge, Button, Input, SelectTrigger, StatusBadge, type BadgeProps, type ButtonProps, type InputProps, type StatusBadgeProps } from "../../../primitives";
import { AppPageShell, AppPageShellBody, AppPageShellHeader } from "../../../layout";
import { AppCodeBlock } from "../../app";
import type { IconComponent } from "../../../primitives/types";
import { AgentSurfaceBlock } from "../surface-block";
import { AgentRunCallout, AgentRunToneSurfaceBlock, type AgentRunTone } from "../run/feedback";

export function AgentPageShell({
  className,
  ...props
}: Omit<ComponentProps<typeof AppPageShell>, "chrome">) {
  return <AppPageShell chrome="immersive" className={cn("agent-page-shell", className)} {...props} />;
}

export function AgentPageShellHeader(props: ComponentProps<typeof AppPageShellHeader>) {
  return <AppPageShellHeader {...props} />;
}

export function AgentPageShellBody(props: ComponentProps<typeof AppPageShellBody>) {
  return <AppPageShellBody {...props} />;
}

export function AgentRunPageHeader(props: ComponentProps<typeof AppPageShellHeader>) {
  return <AgentPageShellHeader {...props} />;
}

export function AgentRunPageHeaderContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-page-header", className)} {...props} />;
}

export function AgentRunPageHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-page-header__copy", className)} {...props} />;
}

export function AgentRunPageTitleRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-page-header__title-row", className)} {...props} />;
}

export function AgentRunPageTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("agent-run-page-header__title", className)} {...props} />;
}

export function AgentRunPageIdentifier({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-run-page-header__identifier", className)} {...props} />;
}

export function AgentRunPageHeaderActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-page-header__actions", className)} {...props} />;
}

export function AgentRunPageActionButton({ className, ...props }: ButtonProps) {
  return <Button size="sm" className={cn("agent-run-page-action", className)} {...props} />;
}

export function AgentRunPageBadge({ className, ...props }: BadgeProps) {
  return <Badge className={cn("agent-run-page-badge", className)} {...props} />;
}

export function AgentRunTraceStatusBadge({ className, ...props }: StatusBadgeProps) {
  return <StatusBadge className={cn("agent-run-trace-status-badge", className)} {...props} />;
}

export function AgentRunPageBody({
  className,
  ...props
}: Omit<ComponentProps<typeof AppPageShellBody>, "padding" | "scroll">) {
  return <AgentPageShellBody padding="none" scroll="responsive-split" className={cn("agent-run-page-body", className)} {...props} />;
}

export function AgentRunPageSidebar({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn("agent-run-page-sidebar", className)} {...props} />;
}

export function AgentRunPageMain({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("agent-run-page-main", className)} {...props} />;
}

export function AgentWorkspacesPageBody({
  className,
  ...props
}: Omit<ComponentProps<typeof AppPageShellBody>, "padding" | "scroll">) {
  return <AgentPageShellBody padding="none" scroll="responsive-split" className={cn("agent-workspaces-page-body", className)} {...props} />;
}

export function AgentWorkspacesPageSidebar({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn("agent-workspaces-page-sidebar", className)} {...props} />;
}

export function AgentWorkspacesPageSidebarControls({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspaces-page-sidebar__controls", className)} {...props} />;
}

export function AgentWorkspaceSidebarPathRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-sidebar-path-row", className)} {...props} />;
}

export function AgentWorkspaceSidebarPathText({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-sidebar-path-text", className)} {...props} />;
}

export function AgentWorkspacesPageList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspaces-page-list", className)} {...props} />;
}

export function AgentWorkspaceListStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-list-stack", className)} {...props} />;
}

export function AgentWorkspacesPageMain({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <main className={cn("agent-workspaces-page-main", className)} {...props} />;
}

export function AgentWorkspacesPageFullMain({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <AgentWorkspacesPageMain className={cn("agent-workspaces-page-main--full", className)} {...props} />;
}

export function AgentWorkspaceEditorLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-editor-layout", className)} {...props} />;
}

export function AgentWorkspaceEditorHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-editor-header", className)} {...props} />;
}

export function AgentWorkspaceEditorTitleBlock({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-editor-title-block", className)} {...props} />;
}

export function AgentWorkspaceEditorTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-editor-title", className)} {...props} />;
}

export function AgentWorkspaceEditorSubtitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-editor-subtitle", className)} {...props} />;
}

export function AgentWorkspaceEditorActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-editor-actions", className)} {...props} />;
}

export function AgentWorkspaceEditorBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-editor-body", className)} {...props} />;
}

export function AgentWorkspaceEditorFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-editor-footer", className)} {...props} />;
}

export function AgentWorkspaceEditorTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("agent-workspace-editor-textarea", className)} {...props} />;
}

export function AgentWorkspaceReviewSummaryPane({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <AgentWorkspacesPageSidebar className={cn("agent-workspace-review-summary-pane", className)} {...props} />;
}

export function AgentWorkspaceReviewRawPane({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <AgentWorkspacesPageMain className={cn("agent-workspace-review-raw-pane", className)} {...props} />;
}

export function AgentWorkspaceReviewTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("agent-workspace-review-textarea", className)} {...props} />;
}

export function AgentWorkspaceReviewPaneTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-review-pane-title", className)} {...props} />;
}

export function AgentWorkspaceReviewJsonBlock({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-review-json-block", className)} {...props} />;
}

export function AgentWorkspaceReviewJsonBlockTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-review-json-block__title", className)} {...props} />;
}

export function AgentWorkspaceReviewJsonPre({
  maxHeight = false,
  className,
  ...props
}: HTMLAttributes<HTMLPreElement> & {
  maxHeight?: boolean;
}) {
  return <pre data-max-height={maxHeight ? "true" : undefined} className={cn("agent-workspace-review-json-pre", className)} {...props} />;
}

export function AgentWorkspaceReviewSection({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-review-section", className)} {...props} />;
}

export function AgentWorkspaceReviewSectionTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-review-section__title", className)} {...props} />;
}

export function AgentWorkspaceReviewEffectsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-review-effects-list", className)} {...props} />;
}

export function AgentWorkspaceReviewEmptyBlock({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-review-empty-block", className)} {...props} />;
}

export function AgentWorkspaceSummaryRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-summary-row", className)} {...props} />;
}

export function AgentWorkspaceSummaryLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-summary-row__label", className)} {...props} />;
}

export function AgentWorkspaceSummaryValue({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-summary-row__value", className)} {...props} />;
}

export function AgentThreePanePageBody({
  className,
  ...props
}: Omit<ComponentProps<typeof AppPageShellBody>, "padding" | "scroll">) {
  return <AgentPageShellBody padding="none" scroll="responsive-split" className={cn("agent-three-pane-page-body", className)} {...props} />;
}

export function AgentThreePanePagePane({
  className,
  tone = "surface",
  ...props
}: HTMLAttributes<HTMLElement> & {
  tone?: "surface" | "raw";
}) {
  return <section data-tone={tone} className={cn("agent-three-pane-page-pane", className)} {...props} />;
}

export function AgentThreePanePagePaneHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-three-pane-page-pane__header", className)} {...props} />;
}

export function AgentThreePanePagePaneHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-three-pane-page-pane__header-copy", className)} {...props} />;
}

export function AgentThreePanePagePaneTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("agent-three-pane-page-pane__title", className)} {...props} />;
}

export function AgentThreePanePagePaneDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-three-pane-page-pane__description", className)} {...props} />;
}

export function AgentThreePanePagePaneScroller({
  padding = "default",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  padding?: "default" | "none";
}) {
  return <div data-padding={padding === "none" ? "none" : undefined} className={cn("agent-three-pane-page-pane__scroller", className)} {...props} />;
}

export function AgentThreePanePageListHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-three-pane-page-list-header", className)} {...props} />;
}

export function AgentThreePanePageListTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("agent-three-pane-page-list-header__title", className)} {...props} />;
}

export function AgentThreePanePageListMeta({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-three-pane-page-list-header__meta", className)} {...props} />;
}

export function AgentThreePanePageListStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-three-pane-page-list-stack", className)} {...props} />;
}

export function AgentThreePanePageEmptyText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-three-pane-page-empty-text", className)} {...props} />;
}

export function AgentThreePanePageItemButton({
  active = false,
  variant = "card",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  variant?: "card" | "row";
}) {
  return <button type="button" data-active={active ? "true" : undefined} data-variant={variant} className={cn("agent-three-pane-page-item", className)} {...props} />;
}

export function AgentThreePanePageItemHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-three-pane-page-item__header", className)} {...props} />;
}

export function AgentThreePanePageItemTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-three-pane-page-item__title", className)} {...props} />;
}

export function AgentThreePanePageItemBadge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "info" | "success";
}) {
  return <span data-tone={tone === "neutral" ? undefined : tone} className={cn("agent-three-pane-page-item__badge", className)} {...props} />;
}

export function AgentThreePanePageItemDetail({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-three-pane-page-item__detail", className)} {...props} />;
}

export function AgentThreePanePageItemTime({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-three-pane-page-item__time", className)} {...props} />;
}

export function AgentThreePanePageItemMetaRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-three-pane-page-item__meta-row", className)} {...props} />;
}

export function AgentThreePanePagePaneRaw({ className, ...props }: HTMLAttributes<HTMLPreElement>) {
  return <pre className={cn("agent-three-pane-page-pane__raw", className)} {...props} />;
}

export function AgentThreePanePageSegmentedControl({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-three-pane-page-segmented-control", className)} {...props} />;
}

export function AgentThreePanePageSegmentButton({
  active = false,
  className,
  ...props
}: ComponentProps<typeof Button> & {
  active?: boolean;
}) {
  return <Button type="button" variant="ghost" size="xs" data-active={active ? "true" : undefined} className={cn("agent-three-pane-page-segment-button", className)} {...props} />;
}

export function AgentPageHeaderContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-page-header-content", className)} {...props} />;
}

export function AgentPageHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-page-header-copy", className)} {...props} />;
}

export function AgentPageTitleRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-page-title-row", className)} {...props} />;
}

export function AgentPageEyebrowRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-page-eyebrow-row", className)} {...props} />;
}

export function AgentPageDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-page-description", className)} {...props} />;
}

export function AgentWorkspacesFilterGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspaces-filter-grid", className)} {...props} />;
}

export function AgentWorkspaceListState({ icon, className, children, ...props }: HTMLAttributes<HTMLDivElement> & { icon?: ReactNode }) {
  return (
    <div className={cn("agent-workspace-list-state", className)} {...props}>
      {icon}
      {children}
    </div>
  );
}

export function AgentWorkspaceStateRow({
  icon,
  tone = "muted",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  tone?: "muted" | "danger";
}) {
  return (
    <div data-tone={tone === "danger" ? "danger" : undefined} className={cn("agent-workspace-state-row", className)} {...props}>
      {icon}
      {children}
    </div>
  );
}

export function AgentWorkspaceStateSpinner({ className, ...props }: ComponentProps<typeof Loader2>) {
  return <Loader2 size={14} className={cn("agent-workspace-state-spinner", className)} {...props} />;
}

export function AgentWorkspaceListItemButton({ className, ...props }: ButtonProps) {
  return <Button type="button" variant="ghost" className={cn("agent-workspace-list-item", className)} {...props} />;
}

export function AgentWorkspaceListItemContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-list-item__content", className)} {...props} />;
}

export function AgentWorkspaceListItemHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-list-item__header", className)} {...props} />;
}

export function AgentWorkspaceListItemTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-workspace-list-item__title", className)} {...props} />;
}

export function AgentWorkspaceListItemMeta({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-list-item__meta", className)} {...props} />;
}

export function AgentWorkspaceDetailStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-detail-stack", className)} {...props} />;
}

export function AgentWorkspaceDetailCard({ className, ...props }: ComponentProps<typeof AgentSurfaceBlock>) {
  return <AgentSurfaceBlock className={cn("agent-workspace-detail-card", className)} {...props} />;
}

export function AgentWorkspaceDetailHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-detail-header", className)} {...props} />;
}

export function AgentWorkspaceDetailCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-detail-copy", className)} {...props} />;
}

export function AgentWorkspaceDetailTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("agent-workspace-detail-title", className)} {...props} />;
}

export function AgentWorkspaceBadgeRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-badge-row", className)} {...props} />;
}

export function AgentWorkspaceActionRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-action-row", className)} {...props} />;
}

export function AgentWorkspaceMetaGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-meta-grid", className)} {...props} />;
}

export function AgentWorkspaceCodePanel({ className, ...props }: ComponentProps<typeof AgentSurfaceBlock>) {
  return <AgentSurfaceBlock asChild className={cn("agent-workspace-code-panel", className)} {...props} />;
}

export function AgentWorkspaceCodePanelHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-workspace-code-panel__header", className)} {...props} />;
}

export function AgentWorkspaceJsonGrid({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("agent-workspace-json-grid", className)} {...props} />;
}

export function AgentWorkspaceMetaItem({ label, value, title, className, ...props }: HTMLAttributes<HTMLDivElement> & { label: ReactNode; value: ReactNode; title?: string }) {
  return (
    <div className={cn("agent-workspace-meta-item", className)} {...props}>
      <div className="agent-workspace-meta-item__label">{label}</div>
      <div className="agent-workspace-meta-item__value" title={title}>{value}</div>
    </div>
  );
}

export const AgentArtifactsPageBody = AgentWorkspacesPageBody;
export const AgentArtifactsPageSidebar = AgentWorkspacesPageSidebar;
export const AgentArtifactsPageSidebarControls = AgentWorkspacesPageSidebarControls;
export const AgentArtifactsPageList = AgentWorkspacesPageList;
export const AgentArtifactsPageMain = AgentWorkspacesPageMain;
export const AgentArtifactsFilterGrid = AgentWorkspacesFilterGrid;
export const AgentArtifactListState = AgentWorkspaceListState;
export const AgentArtifactListItemButton = AgentWorkspaceListItemButton;
export const AgentArtifactListItemHeader = AgentWorkspaceListItemHeader;
export const AgentArtifactListItemTitle = AgentWorkspaceListItemTitle;
export const AgentArtifactListItemMeta = AgentWorkspaceListItemMeta;
export const AgentArtifactDetailStack = AgentWorkspaceDetailStack;
export const AgentArtifactDetailCard = AgentWorkspaceDetailCard;
export const AgentArtifactDetailHeader = AgentWorkspaceDetailHeader;
export const AgentArtifactDetailCopy = AgentWorkspaceDetailCopy;
export const AgentArtifactDetailTitle = AgentWorkspaceDetailTitle;
export const AgentArtifactBadgeRow = AgentWorkspaceBadgeRow;
export const AgentArtifactActionRow = AgentWorkspaceActionRow;
export const AgentArtifactMetaGrid = AgentWorkspaceMetaGrid;
export const AgentArtifactCodePanel = AgentWorkspaceCodePanel;
export const AgentArtifactCodePanelHeader = AgentWorkspaceCodePanelHeader;
export const AgentArtifactJsonGrid = AgentWorkspaceJsonGrid;
export const AgentArtifactMetaItem = AgentWorkspaceMetaItem;

export function AgentCanvasPageLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-canvas-page-layout", className)} {...props} />;
}

export function AgentCanvasCreatePanel({ className, ...props }: ComponentProps<typeof AgentSurfaceBlock>) {
  return <AgentSurfaceBlock variant="card" className={cn("agent-canvas-create-panel", className)} {...props} />;
}

export function AgentCanvasListPanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-canvas-list-panel", className)} {...props} />;
}

export function AgentCanvasLoadingState({ icon, className, children, ...props }: HTMLAttributes<HTMLDivElement> & { icon?: ReactNode }) {
  return (
    <div className={cn("agent-canvas-loading-state", className)} {...props}>
      {icon}
      {children}
    </div>
  );
}

export function AgentRunPageLoading({ icon, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { icon?: ReactNode }) {
  return (
    <div className={cn("agent-run-page-loading", className)} {...props}>
      {icon}
      {children}
    </div>
  );
}

export function AgentRunPageInfoStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-page-info-stack", className)} {...props} />;
}

export function AgentRunSummaryCard({ className, ...props }: ComponentProps<typeof AgentSurfaceBlock>) {
  return <AgentSurfaceBlock variant="subtle" className={cn("agent-run-summary-card", className)} {...props} />;
}

export function AgentRunSectionEyebrow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-section-eyebrow", className)} {...props} />;
}

export function AgentRunSummaryBadgeList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-summary-card__badges", className)} {...props} />;
}

export function AgentRunSummaryLatest({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-summary-card__latest", className)} {...props} />;
}

export function AgentRunSummaryLatestLabel({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-run-summary-card__latest-label", className)} {...props} />;
}

export function AgentRunSummaryOverview({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-summary-card__overview", className)} {...props} />;
}

export function AgentRunSummaryBullets({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-summary-card__bullets", className)} {...props} />;
}

export function AgentRunSummaryBullet({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-summary-card__bullet", className)} {...props} />;
}

export function AgentRunInfoItem({
  label,
  value,
  title,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  title?: string;
}) {
  return (
    <div className={cn("agent-run-info-item", className)} {...props}>
      <div className="agent-run-info-item__label">{label}</div>
      <div className="agent-run-info-item__value" title={title}>{value}</div>
    </div>
  );
}

export function AgentRunSidebarSurface({ className, ...props }: ComponentProps<typeof AgentSurfaceBlock>) {
  return <AgentSurfaceBlock variant="subtle" className={cn("agent-run-sidebar-surface", className)} {...props} />;
}

export function AgentRunSidebarLoading({ icon, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { icon?: ReactNode }) {
  return (
    <div className={cn("agent-run-sidebar-loading", className)} {...props}>
      {icon}
      {children}
    </div>
  );
}

export function AgentRunPendingList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-pending-list", className)} {...props} />;
}

export function AgentRunPendingItem({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-pending-item", className)} {...props} />;
}

export function AgentRunPendingTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-pending-item__title", className)} {...props} />;
}

export function AgentRunPendingReason({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-run-pending-item__reason", className)} {...props} />;
}

export function AgentRunPendingBadges({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-pending-item__badges", className)} {...props} />;
}

export function AgentRunPendingImpact({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-pending-item__impact", className)} {...props} />;
}

export function AgentRunInlineActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-inline-actions", className)} {...props} />;
}

export function AgentRunInlineActionButton({ className, ...props }: ButtonProps) {
  return <Button type="button" size="xs" className={cn("agent-run-inline-action", className)} {...props} />;
}

export function AgentRunTaskArtifactList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-task-artifacts", className)} {...props} />;
}

export function AgentRunTaskArtifactCard({ className, ...props }: ComponentProps<typeof AgentSurfaceBlock>) {
  return <AgentSurfaceBlock variant="card" className={cn("agent-run-task-artifact", className)} {...props} />;
}

export function AgentRunTaskArtifactHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-task-artifact__header", className)} {...props} />;
}

export function AgentRunTaskArtifactTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-run-task-artifact__title", className)} {...props} />;
}

export function AgentRunTaskArtifactActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-task-artifact__actions", className)} {...props} />;
}

export function AgentRunTaskArtifactMeta({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-task-artifact__meta", className)} {...props} />;
}

export function AgentRunTaskArtifactMetaItem({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-run-task-artifact__meta-item", className)} {...props} />;
}

export function AgentRunChildRunButton({ className, ...props }: ButtonProps) {
  return <Button type="button" size="xs" variant="ghost" className={cn("agent-run-child-run", className)} {...props} />;
}

export function AgentRunChildRunTitleRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-child-run__title-row", className)} {...props} />;
}

export function AgentRunChildRunTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-run-child-run__title", className)} {...props} />;
}

export function AgentRunChildRunStatus({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-run-child-run__status", className)} {...props} />;
}

export function AgentRunChildRunMeta({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-child-run__meta", className)} {...props} />;
}

export function AgentRunIcon({ icon: Icon, size = 14, spinning = false }: { icon: IconComponent; size?: number; spinning?: boolean }) {
  return <Icon size={size} className={spinning ? "agent-run-icon--spinning" : undefined} />;
}

export function AgentRunTraceHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-trace-header", className)} {...props} />;
}

export function AgentRunTraceSummary({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-trace-summary", className)} {...props} />;
}

export function AgentRunTraceTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-run-trace-summary__title", className)} {...props} />;
}

export function AgentRunTraceMeta({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-run-trace-summary__meta", className)} {...props} />;
}

export function AgentRunTraceCategoryButton({ className, ...props }: ButtonProps) {
  return <Button size="xs" variant="ghost" className={cn("agent-run-trace-category-button", className)} {...props} />;
}

export function AgentRunTraceControls({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-trace-controls", className)} {...props} />;
}

export function AgentRunTraceViewModeGroup({ className, ...props }: ComponentProps<typeof AgentSurfaceBlock>) {
  return <AgentSurfaceBlock className={cn("agent-run-trace-view-mode", className)} {...props} />;
}

export function AgentRunTraceViewModeButton({ className, ...props }: ButtonProps) {
  return <Button type="button" size="xs" variant="ghost" className={cn("agent-run-trace-view-mode__button", className)} {...props} />;
}

export function AgentRunTraceSearchInput({ className, ...props }: InputProps) {
  return <Input className={cn("agent-run-trace-search", className)} {...props} />;
}

export function AgentRunTraceSelectTrigger({ className, ...props }: ComponentProps<typeof SelectTrigger>) {
  return <SelectTrigger size="sm" className={cn("agent-run-trace-select-trigger", className)} {...props} />;
}

export function AgentRunTraceStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-trace-stack", className)} {...props} />;
}

export function AgentRunTraceStateMessage({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-run-trace-state-message", className)} {...props} />;
}

export function AgentRunTraceCallout({ className, ...props }: ComponentProps<typeof AgentRunCallout>) {
  return <AgentRunCallout className={cn("agent-run-trace-callout", className)} {...props} />;
}

export function AgentRunTraceFeedbackTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-trace-feedback__title", className)} {...props} />;
}

export function AgentRunTraceFeedbackDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("agent-run-trace-feedback__description", className)} {...props} />;
}

export function AgentRunTraceFeedbackActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-trace-feedback__actions", className)} {...props} />;
}

export function AgentRunTraceEmptyState({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-trace-empty-state", className)} {...props} />;
}

export function AgentRunTraceEventCard({
  linked = false,
  className,
  ...props
}: ComponentProps<typeof AgentSurfaceBlock> & {
  linked?: boolean;
}) {
  return (
    <AgentSurfaceBlock
      data-linked={linked ? "true" : undefined}
      className={cn("agent-run-trace-event", className)}
      {...props}
    />
  );
}

export function AgentRunTraceEventHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-trace-event__header", className)} {...props} />;
}

export function AgentRunTraceEventTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-run-trace-event__title", className)} {...props} />;
}

export function AgentRunTraceEventActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-trace-event__actions", className)} {...props} />;
}

export function AgentRunTraceEventActionButton({ className, ...props }: ButtonProps) {
  return <Button type="button" size="xs" variant="ghost" className={cn("agent-run-trace-event__action", className)} {...props} />;
}

export function AgentRunTraceEventBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-trace-event__body", className)} {...props} />;
}

export function AgentRunTraceEventMeta({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-trace-event__meta", className)} {...props} />;
}

export function AgentRunTraceEventMetaItem({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-run-trace-event__meta-item", className)} {...props} />;
}

export function AgentRunTraceDisclosure({
  summary,
  title,
  children,
  defaultOpen,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDetailsElement>, "title"> & {
  summary?: ReactNode;
  title?: ReactNode;
  defaultOpen?: boolean;
}) {
  const summaryContent = summary ?? title;
  return (
    <AgentSurfaceBlock asChild variant="subtle" className={cn("agent-run-trace-disclosure-frame", className)}>
      <details className="agent-run-trace-disclosure" open={defaultOpen} {...props}>
        <summary className="agent-run-trace-disclosure__summary">
          <ChevronRight size={10} className="agent-run-trace-disclosure__icon agent-run-trace-disclosure__icon--closed" />
          <ChevronDown size={10} className="agent-run-trace-disclosure__icon agent-run-trace-disclosure__icon--open" />
          {summaryContent}
        </summary>
        <div className="agent-run-trace-disclosure__body">{children}</div>
      </details>
    </AgentSurfaceBlock>
  );
}

export function AgentRunTraceContextGroups({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-trace-context-groups", className)} {...props} />;
}

export function AgentRunTraceContextGroup({ className, ...props }: ComponentProps<typeof AgentSurfaceBlock>) {
  return <AgentSurfaceBlock variant="card" className={cn("agent-run-trace-context-group", className)} {...props} />;
}

export function AgentRunTraceContextGroupLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-trace-context-group__label", className)} {...props} />;
}

export function AgentRunTraceContextGroupItems({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-trace-context-group__items", className)} {...props} />;
}

export function AgentRunTraceContextRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-trace-context-row", className)} {...props} />;
}

export function AgentRunTraceContextKey({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-run-trace-context-row__key", className)} {...props} />;
}

export function AgentRunTraceContextValue({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-run-trace-context-row__value", className)} {...props} />;
}

export function AgentRunTraceDetailLine({
  label,
  value,
  className,
  ...props
}: ComponentProps<typeof AgentSurfaceBlock> & {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <AgentSurfaceBlock variant="card" className={cn("agent-run-trace-detail-line", className)} {...props}>
      <div className="agent-run-trace-detail-line__label">{label}</div>
      <div className="agent-run-trace-detail-line__value">{value}</div>
    </AgentSurfaceBlock>
  );
}

export function AgentRunDebugSection({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("agent-run-debug-section", className)} {...props} />;
}

export function AgentRunDebugPanel({ className, ...props }: ComponentProps<typeof AgentSurfaceBlock>) {
  return <AgentSurfaceBlock className={cn("agent-run-debug-panel", className)} {...props} />;
}

export function AgentRunDebugHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-header", className)} {...props} />;
}

export function AgentRunDebugHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-header__copy", className)} {...props} />;
}

export function AgentRunDebugTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-title", className)} {...props} />;
}

export function AgentRunDebugDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-description", className)} {...props} />;
}

export function AgentRunDebugActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-actions", className)} {...props} />;
}

export function AgentRunDebugMetricGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-metric-grid", className)} {...props} />;
}

export function AgentRunDebugMetric({
  label,
  value,
  className,
  ...props
}: ComponentProps<typeof AgentSurfaceBlock> & {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <AgentSurfaceBlock variant="card" className={cn("agent-run-debug-metric", className)} {...props}>
      <div className="agent-run-debug-metric__label">{label}</div>
      <div className="agent-run-debug-metric__value">{value}</div>
    </AgentSurfaceBlock>
  );
}

export function AgentRunDebugSplit({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-split", className)} {...props} />;
}

export function AgentRunDebugStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-stack", className)} {...props} />;
}

export function AgentRunDebugList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-list", className)} {...props} />;
}

export function AgentRunDebugMutedNote({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-muted-note", className)} {...props} />;
}

export function AgentRunDebugActionList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-action-list", className)} {...props} />;
}

export function AgentRunDebugActionButton({ className, ...props }: ButtonProps) {
  return <Button type="button" size="xs" className={cn("agent-run-debug-action", className)} {...props} />;
}

export function AgentRunDebugRowButton({ className, ...props }: ButtonProps) {
  return <Button type="button" variant="ghost" className={cn("agent-run-debug-row-button", className)} {...props} />;
}

export function AgentRunDebugStatusNote({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-status-note", className)} {...props} />;
}

export function AgentRunDebugCodeBlock({ className, ...props }: ComponentProps<typeof AppCodeBlock>) {
  return <AppCodeBlock className={cn("agent-run-debug-code", className)} {...props} />;
}

export function AgentRunDebugReadinessList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-readiness-list", className)} {...props} />;
}

export function AgentRunDebugHotspotCard({
  tone,
  className,
  ...props
}: ComponentProps<typeof AgentRunToneSurfaceBlock> & {
  tone: AgentRunTone;
}) {
  return <AgentRunToneSurfaceBlock variant="subtle" tone={tone} className={cn("agent-run-debug-hotspot", className)} {...props} />;
}

export function AgentRunDebugHotspotLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-hotspot__layout", className)} {...props} />;
}

export function AgentRunDebugHotspotBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-hotspot__body", className)} {...props} />;
}

export function AgentRunDebugHotspotTitleRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-hotspot__title-row", className)} {...props} />;
}

export function AgentRunDebugHotspotTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-run-debug-hotspot__title", className)} {...props} />;
}

export function AgentRunDebugHotspotSummary({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-hotspot__summary", className)} {...props} />;
}

export function AgentRunDebugHotspotMeta({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-hotspot__meta", className)} {...props} />;
}

export function AgentRunDebugHotspotMetaItem({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-run-debug-hotspot__meta-item", className)} {...props} />;
}

export function AgentRunDebugTagGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-tag-group", className)} {...props} />;
}

export function AgentRunDebugTagGroupLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-tag-group__label", className)} {...props} />;
}

export function AgentRunDebugTags({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-run-debug-tags", className)} {...props} />;
}
