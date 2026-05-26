import * as React from "react";

import { cn } from "../../../../lib/cn";
import { toneTextClass, type SemanticTone } from "../../../../semantic";
import type { ChangeAction } from "../types";

export function changeActionTone(action?: ChangeAction): SemanticTone {
  if (action === "delete") return "danger";
  if (action === "update") return "warning";
  return "success";
}

export function changeActionRowClass(action?: ChangeAction, className?: string) {
  return cn("ms-change-action-row", `ms-change-action-row--${changeActionTone(action)}`, className);
}

export function ChangeActionBadge({
  action,
  compact = false,
  className,
}: {
  action?: ChangeAction;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "ms-inline-badge ms-inline-badge--center ms-change-action-badge",
        compact && "ms-change-action-badge--compact",
        toneTextClass(changeActionTone(action)),
        className,
      )}
    >
      {action === "delete" ? "-" : action === "update" ? "~" : "+"}
    </span>
  );
}
