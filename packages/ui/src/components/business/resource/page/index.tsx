import { forwardRef } from "react";
import type { ComponentPropsWithoutRef, CSSProperties, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { accentTextClass, toneTextClass } from "../../../../semantic";
import { AppContentLayout } from "../../../layout";
import { AppControlGroup, AppIconFrame, AppMediaFrame, AppRangeTrack, type AppRangeTrackProps } from "../../app/display";
import { AppStateMessage, AppTextEmptyState } from "../../app/state";
import { AppSurfaceItem } from "../../app/surface";
import {
  WorkbenchEmptyState,
  WorkbenchEntityCard,
  WorkbenchListItem,
  WorkbenchSection,
  WorkbenchStatusBadge,
  WorkbenchSummaryCard,
  WorkbenchSummaryPreviewStack,
  WorkbenchSummaryPreviewStrip,
  WorkbenchSummaryStatusGrid,
  WorkbenchSurfaceItem,
  WorkbenchThumbnail,
  type WorkbenchIconComponent,
  type WorkbenchSummaryPreviewState,
} from "../../workbench";
import {
  Badge,
  Button,
  CheckboxField,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DropdownMenuItem,
  Input,
  Progress,
  RangeInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  type ButtonProps,
  type StatusBadgeProps,
} from "../../../primitives";
import type { IconComponent } from "../../../primitives/types";

export function ResourcePageLayout(props: ComponentPropsWithoutRef<typeof AppContentLayout>) {
  return <AppContentLayout variant="workspace" padding="none" scroll="hidden" contentClassName="resource-page" {...props} />;
}

export function ResourcePageSidebar({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn("resource-page__sidebar", className)} {...props} />;
}

export function ResourcePageSidebarSection({
  grow = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  grow?: boolean;
}) {
  return <section data-grow={grow ? "true" : undefined} className={cn("resource-page__sidebar-section", className)} {...props} />;
}

export function ResourcePageSidebarHeader({
  title,
  icon: Icon,
  action,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  icon?: IconComponent;
  action?: ReactNode;
}) {
  return (
    <div className={cn("resource-page__sidebar-header", className)} {...props}>
      <span className="resource-page__sidebar-title">
        {Icon ? <Icon size={12} /> : null}
        {title}
      </span>
      {action}
    </div>
  );
}

export function ResourcePageFolderList({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  grow?: boolean;
}) {
  return <div className={cn("resource-page__folder-list", className)} {...props} />;
}

export function ResourcePageFolderEmpty({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("resource-page__folder-empty", className)} {...props} />;
}

export function ResourcePageMain({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <main className={cn("resource-page__main", className)} {...props} />;
}

export function ResourcePageHeaderMeta({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("resource-page__header-meta", className)} {...props} />;
}

export function ResourcePageActionGroup({ className, ...props }: ComponentPropsWithoutRef<typeof AppControlGroup>) {
  return <AppControlGroup className={cn("resource-page__action-group", className)} {...props} />;
}

export function ResourcePageActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("resource-page__action-button", className)} {...props} />;
}

export function ResourcePageSearchField({
  icon: Icon,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Input> & {
  icon: IconComponent;
}) {
  return (
    <label className={cn("resource-page__search", className)}>
      <Icon size={12} className="resource-page__search-icon" />
      <Input className="resource-page__search-input" {...props} />
    </label>
  );
}

export const ResourcePageHiddenFileInput = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<typeof Input>>(
  ({ className, ...props }, ref) => <Input ref={ref} className={cn("resource-page__hidden-input", className)} {...props} />
);
ResourcePageHiddenFileInput.displayName = "ResourcePageHiddenFileInput";

export function ResourcePageFilterBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-page__filter-bar", className)} {...props} />;
}

export function ResourcePageFlexibleSpace({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-page__flex-space", className)} {...props} />;
}

export function ResourcePageBulkActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-page__bulk-actions", className)} {...props} />;
}

export function ResourcePageMutedText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("resource-page__muted-text", className)} {...props} />;
}

export function ResourcePageContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-page__content", className)} {...props} />;
}

export function ResourcePageLoadingState({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-page__loading", className)} {...props} />;
}

export function ResourcePageEmptyState({
  icon: Icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon: IconComponent;
}) {
  return (
    <div className={cn("resource-page__empty", className)} {...props}>
      <Icon size={24} className="resource-page__empty-icon" />
      <p className="resource-page__empty-text">{children}</p>
    </div>
  );
}

export function ResourcePageAssetGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-page__asset-grid", className)} {...props} />;
}

export function ResourcePageAssetList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-page__asset-list", className)} {...props} />;
}

export function ResourcePagePager({ status, actions, className, ...props }: HTMLAttributes<HTMLDivElement> & { status: ReactNode; actions: ReactNode }) {
  return (
    <div className={cn("resource-page__pager", className)} {...props}>
      <span>{status}</span>
      <div className="resource-page__pager-actions">{actions}</div>
    </div>
  );
}

export function ResourceFolderTreeItem({
  active,
  icon,
  label,
  subtitle,
  badge,
  sharedIndicator,
  actions,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  sharedIndicator?: ReactNode;
  actions?: ReactNode;
  onClick: () => void;
}) {
  return (
    <WorkbenchSurfaceItem asChild active={active} density="compact" className="resource-folder-tree-item">
      <div onClick={onClick}>
        <span className="resource-folder-tree-item__icon">{icon}</span>
        <span className="resource-folder-tree-item__body">
          <span className="resource-folder-tree-item__label">{label}</span>
          {subtitle ? <span className="resource-folder-tree-item__subtitle">{subtitle}</span> : null}
        </span>
        {sharedIndicator}
        {badge != null ? <Badge>{badge}</Badge> : null}
        {actions}
      </div>
    </WorkbenchSurfaceItem>
  );
}

export function ResourcePageListRow({ selected = false, className, ...props }: ComponentPropsWithoutRef<typeof ResourceListSurfaceItem>) {
  return <ResourceListSurfaceItem selected={selected} className={cn("resource-page__list-row", className)} {...props} />;
}

export function ResourcePageListCheckbox({ className, ...props }: ComponentPropsWithoutRef<typeof CheckboxField>) {
  return <CheckboxField className={cn("resource-page__list-checkbox", className)} {...props} />;
}

export function ResourcePrepBoardRoot({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("resource-prep-board", className)} {...props} />;
}

export function ResourcePrepBoardHeader({
  title,
  description,
  count,
  actions,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  count?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("resource-prep-board__header", className)} {...props}>
      <div className="resource-prep-board__header-row">
        <div className="resource-prep-board__copy">
          <p className="resource-prep-board__title">{title}</p>
          {description ? <p className="resource-prep-board__description">{description}</p> : null}
        </div>
        <div className="resource-prep-board__header-actions">
          {count != null ? <ResourcePrepCountBadge>{count}</ResourcePrepCountBadge> : null}
          {actions}
        </div>
      </div>
      {children}
    </div>
  );
}

export function ResourcePrepViewTabs({ className, ...props }: ComponentPropsWithoutRef<typeof AppControlGroup>) {
  return <AppControlGroup className={cn("resource-prep-view-tabs", className)} {...props} />;
}

export function ResourcePrepViewButton({
  active,
  count,
  children,
  className,
  ...props
}: ButtonProps & {
  active?: boolean;
  count?: ReactNode;
}) {
  return (
    <Button size="sm" variant={active ? "soft" : "ghost"} className={cn("resource-prep-view-button", className)} {...props}>
      {children}
      {count != null ? <span className="resource-prep-view-button__count">{count}</span> : null}
    </Button>
  );
}

export function ResourcePrepCountBadge({ className, ...props }: ComponentPropsWithoutRef<typeof Badge>) {
  return <Badge variant="outline" className={cn("resource-prep-count-badge", className)} {...props} />;
}

export function ResourcePrepGroupedLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-grouped-layout", className)} {...props} />;
}

export function ResourcePrepSidebar({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn("resource-prep-sidebar", className)} {...props} />;
}

export function ResourcePrepSidebarHeader({
  title,
  count,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  count?: ReactNode;
}) {
  return (
    <div className={cn("resource-prep-sidebar__header", className)} {...props}>
      <p className="resource-prep-sidebar__title">{title}</p>
      {count != null ? <ResourcePrepCountBadge>{count}</ResourcePrepCountBadge> : null}
    </div>
  );
}

export function ResourcePrepSidebarList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-sidebar__list", className)} {...props} />;
}

export function ResourcePrepWorkArea({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-work-area", className)} {...props} />;
}

export function ResourcePrepQueueArea({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-queue-area", className)} {...props} />;
}

export function ResourcePrepQueueStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-queue-stack", className)} {...props} />;
}

export function ResourcePrepScrollStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-scroll-stack", className)} {...props} />;
}

export function ResourcePrepInlineHeader({
  icon: Icon,
  title,
  detail,
  description,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: IconComponent;
  title: ReactNode;
  detail?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("resource-prep-inline-header", className)} {...props}>
      <div className="resource-prep-inline-header__copy">
        <div className="resource-prep-inline-header__meta">
          {Icon ? <Icon size={14} /> : null}
          <span>{title}</span>
          {detail != null ? <span className="resource-prep-inline-header__separator">·</span> : null}
          {detail != null ? <span>{detail}</span> : null}
        </div>
        {description ? <p className="resource-prep-inline-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="resource-prep-inline-header__actions">{actions}</div> : null}
    </div>
  );
}

export function ResourcePrepFilterGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-filter-group", className)} {...props} />;
}

export function ResourcePrepFilterButton({ active, className, ...props }: ButtonProps & { active?: boolean }) {
  return <Button size="sm" variant={active ? "soft" : "ghost"} className={cn("resource-prep-filter-button", className)} {...props} />;
}

export function ResourcePrepLoadingState({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("resource-prep-loading", className)} {...props} />;
}

export function ResourcePrepAssetGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-asset-grid", className)} {...props} />;
}

export function ResourcePrepPreviewGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-preview-grid", className)} {...props} />;
}

export function ResourcePrepPreviewOverflow({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("resource-prep-preview-overflow", className)} {...props} />;
}

export function ResourcePrepQueueSection({
  span = "auto",
  title,
  description,
  action,
  children,
  className,
}: ComponentPropsWithoutRef<typeof WorkbenchSection> & {
  span?: "auto" | "fill" | "references" | "assets";
}) {
  return (
    <WorkbenchSection
      icon={undefined}
      title={title}
      description={description}
      className={cn("resource-prep-queue-section", `resource-prep-queue-section--${span}`, className)}
      bodyClassName="resource-prep-queue-section__body"
      action={action}
    >
      {children}
    </WorkbenchSection>
  );
}

export function ResourcePrepQueueActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-queue-actions", className)} {...props} />;
}

export function ResourcePrepQueueActionButton({ className, ...props }: ButtonProps) {
  return <Button size="sm" variant="ghost" className={cn("resource-prep-queue-action-button", className)} {...props} />;
}

export function ResourcePrepCollapsedQueueButton({
  title,
  status,
  icon,
  className,
  ...props
}: ButtonProps & {
  title: ReactNode;
  status?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Button type="button" variant="outline" className={cn("resource-prep-collapsed-queue", className)} {...props}>
      <span className="resource-prep-collapsed-queue__label">
        {icon}
        <span className="resource-prep-collapsed-queue__title">{title}</span>
      </span>
      {status}
    </Button>
  );
}

export function ResourcePrepEntityCard(props: ComponentPropsWithoutRef<typeof WorkbenchEntityCard>) {
  return <WorkbenchEntityCard {...props} />;
}

export function ResourcePrepSummaryCard(props: ComponentPropsWithoutRef<typeof WorkbenchSummaryCard>) {
  return <WorkbenchSummaryCard {...props} />;
}

export function ResourcePrepSummaryPreviewStack(props: ComponentPropsWithoutRef<typeof WorkbenchSummaryPreviewStack>) {
  return <WorkbenchSummaryPreviewStack {...props} />;
}

export function ResourcePrepSummaryPreviewStrip(props: ComponentPropsWithoutRef<typeof WorkbenchSummaryPreviewStrip>) {
  return <WorkbenchSummaryPreviewStrip {...props} />;
}

export function ResourcePrepSummaryStatusGrid(props: ComponentPropsWithoutRef<typeof WorkbenchSummaryStatusGrid>) {
  return <WorkbenchSummaryStatusGrid {...props} />;
}

export function ResourcePrepStatusBadge(props: ComponentPropsWithoutRef<typeof WorkbenchStatusBadge>) {
  return <WorkbenchStatusBadge {...props} />;
}

export function ResourcePrepThumbnail({
  frame = "card",
  className,
  ...props
}: ComponentPropsWithoutRef<typeof WorkbenchThumbnail> & {
  frame?: "card" | "strip" | "fill" | "banner" | "draft";
}) {
  return <WorkbenchThumbnail className={cn("resource-prep-thumbnail", `resource-prep-thumbnail--${frame}`, className)} {...props} />;
}

export function ResourcePrepMediaBackdrop({
  tone = "none",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: "none" | "dark" | "muted";
}) {
  return <div className={cn("resource-prep-media-backdrop", `resource-prep-media-backdrop--${tone}`, className)} {...props} />;
}

export function ResourcePrepEmptyState(props: ComponentPropsWithoutRef<typeof WorkbenchEmptyState>) {
  return <WorkbenchEmptyState {...props} />;
}

export type ResourcePrepSummaryPreviewState = WorkbenchSummaryPreviewState;

export function ResourcePrepReviewDialogContent(props: ComponentPropsWithoutRef<typeof DialogContent>) {
  return <DialogContent className="resource-prep-review-dialog" {...props} />;
}

export function ResourcePrepReviewWorkspaceRoot({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-review-workspace", className)} {...props} />;
}

export function ResourcePrepReviewHeader({
  eyebrow,
  title,
  description,
  action,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className={cn("resource-prep-review-workspace__header", className)} {...props}>
      <div className="resource-prep-review-workspace__copy">
        {eyebrow ? <div className="resource-prep-review-workspace__eyebrow">{eyebrow}</div> : null}
        <h1 className="resource-prep-review-workspace__title">{title}</h1>
        {description ? <p className="resource-prep-review-workspace__description">{description}</p> : null}
      </div>
      {action ? <div className="resource-prep-review-workspace__action">{action}</div> : null}
    </header>
  );
}

export function ResourcePrepReviewBreadcrumb({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-review-workspace__breadcrumb", className)} {...props} />;
}

export function ResourcePrepReviewBreadcrumbText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("resource-prep-review-workspace__breadcrumb-text", className)} {...props} />;
}

export function ResourcePrepReviewBackButton({ className, ...props }: ButtonProps) {
  return <Button size="sm" variant="outline" className={cn("resource-prep-review-workspace__back-button", className)} {...props} />;
}

export function ResourcePrepReviewGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-review-workspace__grid", className)} {...props} />;
}

export function ResourcePrepReviewMain({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-review-workspace__main", className)} {...props} />;
}

export function ResourcePrepReviewSidebar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-review-workspace__sidebar", className)} {...props} />;
}

export function ResourcePrepReviewInfoPanel({
  title,
  icon,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof WorkbenchSection> & {
  title: ReactNode;
  icon: WorkbenchIconComponent;
}) {
  return <WorkbenchSection title={title} icon={icon} bodyClassName="resource-prep-review-workspace__info-body" className={className} {...props} />;
}

export function ResourcePrepCreateReferenceDialogContent(props: ComponentPropsWithoutRef<typeof DialogContent>) {
  return <DialogContent className="resource-prep-create-reference-dialog" {...props} />;
}

export function ResourcePrepCreateAssetDialogContent(props: ComponentPropsWithoutRef<typeof DialogContent>) {
  return <DialogContent className="resource-prep-create-asset-dialog" {...props} />;
}

export function ResourcePrepLibraryDialogContent(props: ComponentPropsWithoutRef<typeof DialogContent>) {
  return <DialogContent className="resource-prep-library-dialog" {...props} />;
}

export function ResourcePrepLibraryPickerSlot({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-library-dialog__picker", className)} {...props} />;
}

export function ResourcePrepLibraryDialogButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("resource-prep-library-dialog__button", className)} {...props} />;
}

export function ResourcePrepScreenReaderTitle(props: ComponentPropsWithoutRef<typeof DialogTitle>) {
  return <DialogTitle className="resource-prep-sr-title" {...props} />;
}

export function ResourcePrepDialogHeader({
  title,
  description,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className={cn("resource-prep-dialog-header", className)} {...props}>
      <DialogTitle className="resource-prep-dialog-header__title">{title}</DialogTitle>
      {description ? <p className="resource-prep-dialog-header__description">{description}</p> : null}
    </div>
  );
}

export function ResourcePrepDialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-dialog-body", className)} {...props} />;
}

export function ResourcePrepDialogActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-dialog-actions", className)} {...props} />;
}

export function ResourcePrepActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("resource-prep-action-button", className)} {...props} />;
}

export const ResourcePrepHeaderActionButton = ResourcePrepActionButton;

export const ResourcePrepHiddenFileInput = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<typeof Input>>(
  ({ className, ...props }, ref) => <Input ref={ref} className={cn("resource-prep-hidden-input", className)} {...props} />
);
ResourcePrepHiddenFileInput.displayName = "ResourcePrepHiddenFileInput";

export function ResourcePrepShellBadge({ className, ...props }: ComponentPropsWithoutRef<typeof Badge>) {
  return <Badge variant="outline" className={cn("resource-prep-shell-badge", className)} {...props} />;
}

export function ResourcePrepShellStatusBadge({ className, ...props }: StatusBadgeProps) {
  return <StatusBadge className={cn("resource-prep-shell-badge", className)} {...props} />;
}

export function ResourcePrepCreateAssetField({
  label,
  children,
  help,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  children: ReactNode;
  help?: ReactNode;
}) {
  return (
    <div className={cn("resource-prep-create-asset-field", className)} {...props}>
      <p className="resource-prep-create-asset-field__label">{label}</p>
      {children}
      {help ? <p className="resource-prep-create-asset-field__help">{help}</p> : null}
    </div>
  );
}

export interface ResourcePrepSelectOption {
  value: string;
  label: ReactNode;
}

export function ResourcePrepSelect({
  value,
  placeholder,
  options,
  triggerId,
  onValueChange,
}: {
  value: string;
  placeholder?: ReactNode;
  options: ResourcePrepSelectOption[];
  triggerId?: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={triggerId}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ResourcePrepWorkspaceGrid({
  detailOpen,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  detailOpen?: boolean;
}) {
  return <main data-detail-open={detailOpen ? "true" : undefined} className={cn("resource-prep-workspace-grid", className)} {...props} />;
}

export function ResourcePrepBoardSlot({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-workspace-board", className)} {...props} />;
}

export function ResourcePrepContextMenu({
  x,
  y,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  x: number;
  y: number;
}) {
  return (
    <AppSurfaceItem
      role="menu"
      aria-label="准备项操作"
      className={cn("resource-prep-context-menu", className)}
      style={{ left: x, top: y } as CSSProperties}
      {...props}
    />
  );
}

export function ResourcePrepContextMenuButton({ className, ...props }: ButtonProps) {
  return <Button type="button" role="menuitem" variant="ghost" size="sm" className={cn("resource-prep-context-menu__button", className)} {...props} />;
}

export function ResourcePrepContextMenuSeparator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-context-menu__separator", className)} {...props} />;
}

export function ResourcePrepInspectorRoot({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn("resource-prep-inspector", className)} {...props} />;
}

export function ResourcePrepInspectorPanel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("resource-prep-inspector__panel", className)} {...props} />;
}

export function ResourcePrepInspectorHeader({
  icon,
  title,
  subtitle,
  actions,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("resource-prep-inspector__header", className)} {...props}>
      <div className="resource-prep-inspector__title-row">
        <AppIconFrame className="resource-prep-inspector__icon">{icon}</AppIconFrame>
        <div className="resource-prep-inspector__copy">
          <p className="resource-prep-inspector__title">{title}</p>
          {subtitle ? <p className="resource-prep-inspector__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="resource-prep-inspector__actions">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function ResourcePrepInspectorActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-inspector__actions-row", className)} {...props} />;
}

export function ResourcePrepInspectorActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("resource-prep-inspector__action-button", className)} {...props} />;
}

export function ResourcePrepInspectorCloseButton({ className, ...props }: ButtonProps) {
  return <Button type="button" size="icon" variant="ghost" className={cn("resource-prep-inspector__close-button", className)} {...props} />;
}

export function ResourcePrepInspectorTabs({ className, ...props }: ComponentPropsWithoutRef<typeof AppControlGroup>) {
  return <AppControlGroup layout="grid" className={cn("resource-prep-inspector__tabs", className)} {...props} />;
}

export function ResourcePrepInspectorTabButton({ active, className, ...props }: ButtonProps & { active?: boolean }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "soft" : "ghost"}
      className={cn("resource-prep-inspector__tab-button", className)}
      {...props}
    />
  );
}

export function ResourcePrepInspectorBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-inspector__body", className)} {...props} />;
}

export function ResourcePrepInspectorStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-prep-inspector__stack", className)} {...props} />;
}

export function ResourcePrepEmptyInspectorState({
  title,
  description,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <AppTextEmptyState className={cn("resource-prep-empty-inspector", className)} {...props}>
      <span className="resource-prep-empty-inspector__title">{title}</span>
      {description ? <span className="resource-prep-empty-inspector__description">{description}</span> : null}
    </AppTextEmptyState>
  );
}

export function ResourceAssetPreviewFallback({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-asset-card__fallback", className)} {...props} />;
}

export function ResourceAssetActionButton({ className, ...props }: ButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn("resource-asset-card__action-button", className)}
      {...props}
    />
  );
}

export function ResourceAssetName({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("resource-asset-card__resource-name", className)} {...props} />;
}

export function ResourceDangerMenuItem({ className, ...props }: ComponentPropsWithoutRef<typeof DropdownMenuItem>) {
  return <DropdownMenuItem className={cn(toneTextClass("danger"), className)} {...props} />;
}

export function ResourceDialogContent({
  size = "sm",
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogContent> & {
  size?: "xs" | "sm" | "md" | "permissions" | "clip";
}) {
  return <DialogContent className={cn("resource-dialog-content", `resource-dialog-content--${size}`, className)} {...props} />;
}

export function ResourceDialogTitle(props: ComponentPropsWithoutRef<typeof DialogTitle>) {
  return <DialogTitle {...props} />;
}

export function ResourceDialogFooter({ className, ...props }: ComponentPropsWithoutRef<typeof DialogFooter>) {
  return <DialogFooter className={cn("resource-dialog-footer", className)} {...props} />;
}

export function ResourceDialogStack({
  density = "normal",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  density?: "normal" | "compact" | "loose";
}) {
  return <div className={cn("resource-dialog-stack", `resource-dialog-stack--${density}`, className)} {...props} />;
}

export function ResourceDialogField({ className, ...props }: HTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("resource-dialog-field", className)} {...props} />;
}

export function ResourceDialogFieldLabel({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("resource-dialog-field__label", className)} {...props} />;
}

export function ResourceDialogInput({ className, ...props }: ComponentPropsWithoutRef<typeof Input>) {
  return <Input className={cn("resource-dialog-input", className)} {...props} />;
}

export function ResourceDialogSelect({ className, ...props }: ComponentPropsWithoutRef<"select">) {
  return <select className={cn("resource-dialog-select", className)} {...props} />;
}

export function ResourceDialogCheckbox({ className, ...props }: ComponentPropsWithoutRef<typeof CheckboxField>) {
  return <CheckboxField className={cn("resource-dialog-checkbox", className)} {...props} />;
}

export function ResourceDialogText({
  tone = "muted",
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  tone?: "muted" | "faint" | "foreground";
}) {
  return <p className={cn("resource-dialog-text", `resource-dialog-text--${tone}`, className)} {...props} />;
}

export function ResourceDialogScrollArea({
  size = "md",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  size?: "sm" | "md";
}) {
  return <div className={cn("resource-dialog-scroll-area", `resource-dialog-scroll-area--${size}`, className)} {...props} />;
}

export function ResourceDialogHeader({
  icon: Icon,
  title,
  close,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: IconComponent;
  title: ReactNode;
  close?: ReactNode;
}) {
  return (
    <div className={cn("resource-dialog-header", className)} {...props}>
      {Icon ? <Icon size={14} className="resource-dialog-header__icon" /> : null}
      <DialogTitle className="resource-dialog-header__title">{title}</DialogTitle>
      {close}
    </div>
  );
}

export function ResourceDialogCloseButton({ className, ...props }: ComponentPropsWithoutRef<typeof DialogClose>) {
  return <DialogClose className={cn("resource-dialog-close", className)} {...props} />;
}

export function ResourceClipLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-clip-layout", className)} {...props} />;
}

export function ResourceClipMain({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-clip-main", className)} {...props} />;
}

export function ResourceClipStage({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-clip-stage", className)} {...props} />;
}

export function ResourceClipStageFrame({ className, ...props }: ComponentPropsWithoutRef<typeof AppMediaFrame>) {
  return <AppMediaFrame variant="stage-dark" className={cn("resource-clip-stage", className)} {...props} />;
}

export function ResourceClipStageState({
  align = "center",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  align?: "center" | "left";
}) {
  return <div className={cn("resource-clip-stage-state", `resource-clip-stage-state--${align}`, className)} {...props} />;
}

export function ResourceClipStageText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("resource-clip-stage-text", className)} {...props} />;
}

export function ResourceClipProgress({ className, ...props }: ComponentPropsWithoutRef<typeof Progress>) {
  return <Progress className={cn("resource-clip-progress", className)} {...props} />;
}

export function ResourceClipControls({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-clip-controls", className)} {...props} />;
}

export function ResourceClipTime({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("resource-clip-time", className)} {...props} />;
}

export function ResourceClipRangeGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-clip-range-grid", className)} {...props} />;
}

export function ResourceClipSidebar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-clip-sidebar", className)} {...props} />;
}

export function ResourceClipFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-clip-footer", className)} {...props} />;
}

export function ResourceClipHint(props: HTMLAttributes<HTMLParagraphElement>) {
  return <ResourceDialogText {...props} />;
}

export function ResourceClipExpectedPath({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("resource-clip-expected-path", className)} {...props} />;
}

export function ResourceClipStatusText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("resource-clip-status-text", className)} {...props} />;
}

export function ResourceClipRangeFieldRoot({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-clip-range-field", className)} {...props} />;
}

export function ResourceClipRangeFieldHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-clip-range-field__header", className)} {...props} />;
}

export function ResourceClipRangeInput({ className, ...props }: ComponentPropsWithoutRef<typeof RangeInput>) {
  return <RangeInput className={cn("resource-clip-range-input", className)} {...props} />;
}

export function ResourceClipRangeTrack({ className, ...props }: AppRangeTrackProps) {
  return <AppRangeTrack className={cn("resource-clip-range-track", className)} {...props} />;
}

export function ResourceFolderOption({
  active,
  icon,
  label,
  sharedIndicator,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: ReactNode;
  sharedIndicator?: ReactNode;
  onClick: () => void;
}) {
  return (
    <WorkbenchListItem active={active} density="compact" onClick={onClick} className="resource-folder-option">
      <span className="resource-folder-option__icon">{icon}</span>
      <span className="resource-folder-option__label">{label}</span>
      {sharedIndicator}
    </WorkbenchListItem>
  );
}

export function ResourcePermissionShareRow({
  title,
  description,
  control,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  control: ReactNode;
}) {
  return (
    <AppSurfaceItem variant="muted" className={cn("resource-permission-share-row", className)} {...props}>
      <div className="resource-permission-share-row__copy">
        <p className="resource-permission-share-row__title">{title}</p>
        {description ? <p className="resource-permission-share-row__description">{description}</p> : null}
      </div>
      <div className="resource-permission-share-row__control">{control}</div>
    </AppSurfaceItem>
  );
}

export function ResourcePermissionUserRow({
  name,
  meta,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  name: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <AppSurfaceItem className={cn("resource-permission-user-row", className)} {...props}>
      <span className="resource-permission-user-row__name">{name}</span>
      {meta ? <span className="resource-permission-user-row__meta">{meta}</span> : null}
      {actions ? <div className="resource-permission-user-row__actions">{actions}</div> : null}
    </AppSurfaceItem>
  );
}

export function ResourcePermissionActionGroup({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppControlGroup className={cn("resource-permission-action-group", className)} {...props}>
      {children}
    </AppControlGroup>
  );
}

export function ResourcePermissionSection({
  title,
  children,
  divided = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  divided?: boolean;
}) {
  return (
    <div className={cn("resource-permission-section", divided && "resource-permission-section--divided", className)} {...props}>
      <p className="resource-permission-section__title">{title}</p>
      {children}
    </div>
  );
}

export function ResourcePermissionEmpty({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("resource-permission-empty", className)} {...props} />;
}

export interface ResourceClipSummaryProps extends HTMLAttributes<HTMLDivElement> {
  rows: Array<{ label: ReactNode; value: ReactNode; title?: string }>;
}

export function ResourceClipSummary({ rows, className, ...props }: ResourceClipSummaryProps) {
  return (
    <AppSurfaceItem variant="muted" className={cn("resource-clip-summary", className)} {...props}>
      {rows.map((row, index) => (
        <div key={index} className="resource-clip-summary__row">
          <span className="resource-clip-summary__label">{row.label}</span>
          <span className="resource-clip-summary__value" title={row.title}>{row.value}</span>
        </div>
      ))}
    </AppSurfaceItem>
  );
}

export function ResourceClipModeGroup({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppControlGroup layout="grid" className={cn("resource-clip-mode-group", className)} {...props}>
      {children}
    </AppControlGroup>
  );
}

export function ResourceStateMessage({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "info" | "success" | "danger";
  className?: string;
}) {
  return (
    <AppStateMessage tone={tone} className={cn("resource-state-message", className)}>
      {children}
    </AppStateMessage>
  );
}

export function ResourceContextMenu({
  x,
  y,
  label,
  children,
  className,
  onClick,
}: {
  x: number;
  y: number;
  label: ReactNode;
  children: ReactNode;
  className?: string;
  onClick?: HTMLAttributes<HTMLDivElement>["onClick"];
}) {
  return (
    <AppSurfaceItem
      className={cn("resource-context-menu", className)}
      style={{ left: x, top: y } as CSSProperties}
      onClick={onClick}
    >
      <div className="resource-context-menu__label">{label}</div>
      {children}
    </AppSurfaceItem>
  );
}

export function ResourceContextMenuButton({ className, ...props }: ButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("resource-context-menu__button", className)}
      {...props}
    />
  );
}

export function ResourceListSurfaceItem({
  selected = false,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  selected?: boolean;
}) {
  return (
    <AppSurfaceItem
      density="compact"
      variant={selected ? "muted" : "card"}
      className={cn("resource-list-surface-item", selected && "resource-list-surface-item--selected", className)}
      {...props}
    >
      {children}
    </AppSurfaceItem>
  );
}

export function ResourceSharedIndicator({
  muted,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  muted?: boolean;
}) {
  return (
    <span
      className={cn("resource-shared-indicator", muted ? "resource-shared-indicator--muted" : accentTextClass("blue"), className)}
      {...props}
    />
  );
}

export function resourceDangerTextClass(className?: string) {
  return cn(toneTextClass("danger"), className);
}
