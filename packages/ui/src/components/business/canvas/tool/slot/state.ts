import type { CanvasToolSlotState } from "../types";

export function canvasToolSlotStateLabel(state: CanvasToolSlotState) {
  if (state === "ready") return "已就绪";
  if (state === "pending") return "处理中";
  if (state === "failed") return "失败";
  return "未绑定";
}
