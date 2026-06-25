import {
  CanvasWorkflowHistoryCompactItem,
  CanvasWorkflowHistoryCompactList,
  CanvasWorkflowHistoryTable,
  CanvasWorkflowHistoryTableHeader,
  CanvasWorkflowHistoryTableRow,
} from "./CanvasWorkflowHistoryItems";
import {
  CanvasWorkflowHistoryBody,
  CanvasWorkflowHistoryControls,
  CanvasWorkflowHistoryHeader,
  CanvasWorkflowHistoryPageButton,
  CanvasWorkflowHistoryPageIndicator,
  CanvasWorkflowHistoryPanel,
  CanvasWorkflowHistorySelect,
  CanvasWorkflowHistoryState,
} from "./CanvasWorkflowHistoryParts";
import type {
  CanvasWorkflowHistoryStatusFilter,
  CanvasWorkflowHistoryViewProps,
} from "./CanvasWorkflowHistoryTypes";

export * from "./CanvasWorkflowHistoryItems";
export * from "./CanvasWorkflowHistoryParts";
export type * from "./CanvasWorkflowHistoryTypes";

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
