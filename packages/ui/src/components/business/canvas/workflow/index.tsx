import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { AppChoiceTile, AppCodeBlock, AppEmptyState, AppMarkerDot, AppMediaFrame, AppSurfaceItem } from "../../app";
import {
  Badge,
  Button,
  CheckboxField,
  Input,
  Label,
  NativeSelect,
  StatusBadge,
  Textarea,
  type ButtonProps,
  type CheckboxFieldProps,
  type InputProps,
  type NativeSelectProps,
  type TextareaProps,
} from "../../../primitives";
import type { StatusIntent } from "../../../primitives";

type DivAttributesWithoutTitle = Omit<HTMLAttributes<HTMLDivElement>, "title">;

export type CanvasWorkflowRunStatus = "pending" | "running" | "done" | "failed";
export type CanvasWorkflowPanelTab = "resources" | "history";

export type CanvasWorkflowHistoryStatusFilter = "all" | CanvasWorkflowRunStatus;

export type CanvasWorkflowHistoryStatusOption = {
  value: CanvasWorkflowHistoryStatusFilter;
  label: ReactNode;
};

export type CanvasWorkflowHistoryItem = {
  id: string;
  runLabel: ReactNode;
  status: ReactNode;
  duration: ReactNode;
  snapshot: ReactNode;
  startedAt: ReactNode;
  error?: ReactNode;
};

export type CanvasWorkflowHistoryViewProps = {
  embedded?: boolean;
  compact?: boolean;
  icon?: ReactNode;
  filterIcon?: ReactNode;
  title: string;
  description: string;
  loading?: boolean;
  loadingIcon?: ReactNode;
  loadingLabel: ReactNode;
  emptyLabel: ReactNode;
  items: CanvasWorkflowHistoryItem[];
  tableLabels: {
    run: ReactNode;
    status: ReactNode;
    duration: ReactNode;
    snapshot: ReactNode;
    startedAt: ReactNode;
  };
  statusFilter: CanvasWorkflowHistoryStatusFilter;
  statusOptions: CanvasWorkflowHistoryStatusOption[];
  page: number;
  pageCount: number;
  previousIcon?: ReactNode;
  nextIcon?: ReactNode;
  activeRunId?: string | null;
  onStatusFilterChange: (status: CanvasWorkflowHistoryStatusFilter) => void;
  onPageChange: (page: number) => void;
  onSelectRun: (runId: string) => void;
};

export type CanvasWorkflowRunResultsAction = {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  tone?: ButtonProps["tone"];
  loading?: boolean;
  disabled?: boolean;
  href?: string;
  download?: string;
  onClick?: () => void;
};

export type CanvasWorkflowRunResultsItem = {
  key: string;
  title: ReactNode;
  type: ReactNode;
  meta: ReactNode;
  removed?: boolean;
  removedLabel?: ReactNode;
  media?: ReactNode;
  code?: ReactNode;
  actions: CanvasWorkflowRunResultsAction[];
};

export type CanvasWorkflowRunResultsViewProps = {
  title: ReactNode;
  description?: ReactNode;
  closeLabel: ReactNode;
  emptyTitle: ReactNode;
  items: CanvasWorkflowRunResultsItem[];
  onClose: () => void;
};

type CanvasWorkflowHistoryHeaderProps = DivAttributesWithoutTitle & {
  compact?: boolean;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

function runStatusIntent(status: CanvasWorkflowRunStatus): StatusIntent {
  if (status === "done") return "success";
  if (status === "failed") return "danger";
  return "neutral";
}

export function CanvasRunStatusBadge({
  status,
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  status: CanvasWorkflowRunStatus;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const loading = status === "running" || status === "pending";
  if (loading) {
    return (
      <Badge data-loading="true" className={cn("canvas-run-status-badge", className)} {...props}>
        {icon ? <span className="canvas-run-status-badge__icon">{icon}</span> : null}
        {children}
      </Badge>
    );
  }
  return (
    <StatusBadge intent={runStatusIntent(status)} className={cn("canvas-run-status-badge", className)} {...props}>
      {icon ? <span className="canvas-run-status-badge__icon">{icon}</span> : null}
      {children}
    </StatusBadge>
  );
}

export function CanvasWorkflowHistoryView({
  embedded = false,
  compact = false,
  icon,
  filterIcon,
  title,
  description,
  loading = false,
  loadingIcon,
  loadingLabel,
  emptyLabel,
  items,
  tableLabels,
  statusFilter,
  statusOptions,
  page,
  pageCount,
  previousIcon,
  nextIcon,
  activeRunId,
  onStatusFilterChange,
  onPageChange,
  onSelectRun,
}: CanvasWorkflowHistoryViewProps) {
  const statusSelect = (
    <CanvasWorkflowHistorySelect
      value={statusFilter}
      onChange={(event) => onStatusFilterChange(event.target.value as CanvasWorkflowHistoryStatusFilter)}
    >
      {statusOptions.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </CanvasWorkflowHistorySelect>
  );
  const pageControls = (
    <>
      <CanvasWorkflowHistoryPageButton onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
        {previousIcon}
      </CanvasWorkflowHistoryPageButton>
      <CanvasWorkflowHistoryPageIndicator>{page}/{pageCount}</CanvasWorkflowHistoryPageIndicator>
      <CanvasWorkflowHistoryPageButton onClick={() => onPageChange(Math.min(pageCount, page + 1))} disabled={page >= pageCount}>
        {nextIcon}
      </CanvasWorkflowHistoryPageButton>
    </>
  );

  return (
    <CanvasWorkflowHistoryPanel embedded={embedded} compact={compact}>
      <CanvasWorkflowHistoryHeader
        compact={compact}
        icon={icon}
        title={title}
        description={description}
        actions={(
          <CanvasWorkflowHistoryControls>
            {!compact ? filterIcon : null}
            {statusSelect}
            {pageControls}
          </CanvasWorkflowHistoryControls>
        )}
      />
      <CanvasWorkflowHistoryBody>
        {loading ? (
          <CanvasWorkflowHistoryState icon={loadingIcon}>{loadingLabel}</CanvasWorkflowHistoryState>
        ) : null}
        {!loading && items.length === 0 ? (
          <CanvasWorkflowHistoryState>{emptyLabel}</CanvasWorkflowHistoryState>
        ) : null}
        {!loading && items.length > 0 ? (
          compact ? (
            <CanvasWorkflowHistoryCompactList>
              {items.map((item) => (
                <CanvasWorkflowHistoryCompactItem
                  key={item.id}
                  type="button"
                  selected={activeRunId === item.id}
                  onClick={() => onSelectRun(item.id)}
                  runLabel={item.runLabel}
                  status={item.status}
                  startedAt={item.startedAt}
                  duration={item.duration}
                  snapshot={item.snapshot}
                  error={item.error}
                />
              ))}
            </CanvasWorkflowHistoryCompactList>
          ) : (
            <CanvasWorkflowHistoryTable>
              <CanvasWorkflowHistoryTableHeader
                run={tableLabels.run}
                status={tableLabels.status}
                duration={tableLabels.duration}
                snapshot={tableLabels.snapshot}
                startedAt={tableLabels.startedAt}
              />
              {items.map((item) => (
                <CanvasWorkflowHistoryTableRow
                  key={item.id}
                  selected={activeRunId === item.id}
                  onClick={() => onSelectRun(item.id)}
                  runLabel={item.runLabel}
                  status={item.status}
                  duration={item.duration}
                  snapshot={item.snapshot}
                  error={item.error}
                  startedAt={item.startedAt}
                />
              ))}
            </CanvasWorkflowHistoryTable>
          )
        ) : null}
      </CanvasWorkflowHistoryBody>
    </CanvasWorkflowHistoryPanel>
  );
}

export function CanvasWorkflowHistoryPanel({
  embedded = false,
  compact = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  embedded?: boolean;
  compact?: boolean;
}) {
  return (
    <section
      data-embedded={embedded ? "true" : undefined}
      data-compact={compact ? "true" : undefined}
      className={cn("canvas-workflow-history", className)}
      {...props}
    />
  );
}

export function CanvasWorkflowHistoryHeader({
  compact = false,
  icon,
  title,
  description,
  actions,
  className,
  ...props
}: CanvasWorkflowHistoryHeaderProps) {
  return (
    <div data-compact={compact ? "true" : undefined} className={cn("canvas-workflow-history__header", className)} {...props}>
      <div className="canvas-workflow-history__title-row">
        {icon ? <span className="canvas-workflow-history__header-icon">{icon}</span> : null}
        <span className="canvas-workflow-history__title-body">
          <span className="canvas-workflow-history__title">{title}</span>
          {description ? <span className="canvas-workflow-history__description">{description}</span> : null}
        </span>
      </div>
      {actions ? <div className="canvas-workflow-history__actions">{actions}</div> : null}
    </div>
  );
}

export function CanvasWorkflowHistoryControls({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-history__controls", className)} {...props} />;
}

export const CanvasWorkflowHistorySelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, ...props }, ref) => (
    <NativeSelect ref={ref} className={cn("canvas-workflow-history__select", className)} {...props} />
  )
);

CanvasWorkflowHistorySelect.displayName = "CanvasWorkflowHistorySelect";

export const CanvasWorkflowHistoryPageButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "outline", size = "sm", ...props }, ref) => (
    <Button ref={ref} variant={variant} size={size} className={cn("canvas-workflow-history__page-button", className)} {...props} />
  )
);

CanvasWorkflowHistoryPageButton.displayName = "CanvasWorkflowHistoryPageButton";

export function CanvasWorkflowHistoryPageIndicator({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
}) {
  return (
    <span className={cn("canvas-workflow-history__page-indicator", className)} {...props}>
      {children}
    </span>
  );
}

export function CanvasWorkflowHistoryDuration({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className={cn("canvas-workflow-history-duration", className)} {...props}>
      {icon ? <span className="canvas-workflow-history-duration__icon">{icon}</span> : null}
      <span className="canvas-workflow-history-duration__label">{children}</span>
    </span>
  );
}

export function CanvasWorkflowHistoryBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-history__body", className)} {...props} />;
}

export function CanvasWorkflowHistoryState({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-workflow-history__state", className)} {...props}>
      {icon ? <span className="canvas-workflow-history__state-icon">{icon}</span> : null}
      {children}
    </div>
  );
}

export function CanvasWorkflowHistoryCompactList({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-history__compact-list", className)} {...props} />;
}

export const CanvasWorkflowHistoryCompactItem = forwardRef<HTMLButtonElement, ButtonProps & {
  selected?: boolean;
  runLabel: ReactNode;
  status: ReactNode;
  startedAt: ReactNode;
  duration: ReactNode;
  snapshot: ReactNode;
  error?: ReactNode;
}>(({ selected = false, runLabel, status, startedAt, duration, snapshot, error, className, ...props }, ref) => (
  <AppChoiceTile
    ref={ref}
    selected={selected}
    variant={selected ? "soft" : "ghost"}
    className={cn("canvas-workflow-history-compact-item", className)}
    {...props}
  >
    <span className="canvas-workflow-history-compact-item__header">
      <span className="canvas-workflow-history-compact-item__run">{runLabel}</span>
      {status}
      <span className="canvas-workflow-history-compact-item__time">{startedAt}</span>
    </span>
    <span className="canvas-workflow-history-compact-item__meta">
      <span className="canvas-workflow-history-compact-item__duration">{duration}</span>
      <AppMarkerDot tone="border" size="2xs" />
      <span className="canvas-workflow-history-compact-item__snapshot">{snapshot}</span>
    </span>
    {error ? <span className="canvas-workflow-history-compact-item__error" title={String(error)}>{error}</span> : null}
  </AppChoiceTile>
));

CanvasWorkflowHistoryCompactItem.displayName = "CanvasWorkflowHistoryCompactItem";

export function CanvasWorkflowHistoryTable({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-history-table", className)} {...props} />;
}

export function CanvasWorkflowHistoryTableHeader({
  run,
  status,
  duration,
  snapshot,
  startedAt,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  run: ReactNode;
  status: ReactNode;
  duration: ReactNode;
  snapshot: ReactNode;
  startedAt: ReactNode;
}) {
  return (
    <AppSurfaceItem variant="muted" className={cn("canvas-workflow-history-table__header", className)} {...props}>
      <span>{run}</span>
      <span>{status}</span>
      <span>{duration}</span>
      <span>{snapshot}</span>
      <span className="canvas-workflow-history-table__right">{startedAt}</span>
    </AppSurfaceItem>
  );
}

export const CanvasWorkflowHistoryTableRow = forwardRef<HTMLButtonElement, ButtonProps & {
  selected?: boolean;
  runLabel: ReactNode;
  status: ReactNode;
  duration: ReactNode;
  snapshot: ReactNode;
  error?: ReactNode;
  startedAt: ReactNode;
}>(({ selected = false, runLabel, status, duration, snapshot, error, startedAt, className, ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant="ghost"
    data-selected={selected ? "true" : undefined}
    className={cn("canvas-workflow-history-table__row", className)}
    {...props}
  >
    <span className="canvas-workflow-history-table__run">{runLabel}</span>
    {status}
    <span className="canvas-workflow-history-table__duration">{duration}</span>
    <span className="canvas-workflow-history-table__snapshot" title={error ? String(error) : undefined}>
      {snapshot}
      {error ? <span className="canvas-workflow-history-table__error">{error}</span> : null}
    </span>
    <span className="canvas-workflow-history-table__time">{startedAt}</span>
  </Button>
));

CanvasWorkflowHistoryTableRow.displayName = "CanvasWorkflowHistoryTableRow";

export function CanvasWorkflowSideRail({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <aside className={cn("canvas-workflow-side-rail", className)} {...props} />;
}

export function CanvasWorkflowSidePanel({
  width,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLElement> & {
  width: number;
}) {
  return <aside className={cn("canvas-workflow-side-panel", className)} style={{ ...style, width }} {...props} />;
}

export function CanvasWorkflowSideHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-side-panel__header", className)} {...props} />;
}

export function CanvasWorkflowSideBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-side-panel__body", className)} {...props} />;
}

export function CanvasWorkflowSideTabGroup({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-side-panel__tabs", className)} {...props} />;
}

export const CanvasWorkflowSideTabButton = forwardRef<HTMLButtonElement, ButtonProps & {
  active?: boolean;
}>(({ active = false, className, variant, size = "sm", ...props }, ref) => (
  <Button
    ref={ref}
    variant={variant ?? (active ? "solid" : "ghost")}
    size={size}
    data-active={active ? "true" : undefined}
    className={cn("canvas-workflow-side-panel__tab", className)}
    {...props}
  />
));

CanvasWorkflowSideTabButton.displayName = "CanvasWorkflowSideTabButton";

export function CanvasWorkflowSideTabLabel({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("canvas-workflow-side-panel__tab-label", className)} {...props} />;
}

export const CanvasWorkflowSideIconButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "ghost", size = "icon-sm", ...props }, ref) => (
    <Button ref={ref} variant={variant} size={size} className={cn("canvas-workflow-side-panel__icon-button", className)} {...props} />
  )
);

CanvasWorkflowSideIconButton.displayName = "CanvasWorkflowSideIconButton";

export function CanvasWorkflowRunResultsOverlay({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-run-results-overlay", className)} {...props} />;
}

export function CanvasWorkflowRunResultsView({
  title,
  description,
  closeLabel,
  emptyTitle,
  items,
  onClose,
}: CanvasWorkflowRunResultsViewProps) {
  return (
    <CanvasWorkflowRunResultsOverlay>
      <CanvasWorkflowRunResultsShell>
        <CanvasWorkflowRunResultsHeader
          title={title}
          description={description}
          action={(
            <CanvasWorkflowRunResultsCloseButton onClick={onClose}>
              {closeLabel}
            </CanvasWorkflowRunResultsCloseButton>
          )}
        />
        <CanvasWorkflowRunResultsBody>
          {items.length === 0 ? (
            <CanvasWorkflowRunResultsEmpty title={emptyTitle} />
          ) : (
            <CanvasWorkflowRunResultsGrid>
              {items.map((item) => (
                <CanvasWorkflowRunResultsItemCard key={item.key} item={item} />
              ))}
            </CanvasWorkflowRunResultsGrid>
          )}
        </CanvasWorkflowRunResultsBody>
      </CanvasWorkflowRunResultsShell>
    </CanvasWorkflowRunResultsOverlay>
  );
}

function CanvasWorkflowRunResultsItemCard({
  item,
}: {
  item: CanvasWorkflowRunResultsItem;
}) {
  return (
    <CanvasWorkflowRunResultsCard removed={item.removed}>
      <CanvasWorkflowRunResultsMediaFrame>
        {item.removed ? (
          <CanvasWorkflowRunResultsRemovedState>
            {item.removedLabel}
          </CanvasWorkflowRunResultsRemovedState>
        ) : item.media ? (
          item.media
        ) : (
          <CanvasWorkflowRunResultsCodeBlock>
            {item.code}
          </CanvasWorkflowRunResultsCodeBlock>
        )}
      </CanvasWorkflowRunResultsMediaFrame>
      <CanvasWorkflowRunResultsCardBody>
        <CanvasWorkflowRunResultsCardContent>
          <CanvasWorkflowRunResultsTitleRow>
            <CanvasWorkflowRunResultsTitle>{item.title}</CanvasWorkflowRunResultsTitle>
            <CanvasWorkflowRunResultsTypeBadge>{item.type}</CanvasWorkflowRunResultsTypeBadge>
          </CanvasWorkflowRunResultsTitleRow>
          <CanvasWorkflowRunResultsMeta>{item.meta}</CanvasWorkflowRunResultsMeta>
        </CanvasWorkflowRunResultsCardContent>
        <CanvasWorkflowRunResultsActions>
          {item.actions.map((action) => (
            <CanvasWorkflowRunResultsAction key={action.key} action={action} />
          ))}
        </CanvasWorkflowRunResultsActions>
      </CanvasWorkflowRunResultsCardBody>
    </CanvasWorkflowRunResultsCard>
  );
}

function CanvasWorkflowRunResultsAction({
  action,
}: {
  action: CanvasWorkflowRunResultsAction;
}) {
  const content = (
    <>
      {action.icon}
      {action.label}
    </>
  );
  if (action.href && !action.disabled) {
    return (
      <CanvasWorkflowRunResultsActionButton asChild tone={action.tone} loading={action.loading}>
        <a href={action.href} download={action.download}>
          {content}
        </a>
      </CanvasWorkflowRunResultsActionButton>
    );
  }
  return (
    <CanvasWorkflowRunResultsActionButton
      tone={action.tone}
      loading={action.loading}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      {content}
    </CanvasWorkflowRunResultsActionButton>
  );
}

export function CanvasWorkflowRunResultsShell({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem variant="overlay" className={cn("canvas-workflow-run-results-shell", className)} {...props} />;
}

export function CanvasWorkflowRunResultsHeader({
  title,
  description,
  action,
  className,
  ...props
}: DivAttributesWithoutTitle & {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={cn("canvas-workflow-run-results-header", className)} {...props}>
      <div className="canvas-workflow-run-results-header__body">
        <h2 className="canvas-workflow-run-results-header__title">{title}</h2>
        {description ? <p className="canvas-workflow-run-results-header__description">{description}</p> : null}
      </div>
      {action ? <div className="canvas-workflow-run-results-header__action">{action}</div> : null}
    </div>
  );
}

export const CanvasWorkflowRunResultsCloseButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "outline", size = "sm", ...props }, ref) => (
    <Button ref={ref} variant={variant} size={size} className={cn("canvas-workflow-run-results-close", className)} {...props} />
  )
);

CanvasWorkflowRunResultsCloseButton.displayName = "CanvasWorkflowRunResultsCloseButton";

export function CanvasWorkflowRunResultsBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-run-results-body", className)} {...props} />;
}

export function CanvasWorkflowRunResultsEmpty({
  title,
  className,
  ...props
}: DivAttributesWithoutTitle & {
  title: ReactNode;
}) {
  return <AppEmptyState compact title={title} className={cn("canvas-workflow-run-results-empty", className)} {...props} />;
}

export function CanvasWorkflowRunResultsGrid({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-run-results-grid", className)} {...props} />;
}

export function CanvasWorkflowRunResultsCard({
  removed = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  removed?: boolean;
}) {
  return (
    <AppSurfaceItem
      data-removed={removed ? "true" : undefined}
      className={cn("canvas-workflow-run-results-card", className)}
      {...props}
    />
  );
}

export function CanvasWorkflowRunResultsMediaFrame({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <AppMediaFrame variant="stage" className={cn("canvas-workflow-run-results-media", className)} {...props} />;
}

export function CanvasWorkflowRunResultsRemovedState({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-run-results-removed", className)} {...props} />;
}

export function CanvasWorkflowRunResultsCodeBlock({
  className,
  ...props
}: HTMLAttributes<HTMLPreElement>) {
  return <AppCodeBlock className={cn("canvas-workflow-run-results-code", className)} {...props} />;
}

export function CanvasWorkflowRunResultsCardBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-run-results-card__body", className)} {...props} />;
}

export function CanvasWorkflowRunResultsCardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-run-results-card__content", className)} {...props} />;
}

export function CanvasWorkflowRunResultsTitleRow({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-run-results-card__title-row", className)} {...props} />;
}

export function CanvasWorkflowRunResultsTitle({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("canvas-workflow-run-results-card__title", className)} {...props} />;
}

export function CanvasWorkflowRunResultsTypeBadge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <Badge variant="outline" className={cn("canvas-workflow-run-results-card__type", className)} {...props} />;
}

export function CanvasWorkflowRunResultsMeta({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("canvas-workflow-run-results-card__meta", className)} {...props} />;
}

export function CanvasWorkflowRunResultsActions({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-run-results-card__actions", className)} {...props} />;
}

export const CanvasWorkflowRunResultsActionButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "outline", size = "sm", ...props }, ref) => (
    <Button ref={ref} variant={variant} size={size} className={cn("canvas-workflow-run-results-card__action", className)} {...props} />
  )
);

CanvasWorkflowRunResultsActionButton.displayName = "CanvasWorkflowRunResultsActionButton";

export function CanvasRuntimeInputDialogShell({
  size = "workflow",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  size?: "workflow" | "node";
}) {
  return (
    <div className="canvas-runtime-input-dialog-overlay">
      <AppSurfaceItem
        variant="overlay"
        data-size={size}
        className={cn("canvas-runtime-input-dialog", className)}
        {...props}
      />
    </div>
  );
}

export function CanvasRuntimeInputDialogHeader({
  title,
  description,
  className,
  ...props
}: DivAttributesWithoutTitle & {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className={cn("canvas-runtime-input-dialog__header", className)} {...props}>
      <h2 className="canvas-runtime-input-dialog__title">{title}</h2>
      {description ? <p className="canvas-runtime-input-dialog__description">{description}</p> : null}
    </div>
  );
}

export function CanvasRuntimeInputDialogBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-runtime-input-dialog__body", className)} {...props} />;
}

export function CanvasRuntimeInputDialogField({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-runtime-input-dialog__field", className)} {...props} />;
}

export function CanvasRuntimeInputDialogFieldLabel({
  label,
  portType,
  required = false,
  className,
  ...props
}: HTMLAttributes<HTMLLabelElement> & {
  label: ReactNode;
  portType?: ReactNode;
  required?: boolean;
}) {
  return (
    <Label className={cn("canvas-runtime-input-dialog__label", className)} {...props}>
      <span className="canvas-runtime-input-dialog__label-text">{label}</span>
      {portType ? <span className="canvas-runtime-input-dialog__port-type">({portType})</span> : null}
      {required ? <span className="canvas-runtime-input-dialog__required">*</span> : null}
    </Label>
  );
}

export const CanvasRuntimeInputDialogCheckbox = forwardRef<HTMLInputElement, CheckboxFieldProps>(
  ({ className, ...props }, ref) => (
    <CheckboxField ref={ref} className={cn("canvas-runtime-input-dialog__checkbox", className)} {...props} />
  )
);

CanvasRuntimeInputDialogCheckbox.displayName = "CanvasRuntimeInputDialogCheckbox";

export const CanvasRuntimeInputDialogInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <Input ref={ref} className={cn("canvas-runtime-input-dialog__input", className)} {...props} />
  )
);

CanvasRuntimeInputDialogInput.displayName = "CanvasRuntimeInputDialogInput";

export const CanvasRuntimeInputDialogTextarea = forwardRef<HTMLTextAreaElement, TextareaProps & {
  code?: boolean;
}>(({ code = false, className, ...props }, ref) => (
  <Textarea
    ref={ref}
    data-code={code ? "true" : undefined}
    className={cn("canvas-runtime-input-dialog__textarea", className)}
    {...props}
  />
));

CanvasRuntimeInputDialogTextarea.displayName = "CanvasRuntimeInputDialogTextarea";

export function CanvasRuntimeInputDialogActions({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-runtime-input-dialog__actions", className)} {...props} />;
}

export const CanvasRuntimeInputDialogActionButton = forwardRef<HTMLButtonElement, ButtonProps & {
  stretch?: boolean;
}>(({ stretch = false, className, ...props }, ref) => (
  <Button
    ref={ref}
    data-stretch={stretch ? "true" : undefined}
    className={cn("canvas-runtime-input-dialog__action", className)}
    {...props}
  />
));

CanvasRuntimeInputDialogActionButton.displayName = "CanvasRuntimeInputDialogActionButton";
