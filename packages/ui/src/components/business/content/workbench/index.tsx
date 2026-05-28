export {
  ContentWorkbenchDialogEmptyState,
  ContentWorkbenchDialogFrame,
  type ContentWorkbenchDialogWidth,
} from "./dialog";
export {
  ContentWorkbenchEditorActionGroup,
  ContentWorkbenchEditorField,
  ContentWorkbenchEditorFieldGrid,
  ContentWorkbenchEditorGenerationActions,
  ContentWorkbenchEditorGenerationBar,
  ContentWorkbenchEditorHeader,
  ContentWorkbenchEditorPanel,
  ContentWorkbenchEditorRoot,
  ContentWorkbenchEditorSelectField,
  ContentWorkbenchGenerationReadiness,
  ContentWorkbenchGenerationInputSection,
  ContentWorkbenchInputActionButton,
  ContentWorkbenchInputActionGroup,
  ContentWorkbenchInputCard,
  ContentWorkbenchInputCardGrid,
  ContentWorkbenchInputDrawer,
  ContentWorkbenchInputDrawerHeader,
  ContentWorkbenchInputDrawerPanel,
  ContentWorkbenchInputDrawerTab,
  ContentWorkbenchInputDrawerTabList,
  ContentWorkbenchKeyframeActionButton,
  ContentWorkbenchKeyframeDetail,
  ContentWorkbenchKeyframeEmptyState,
  ContentWorkbenchKeyframeInput,
  ContentWorkbenchKeyframeList,
  ContentWorkbenchKeyframeListItem,
  ContentWorkbenchKeyframeListSection,
  ContentWorkbenchKeyframeModelSelect,
  ContentWorkbenchKeyframeStatusBadge,
  ContentWorkbenchKeyframeTextarea,
  ContentWorkbenchKeyframeThumbnail,
  ContentWorkbenchPlanningActionButton,
  ContentWorkbenchPlanningEditor,
  ContentWorkbenchPlanningFieldGrid,
  ContentWorkbenchPlanningHeader,
  ContentWorkbenchPlanningTextareaField,
  ContentWorkbenchQuickCreateActionButton,
  ContentWorkbenchQuickCreateActions,
  ContentWorkbenchQuickCreateCard,
  ContentWorkbenchQuickCreateField,
  ContentWorkbenchQuickCreateInputField,
  ContentWorkbenchQuickCreateSelectField,
  ContentWorkbenchUnitEditActionButton,
  ContentWorkbenchUnitEditActionRow,
  ContentWorkbenchUnitEditBlockerRow,
  ContentWorkbenchUnitEditEmptyState,
  ContentWorkbenchUnitEditGrid,
  ContentWorkbenchUnitEditRoot,
  ContentWorkbenchUnitEditSection,
  ContentWorkbenchUnitEditTextarea,
  ContentWorkbenchUnitSummaryHeader,
  type ContentWorkbenchEditorSelectOption,
  type ContentWorkbenchInputTone,
  type ContentWorkbenchQuickCreateOption,
} from "./editor";
export {
  ContentWorkbenchReviewPanel,
  type ContentWorkbenchReviewDiff,
  type ContentWorkbenchReviewDiffKind,
  type ContentWorkbenchReviewDiffState,
  type ContentWorkbenchReviewDraft,
  type ContentWorkbenchReviewFieldDiff,
  type ContentWorkbenchReviewModel,
  type ContentWorkbenchReviewPanelProps,
  type ContentWorkbenchReviewQueueSummary,
  type ContentWorkbenchReviewQueueState,
} from "./review";
export {
  ContentWorkbenchShotList,
  ContentWorkbenchShotListActionBar,
  ContentWorkbenchShotListCard,
  ContentWorkbenchShotListFieldButton,
  ContentWorkbenchShotListFieldGrid,
  ContentWorkbenchShotListGrid,
  ContentWorkbenchShotListHeader,
  ContentWorkbenchUnitControlBar,
  ContentWorkbenchUnitExecutionActionRow,
  ContentWorkbenchUnitExecutionCard,
  ContentWorkbenchUnitExecutionDetail,
  ContentWorkbenchUnitExecutionDetailGrid,
  ContentWorkbenchUnitExecutionGrid,
  ContentWorkbenchUnitExecutionRegion,
  ContentWorkbenchUnitExecutionStatus,
  ContentWorkbenchUnitKindFilterButton,
  ContentWorkbenchUnitKindFilterGroup,
  ContentWorkbenchUnitMoveButton,
  ContentWorkbenchUnitScheduleEmpty,
  ContentWorkbenchUnitScheduleFrame,
  ContentWorkbenchUnitScheduleHeader,
  ContentWorkbenchUnitScheduleToolbar,
  ContentWorkbenchUnitSceneBrief,
  ContentWorkbenchUnitInspectorHeader,
  ContentWorkbenchUnitInspectorShell,
  ContentWorkbenchUnitNextActionCard,
  ContentWorkbenchUnitPanelSwitcher,
  ContentWorkbenchUnitPanelTab,
  ContentWorkbenchTimelineBoundary,
  ContentWorkbenchTimelineBlock,
  ContentWorkbenchTimelineGridRow,
  ContentWorkbenchTimelineLane,
  ContentWorkbenchTimelineLaneHeader,
  ContentWorkbenchTimelineLaneMarker,
  ContentWorkbenchTimelineLaneStack,
  ContentWorkbenchTimelinePlayhead,
  ContentWorkbenchTimelineRuler,
  ContentWorkbenchTimelineStatusGroup,
  ContentWorkbenchTimelineTick,
  ContentWorkbenchTimelineViewport,
  ContentWorkbenchTimelineZoomControl,
  ContentWorkbenchUnitTrackActionButton,
  ContentWorkbenchUnitTrackHeader,
  ContentWorkbenchUnitTrackMeta,
  ContentWorkbenchUnitTrackShell,
  type ContentWorkbenchShotListFieldTone,
  type ContentWorkbenchUnitExecutionTone,
  type ContentWorkbenchTimelineBlockTone,
  type ContentWorkbenchUnitMetaTone,
  type ContentWorkbenchUnitActionTone,
} from "./unit-track";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";

import { cn } from "../../../../lib/cn";
import { Badge, Button, type ButtonProps, Input, type InputProps, StatusBadge } from "../../../primitives";
import { ReviewCallout } from "../../review";
import { AppInlineMeta } from "../../app";
import { WorkbenchEmptyState, WorkbenchList, WorkbenchListItem, WorkbenchSurfaceItem, WorkbenchThumbnail } from "../../workbench";

export interface ContentWorkbenchFilterSidebarOption {
  value: string;
  label: string;
  identifier?: string;
  count: number;
}

export function ContentWorkbenchFilterSidebar({
  productionOptions,
  productionValue,
  segmentOptions,
  segmentValue,
  sceneOptions,
  sceneValue,
  query,
  resultCount,
  unitCount,
  onQueryChange,
  onSelectProduction,
  onSelectSegment,
  onSelectScene,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  productionOptions: ContentWorkbenchFilterSidebarOption[];
  productionValue: string;
  segmentOptions: ContentWorkbenchFilterSidebarOption[];
  segmentValue: string;
  sceneOptions: ContentWorkbenchFilterSidebarOption[];
  sceneValue: string;
  query: string;
  resultCount: number;
  unitCount: number;
  onQueryChange: (value: string) => void;
  onSelectProduction: (value: string) => void;
  onSelectSegment: (value: string) => void;
  onSelectScene: (value: string) => void;
}) {
  return (
    <aside className={cn("content-workbench-filter-sidebar", className)} data-testid="content-workbench-filter-sidebar" {...props}>
      <WorkbenchSurfaceItem className="content-workbench-filter-sidebar__summary">
        <div className="content-workbench-filter-sidebar__summary-body">
          <WorkbenchThumbnail icon={SlidersHorizontal} ratio="square" className="content-workbench-filter-sidebar__summary-icon" />
          <span className="content-workbench-filter-sidebar__summary-copy">
            <p className="content-workbench-filter-sidebar__summary-title">分类筛选</p>
            <p className="content-workbench-filter-sidebar__summary-detail">{resultCount} 个情节 · {unitCount} 个制作项</p>
          </span>
        </div>
      </WorkbenchSurfaceItem>

      <WorkbenchSurfaceItem className="content-workbench-filter-sidebar__search">
        <Search size={14} className="content-workbench-filter-sidebar__search-icon" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索情节、制作项、提示词"
          className="content-workbench-filter-sidebar__search-input"
          data-testid="content-workbench-sidebar-search"
        />
      </WorkbenchSurfaceItem>

      <div className="content-workbench-filter-sidebar__groups" data-testid="content-workbench-hierarchy-filter">
        <ContentWorkbenchCategoryFilterGroup
          title="制作分类"
          options={productionOptions}
          value={productionValue}
          testId="content-workbench-production-filter"
          emptyText="暂无制作分类"
          onSelect={onSelectProduction}
        />
        <ContentWorkbenchCategoryFilterGroup
          title="情绪段分类"
          options={segmentOptions}
          value={segmentValue}
          testId="content-workbench-segment-filter"
          emptyText="暂无情绪段"
          onSelect={onSelectSegment}
        />
        <ContentWorkbenchHierarchyFilterColumn
          title="情节导航"
          options={sceneOptions}
          value={sceneValue}
          testId="content-workbench-scene-moment-filter"
          emptyText="当前筛选没有情节"
          onSelect={onSelectScene}
        />
      </div>
    </aside>
  );
}

function ContentWorkbenchHierarchyFilterColumn({
  title,
  options,
  value,
  testId,
  emptyText,
  onSelect,
}: {
  title: string;
  options: ContentWorkbenchFilterSidebarOption[];
  value: string;
  testId: string;
  emptyText: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="content-workbench-hierarchy-filter" data-testid={testId}>
      <div className="content-workbench-filter-group-header">
        <p className="content-workbench-filter-group-header__title">{title}</p>
        <Badge variant="outline">{options.length}</Badge>
      </div>
      {options.length > 0 ? (
        <WorkbenchList className="content-workbench-hierarchy-filter__list">
          {options.map((option) => (
            <ContentWorkbenchHierarchyFilterOption
              key={option.value}
              option={option}
              active={option.value === value}
              onSelect={onSelect}
            />
          ))}
        </WorkbenchList>
      ) : (
        <WorkbenchEmptyState title={emptyText} compact />
      )}
    </div>
  );
}

function ContentWorkbenchHierarchyFilterOption({
  option,
  active,
  onSelect,
}: {
  option: ContentWorkbenchFilterSidebarOption;
  active: boolean;
  onSelect: (value: string) => void;
}) {
  const identifier = option.identifier || hierarchyOptionInitial(option.label);
  return (
    <WorkbenchListItem
      onClick={() => onSelect(option.value)}
      active={active}
      className="content-workbench-hierarchy-filter__option"
    >
      <WorkbenchThumbnail className="content-workbench-hierarchy-filter__thumbnail" data-testid="content-workbench-hierarchy-thumbnail">
        <span className="content-workbench-hierarchy-filter__thumbnail-label">{identifier}</span>
      </WorkbenchThumbnail>
      <span className="content-workbench-hierarchy-filter__option-copy">
        <span className="content-workbench-hierarchy-filter__option-title-row">
          {option.identifier ? <AppInlineMeta className="content-workbench-hierarchy-filter__identifier">{option.identifier}</AppInlineMeta> : null}
          <span className="content-workbench-hierarchy-filter__option-title">{option.label}</span>
        </span>
        <span className="content-workbench-hierarchy-filter__option-count">{option.count} 项</span>
      </span>
    </WorkbenchListItem>
  );
}

function ContentWorkbenchCategoryFilterGroup({
  title,
  options,
  value,
  testId,
  emptyText,
  onSelect,
}: {
  title: string;
  options: ContentWorkbenchFilterSidebarOption[];
  value: string;
  testId: string;
  emptyText: string;
  onSelect: (value: string) => void;
}) {
  return (
    <WorkbenchSurfaceItem density="compact" className="content-workbench-category-filter" data-testid={testId}>
      <div className="content-workbench-filter-group-header">
        <p className="content-workbench-filter-group-header__title">{title}</p>
        <Badge variant="outline">{options.length}</Badge>
      </div>
      {options.length > 0 ? (
        <div className="content-workbench-category-filter__options">
          {options.map((option) => (
            <ContentWorkbenchCategoryFilterButton
              key={option.value}
              option={option}
              active={option.value === value}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : (
        <WorkbenchEmptyState title={emptyText} compact />
      )}
    </WorkbenchSurfaceItem>
  );
}

function ContentWorkbenchCategoryFilterButton({
  option,
  active,
  onSelect,
}: {
  option: ContentWorkbenchFilterSidebarOption;
  active: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <Button
      type="button"
      onClick={() => onSelect(option.value)}
      variant={active ? "soft" : "ghost"}
      size="xs"
      className="content-workbench-category-filter__option"
      data-active={active ? "true" : undefined}
    >
      <span className="content-workbench-category-filter__option-label">{option.label}</span>
      <span className="content-workbench-category-filter__option-count">{option.count}</span>
    </Button>
  );
}

function hierarchyOptionInitial(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return "#";
  const alphaNumeric = trimmed.match(/[A-Za-z0-9]/)?.[0];
  if (alphaNumeric) return alphaNumeric.toUpperCase();
  return trimmed.slice(0, 1);
}

export function ContentWorkbenchCommandCenter({
  sidebar,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  sidebar: ReactNode;
}) {
  return (
    <div className={cn("content-workbench-frame", className)}>
      <div
        className="content-workbench-command-center"
        data-testid="content-workbench-command-center"
        {...props}
      >
        {sidebar}
        {children}
      </div>
    </div>
  );
}

export function ContentWorkbenchMainColumn({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("content-workbench-main-column", className)} data-testid="content-workbench-main-scroll" {...props}>
      {children}
    </div>
  );
}

export function ContentWorkbenchViewHeader({
  icon,
  kicker,
  title,
  detail,
  action,
  emptyMessage,
  emptyAction,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  icon?: ReactNode;
  kicker: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  emptyMessage?: ReactNode;
  emptyAction?: ReactNode;
}) {
  return (
    <section className={cn("content-workbench-view-header", className)} {...props}>
      <div className="content-workbench-view-header__row">
        <div className="content-workbench-view-header__copy">
          <div className="content-workbench-view-header__kicker">
            {icon ? <span className="content-workbench-view-header__icon">{icon}</span> : null}
            {kicker}
          </div>
          <h2 className="content-workbench-view-header__title">{title}</h2>
          {detail ? <p className="content-workbench-view-header__detail">{detail}</p> : null}
        </div>
        {action ? (
          <div className="content-workbench-view-header__action" data-testid="content-workbench-review-action">
            {action}
          </div>
        ) : null}
      </div>
      {emptyMessage ? (
        <div className="content-workbench-view-header__callout">
          <ReviewCallout tone="warning" compact className="content-workbench-filter-callout">
            <p>{emptyMessage}</p>
            {emptyAction}
          </ReviewCallout>
        </div>
      ) : null}
    </section>
  );
}

export const ContentWorkbenchReviewButton = forwardRef<HTMLButtonElement, ButtonProps & {
  pendingCount: number;
  icon?: ReactNode;
}>(({ pendingCount, icon, children, className, variant = "outline", size = "sm", ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant={variant}
    size={size}
    className={cn("content-workbench-review-button", className)}
    data-pending={pendingCount > 0 ? "true" : "false"}
    {...props}
  >
    {icon ? <span className="content-workbench-review-button__icon">{icon}</span> : null}
    <span className="content-workbench-review-button__label">{children}</span>
    <StatusBadge intent={pendingCount > 0 ? "warning" : "neutral"} emphasis="soft">{pendingCount}</StatusBadge>
  </Button>
));

ContentWorkbenchReviewButton.displayName = "ContentWorkbenchReviewButton";

export const ContentWorkbenchEmptyActionButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "outline", size = "sm", ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant={variant}
      size={size}
      className={cn("content-workbench-empty-action-button", className)}
      {...props}
    />
  ),
);

ContentWorkbenchEmptyActionButton.displayName = "ContentWorkbenchEmptyActionButton";

export const ContentWorkbenchCandidateUploadInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "file", ...props }, ref) => (
    <Input
      ref={ref}
      type={type}
      className={cn("content-workbench-candidate-upload-input", className)}
      {...props}
    />
  ),
);

ContentWorkbenchCandidateUploadInput.displayName = "ContentWorkbenchCandidateUploadInput";

export function ContentWorkbenchProductionGrid({
  drawerOpen = false,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  drawerOpen?: boolean;
}) {
  return (
    <div
      className={cn("content-workbench-production-grid", className)}
      data-testid="content-workbench-production-grid"
      data-unit-drawer-open={drawerOpen ? "true" : undefined}
      {...props}
    >
      {children}
    </div>
  );
}

export function ContentWorkbenchProductionMain({
  drawerOpen = false,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  drawerOpen?: boolean;
}) {
  return (
    <div className={cn("content-workbench-production-main", drawerOpen && "content-workbench-production-main--drawer-open", className)} {...props}>
      {children}
    </div>
  );
}

export function ContentWorkbenchDrawerActionRow({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("content-workbench-drawer-action-row", className)} {...props}>
      {children}
    </div>
  );
}

export const ContentWorkbenchDrawerOpenButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "outline", size = "sm", ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant={variant}
      size={size}
      className={cn("content-workbench-drawer-open-button", className)}
      {...props}
    />
  ),
);

ContentWorkbenchDrawerOpenButton.displayName = "ContentWorkbenchDrawerOpenButton";

export function ContentWorkbenchSceneInfoGrid({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("content-workbench-scene-info-grid", className)} {...props}>
      {children}
    </div>
  );
}

export function ContentWorkbenchInfoSection({
  title,
  suffix,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  suffix?: ReactNode;
}) {
  return (
    <WorkbenchSurfaceItem density="compact" className={cn("content-workbench-info-section", className)} {...props}>
      <div className="content-workbench-info-section__header">
        <p className="content-workbench-info-section__title">{title}</p>
        {suffix ? <span className="content-workbench-info-section__suffix">{suffix}</span> : null}
      </div>
      <div className="content-workbench-info-section__items">{children}</div>
    </WorkbenchSurfaceItem>
  );
}

export function ContentWorkbenchInfoText({
  muted = false,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  muted?: boolean;
}) {
  return (
    <p className={cn("content-workbench-info-text", muted && "content-workbench-info-text--muted", className)} {...props}>
      {children}
    </p>
  );
}
