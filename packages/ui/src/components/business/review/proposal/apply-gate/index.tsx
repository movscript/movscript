import { ReviewCallout } from "../../callout";
import type { SemanticTone } from "../../../../../semantic";
import type { IconComponent } from "../../types";

export type ReviewProposalApplyGateStatus = "ready" | "blocked" | "needs_preview" | "empty";

export function ReviewProposalApplyGatePanel({
  status,
  icon,
  title,
  detail,
  compact = false,
}: {
  status: ReviewProposalApplyGateStatus;
  icon?: IconComponent;
  title: string;
  detail?: string;
  compact?: boolean;
}) {
  return (
    <ReviewCallout tone={reviewProposalApplyGateTone(status)} icon={icon} title={title} compact={compact}>
      {!compact && detail ? <p className="review-proposal-apply-gate-detail">{detail}</p> : null}
    </ReviewCallout>
  );
}

function reviewProposalApplyGateTone(status: ReviewProposalApplyGateStatus): SemanticTone {
  if (status === "ready") return "success";
  if (status === "blocked") return "danger";
  if (status === "empty") return "neutral";
  return "warning";
}
