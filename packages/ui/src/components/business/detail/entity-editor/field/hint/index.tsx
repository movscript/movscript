import type { ReactNode } from "react";

import { ReviewCallout } from "../../../../review";

export function DetailEntityRequiredHint({ children }: { children: ReactNode }) {
  return <ReviewCallout tone="warning" compact className="detail-entity-required-hint">{children}</ReviewCallout>;
}
