import type { ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Button } from "../../../../primitives";

export function ReviewWorkspaceFooterActions({
  previewOnly,
  applying,
  simulating,
  canApply,
  onResetDecisions,
  onDiscard,
  onSimulate,
  onApply,
  discardLabel = "放弃工作区",
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
    <div className={cn("review-workspace-footer-actions", previewOnly ? "review-workspace-footer-actions--preview" : "review-workspace-footer-actions--apply")}>
      <Button
        size="sm"
        variant="outline"
        className="review-workspace-footer-actions__button"
        disabled={applying || simulating}
        onClick={previewOnly ? onResetDecisions : onDiscard}
      >
        {previewOnly ? "清空决策" : discardLabel}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="review-workspace-footer-actions__button"
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
          className="review-workspace-footer-actions__button"
          loading={applying}
          disabled={applying || simulating || !canApply}
          onClick={onApply}
        >
          {applyIcon}
          应用工作区到项目
        </Button>
      )}
    </div>
  );
}
