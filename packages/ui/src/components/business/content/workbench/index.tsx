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

import { forwardRef, type ComponentPropsWithoutRef, type HTMLAttributes, type ReactNode } from "react";
import { Search, Trash2 } from "lucide-react";

import { cn } from "../../../../lib/cn";
import { Button, type ButtonProps, Input, type InputProps, StatusBadge } from "../../../primitives";
import { OverlapPane, OverlapPaneGroup } from "../../../layout";
import { ReviewCallout } from "../../review";
import {
  WorkbenchEmptyState,
  WorkbenchList,
  WorkbenchListItem,
  WorkbenchSurfaceItem,
  type WorkbenchStatus,
} from "../../workbench";

export interface ContentWorkbenchFilterSidebarOption {
  value: string;
  label: string;
  identifier?: string;
  count: number;
  detail?: string;
  groupKey?: string;
  groupLabel?: string;
  missingCount?: number;
  status?: WorkbenchStatus;
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
  onDeleteScene,
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
  onDeleteScene?: (value: string) => void;
}) {
  return (
    <aside
      aria-label={`情节导航，${resultCount} 个情节，${unitCount} 个制作项`}
      className={cn("content-workbench-filter-sidebar", className)}
      data-testid="content-workbench-filter-sidebar"
      {...props}
    >
      <div className="content-workbench-filter-sidebar__summary">
        <div className="content-workbench-filter-sidebar__summary-copy">
          <h2 className="content-workbench-filter-sidebar__summary-title">内容结构</h2>
          <p className="content-workbench-filter-sidebar__summary-detail">按情绪段检查情节和制作项。</p>
        </div>
        <div className="content-workbench-filter-sidebar__search">
          <Search size={14} className="content-workbench-filter-sidebar__search-icon" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索"
            className="content-workbench-filter-sidebar__search-input"
            data-testid="content-workbench-sidebar-search"
          />
        </div>
      </div>

      <div className="content-workbench-filter-sidebar__viewport" data-testid="content-workbench-hierarchy-filter">
        <ContentWorkbenchScopeFilters
          productionOptions={productionOptions}
          productionValue={productionValue}
          segmentOptions={segmentOptions}
          segmentValue={segmentValue}
          onSelectProduction={onSelectProduction}
          onSelectSegment={onSelectSegment}
        />
        <ContentWorkbenchHierarchyFilterColumn
          options={sceneOptions}
          value={sceneValue}
          testId="content-workbench-scene-moment-filter"
          emptyText="当前筛选没有情节"
          onSelect={onSelectScene}
          onDelete={onDeleteScene}
        />
      </div>
    </aside>
  );
}

function ContentWorkbenchHierarchyFilterColumn({
  options,
  value,
  testId,
  emptyText,
  onSelect,
  onDelete,
}: {
  options: ContentWorkbenchFilterSidebarOption[];
  value: string;
  testId: string;
  emptyText: string;
  onSelect: (value: string) => void;
  onDelete?: (value: string) => void;
}) {
  const groupedOptions = groupHierarchyOptions(options);
  return (
    <div className="content-workbench-hierarchy-filter" data-testid={testId}>
      {options.length > 0 ? (
        <WorkbenchList className="content-workbench-hierarchy-filter__list">
          {groupedOptions.map((group) => {
            const active = group.options.some((option) => option.value === value);
            return (
              <section
                key={group.key}
                className={cn(
                  "content-workbench-hierarchy-filter__group",
                  active && "content-workbench-hierarchy-filter__group--active",
                )}
              >
                <span className="content-workbench-hierarchy-filter__group-dot" aria-hidden="true" />
                <div className="content-workbench-hierarchy-filter__group-card">
                  <div className="content-workbench-hierarchy-filter__group-header">
                    <span className="content-workbench-hierarchy-filter__group-title">{group.label}</span>
                    <span className="content-workbench-hierarchy-filter__group-count">{group.options.length} 情节</span>
                  </div>
                  <div className="content-workbench-hierarchy-filter__group-items">
                    {group.options.map((option) => (
                      <ContentWorkbenchHierarchyFilterOption
                        key={option.value}
                        option={option}
                        active={option.value === value}
                        onSelect={onSelect}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
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
  onDelete,
}: {
  option: ContentWorkbenchFilterSidebarOption;
  active: boolean;
  onSelect: (value: string) => void;
  onDelete?: (value: string) => void;
}) {
  const identifier = option.identifier || hierarchyOptionInitial(option.label);
  const meta = hierarchyOptionMeta(option);
  return (
    <WorkbenchSurfaceItem
      onClick={() => onSelect(option.value)}
      active={active}
      role="button"
      tabIndex={0}
      className="content-workbench-hierarchy-filter__option"
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect(option.value);
      }}
    >
      <div className="content-workbench-hierarchy-filter__option-body">
        <div className="content-workbench-hierarchy-filter__option-copy">
          <div className="content-workbench-hierarchy-filter__option-title-row">
            <span className="content-workbench-hierarchy-filter__code" data-testid="content-workbench-hierarchy-thumbnail">{identifier}</span>
            <span className="content-workbench-hierarchy-filter__option-title">{option.label}</span>
          </div>
          {option.detail ? <p className="content-workbench-hierarchy-filter__option-detail">{option.detail}</p> : null}
        </div>
        <div className="content-workbench-hierarchy-filter__option-side">
          <span className="content-workbench-hierarchy-filter__option-meta" data-tone={meta.tone}>{meta.label}</span>
          {onDelete ? (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="content-workbench-hierarchy-filter__delete"
              aria-label={`删除情节 ${option.label}`}
              title="删除情节"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDelete(option.value);
              }}
            >
              <Trash2 size={12} />
            </Button>
          ) : null}
        </div>
      </div>
    </WorkbenchSurfaceItem>
  );
}

function hierarchyOptionMeta(option: ContentWorkbenchFilterSidebarOption) {
  if (option.missingCount && option.missingCount > 0) return { label: `${option.missingCount} 缺口`, tone: "warning" };
  if (option.count === 0) return { label: "待拆", tone: "muted" };
  if (option.status === "running") return { label: "生成中", tone: "info" };
  if (option.status === "review") return { label: "待确认", tone: "warning" };
  if (option.status === "blocked") return { label: "待补", tone: "warning" };
  return { label: `${option.count} 项`, tone: "muted" };
}

function groupHierarchyOptions(options: ContentWorkbenchFilterSidebarOption[]) {
  const groups: Array<{
    key: string;
    label: string;
    options: ContentWorkbenchFilterSidebarOption[];
  }> = [];
  const groupByKey = new Map<string, typeof groups[number]>();
  for (const option of options) {
    const key = option.groupKey || option.groupLabel || "ungrouped";
    const label = option.groupLabel || "未绑定情绪段";
    let group = groupByKey.get(key);
    if (!group) {
      group = { key, label, options: [] };
      groups.push(group);
      groupByKey.set(key, group);
    }
    group.options.push(option);
  }
  return groups;
}

function ContentWorkbenchScopeFilters({
  productionOptions,
  productionValue,
  segmentOptions,
  segmentValue,
  onSelectProduction,
  onSelectSegment,
}: {
  productionOptions: ContentWorkbenchFilterSidebarOption[];
  productionValue: string;
  segmentOptions: ContentWorkbenchFilterSidebarOption[];
  segmentValue: string;
  onSelectProduction: (value: string) => void;
  onSelectSegment: (value: string) => void;
}) {
  return (
    <div className="content-workbench-scope-filter">
      <ContentWorkbenchCategoryFilterGroup
        title="制作"
        options={productionOptions}
        value={productionValue}
        testId="content-workbench-production-filter"
        emptyText="暂无制作"
        onSelect={onSelectProduction}
      />
      <ContentWorkbenchCategoryFilterGroup
        title="段落"
        options={segmentOptions}
        value={segmentValue}
        testId="content-workbench-segment-filter"
        emptyText="暂无段落"
        onSelect={onSelectSegment}
      />
    </div>
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
  if (options.length === 0) {
    return (
      <div className="content-workbench-category-filter" data-testid={testId}>
        <span className="content-workbench-category-filter__label">{title}</span>
        <span className="content-workbench-category-filter__empty">{emptyText}</span>
      </div>
    );
  }

  return (
    <div className="content-workbench-category-filter" data-testid={testId}>
      <span className="content-workbench-category-filter__label">{title}</span>
      <div className="content-workbench-category-filter__options">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            variant={option.value === value ? "soft" : "ghost"}
            size="xs"
            className="content-workbench-category-filter__option"
            data-active={option.value === value ? "true" : undefined}
          >
            <span className="content-workbench-category-filter__option-label">{option.label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

function hierarchyOptionInitial(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return "#";
  const alphaNumeric = trimmed.match(/[A-Za-z0-9]/)?.[0];
  if (alphaNumeric) return alphaNumeric.toUpperCase();
  return trimmed.slice(0, 1);
}

export function ContentWorkbenchWorkspaceShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-workspace-shell", className)} {...props} />;
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
      <OverlapPaneGroup
        className="content-workbench-command-center"
        data-testid="content-workbench-command-center"
        {...props}
      >
        {sidebar}
        {children}
      </OverlapPaneGroup>
    </div>
  );
}

export function ContentWorkbenchMainColumn({
  children,
  className,
  resizeHandleSide = "left",
  ...props
}: Omit<ComponentPropsWithoutRef<typeof OverlapPane>, "as" | "side">) {
  return (
    <OverlapPane
      as="main"
      side="left"
      resizeHandleSide={resizeHandleSide}
      className={cn("content-workbench-main-column", className)}
      {...props}
    >
      {children}
    </OverlapPane>
  );
}

export function ContentWorkbenchDetailContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-workbench-detail-content", className)} data-testid="content-workbench-main-scroll" {...props} />;
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
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <OverlapPaneGroup
      as="section"
      className={cn("content-workbench-production-grid", className)}
      data-testid="content-workbench-production-grid"
      {...props}
    >
      {children}
    </OverlapPaneGroup>
  );
}

export function ContentWorkbenchProductionMain({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("content-workbench-production-main", className)} {...props}>
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
