import type { ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { AppEmptyState } from "../../../app";
import { Button } from "../../../../primitives";
import type { IconComponent } from "../../types";

export function ReviewProposalEmptyState({
  icon,
  title,
  detail,
  actionLabel,
  actionIcon: ActionIcon,
  onAction,
  className,
}: {
  icon?: IconComponent;
  title: string;
  detail?: string;
  actionLabel?: ReactNode;
  actionIcon?: IconComponent;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("review-proposal-empty-state", className)}>
      <AppEmptyState
        icon={icon}
        title={title}
        detail={detail}
        compact
        className="review-proposal-empty-state__content"
        action={actionLabel ? (
          <Button size="sm" className="review-proposal-empty-state__action" onClick={onAction}>
            {ActionIcon ? <ActionIcon size={12} /> : null}
            {actionLabel}
          </Button>
        ) : undefined}
      />
    </div>
  );
}
