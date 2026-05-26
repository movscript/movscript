import type { ReactNode } from "react";

import { cn } from "../../../../../../lib/cn";
import { toneTextClass } from "../../../../../../semantic";
import { ReviewCallout } from "../../../../review";

export function DetailEntitySourceLockNotice({
  title = "来源已锁定",
  reason,
  fieldsText,
  suffix,
  compact = true,
}: {
  title?: ReactNode;
  reason?: ReactNode;
  fieldsText: ReactNode;
  suffix: ReactNode;
  compact?: boolean;
}) {
  return (
    <ReviewCallout tone="warning" compact={compact}>
      <p className={cn("detail-entity-lock-notice__title", toneTextClass("warning"))}>{title}</p>
      <p className={cn("detail-entity-lock-notice__body", toneTextClass("warning"))}>
        {reason}。已锁定字段：{fieldsText}；{suffix}
      </p>
    </ReviewCallout>
  );
}
