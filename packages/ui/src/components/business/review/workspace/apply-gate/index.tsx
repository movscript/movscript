import { ReviewCallout } from "../../callout";
import type { SemanticTone } from "../../../../../semantic";
import type { IconComponent } from "../../types";

export type ReviewWorkspaceApplyGateStatus = "ready" | "blocked" | "needs_preview" | "empty";

export function ReviewWorkspaceApplyGatePanel({
  status,
  icon,
  title,
  detail,
  compact = false,
}: {
  status: ReviewWorkspaceApplyGateStatus;
  icon?: IconComponent;
  title: string;
  detail?: string;
  compact?: boolean;
}) {
  return (
    <ReviewCallout tone={reviewWorkspaceApplyGateTone(status)} icon={icon} title={title} compact={compact}>
      {!compact && detail ? <p className="review-workspace-apply-gate-detail">{detail}</p> : null}
    </ReviewCallout>
  );
}

function reviewWorkspaceApplyGateTone(status: ReviewWorkspaceApplyGateStatus): SemanticTone {
  if (status === "ready") return "success";
  if (status === "blocked") return "danger";
  if (status === "empty") return "neutral";
  return "warning";
}
