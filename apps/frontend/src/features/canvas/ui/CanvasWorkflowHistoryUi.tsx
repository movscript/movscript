import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/shared/ui/cn";
import { AppChoiceTile, AppMarkerDot, AppSurfaceItem } from "@movscript/ui/business/app";
import { Badge, Button, NativeSelect, StatusBadge, type ButtonProps, type NativeSelectProps, type StatusIntent } from "@movscript/ui/primitives";

type DivAttributesWithoutTitle = Omit<HTMLAttributes<HTMLDivElement>, "title">;

export type CanvasWorkflowRunStatus = "pending" | "running" | "done" | "failed";
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
    <span className="canvas-workflow-history-table__row-content">
      <span className="canvas-workflow-history-table__run">{runLabel}</span>
      {status}
      <span className="canvas-workflow-history-table__duration">{duration}</span>
      <span className="canvas-workflow-history-table__snapshot" title={error ? String(error) : undefined}>
        {snapshot}
        {error ? <span className="canvas-workflow-history-table__error">{error}</span> : null}
      </span>
      <span className="canvas-workflow-history-table__time">{startedAt}</span>
    </span>
  </Button>
));

CanvasWorkflowHistoryTableRow.displayName = "CanvasWorkflowHistoryTableRow";
