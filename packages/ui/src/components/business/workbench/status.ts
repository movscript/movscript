import type { StatusIntent } from "../../primitives";
import type { WorkbenchDecisionRow, WorkbenchPriority, WorkbenchStatus } from "./types";

export function workbenchStatusIntent(status: WorkbenchStatus): StatusIntent {
  if (status === "blocked") return "warning";
  if (status === "ready") return "success";
  if (status === "running") return "info";
  return "neutral";
}

export function workbenchStatusLabel(status: WorkbenchStatus) {
  if (status === "blocked") return "补信息";
  if (status === "ready") return "可生成";
  if (status === "running") return "生成中";
  return "确认内容";
}

export function workbenchPriorityIntent(priority: WorkbenchPriority): StatusIntent {
  if (priority === "high") return "danger";
  if (priority === "medium") return "warning";
  return "neutral";
}

export function workbenchPriorityLabel(priority: WorkbenchPriority) {
  if (priority === "high") return "优先处理";
  if (priority === "medium") return "正常处理";
  return "后续处理";
}

export function workbenchDecisionIntent(state?: WorkbenchDecisionRow["state"]): StatusIntent {
  if (state === "positive") return "success";
  if (state === "attention") return "warning";
  return "neutral";
}
