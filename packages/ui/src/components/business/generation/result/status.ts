import type { StatusIntent } from "../../../primitives";

export type GenerationResultStatus = "idle" | "pending" | "running" | "done" | "failed" | "cancelled";

export function generationResultStatusIntent(status: GenerationResultStatus): StatusIntent {
  if (status === "done") return "success";
  if (status === "pending" || status === "running") return "info";
  if (status === "failed") return "danger";
  return "neutral";
}
