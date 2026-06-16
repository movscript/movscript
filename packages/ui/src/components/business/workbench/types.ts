import type { ComponentType } from "react";

export type WorkbenchDensity = "compact" | "normal";
export type WorkbenchIconComponent = ComponentType<{ size?: string | number; className?: string }>;
export type WorkbenchStatus = "blocked" | "review" | "ready" | "running";
export type WorkbenchPriority = "high" | "medium" | "low";

export interface WorkbenchDecisionRow {
  label: string;
  value: string;
  state?: "note" | "attention" | "positive";
}

export interface WorkbenchGate {
  label: string;
  detail: string;
  done: boolean;
  state?: "required" | "pending" | "passed";
}

export interface WorkbenchLinkRow {
  label: string;
  value: string;
  icon: WorkbenchIconComponent;
}

export interface WorkbenchChromeMetric {
  label: string;
  value: string;
  detail: string;
  icon: WorkbenchIconComponent;
  status: WorkbenchStatus;
}
