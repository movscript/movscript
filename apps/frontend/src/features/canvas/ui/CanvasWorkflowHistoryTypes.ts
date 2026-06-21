import type { ReactNode } from "react";

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
