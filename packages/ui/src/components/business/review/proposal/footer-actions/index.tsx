import type { ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Button } from "../../../../primitives";

export function ReviewProposalFooterActions({
  previewOnly,
  applying,
  simulating,
  canApply,
  onResetDecisions,
  onDiscard,
  onSimulate,
  onApply,
  discardLabel = "放弃提案",
  simulateIcon,
  applyIcon,
}: {
  previewOnly: boolean;
  applying: boolean;
  simulating: boolean;
  canApply: boolean;
  discardLabel?: string;
  onResetDecisions: () => void;
  onDiscard: () => void;
  onSimulate: () => void;
  onApply: () => void;
  simulateIcon?: ReactNode;
  applyIcon?: ReactNode;
}) {
  return (
    <div className={cn("review-proposal-footer-actions", previewOnly ? "review-proposal-footer-actions--preview" : "review-proposal-footer-actions--apply")}>
      <Button
        size="sm"
        variant="outline"
        className="review-proposal-footer-actions__button"
        disabled={applying || simulating}
        onClick={previewOnly ? onResetDecisions : onDiscard}
      >
        {previewOnly ? "清空决策" : discardLabel}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="review-proposal-footer-actions__button"
        loading={simulating}
        disabled={applying || simulating}
        onClick={onSimulate}
      >
        {simulateIcon}
        预检影响
      </Button>
      {!previewOnly && (
        <Button
          size="sm"
          className="review-proposal-footer-actions__button"
          loading={applying}
          disabled={applying || simulating || !canApply}
          onClick={onApply}
        >
          {applyIcon}
          应用提案到项目
        </Button>
      )}
    </div>
  );
}
