import type { ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { toneTextClass } from "../../../../../semantic";
import { StatusBadge } from "../../../../primitives";
import type { StatusBadgeProps } from "../../../../primitives";
import { AppKeyValue } from "../../../app";
import { ReviewCallout } from "../../../review";

export function ResourcePreviewMissingAssets({
  icon,
  title,
  assets,
}: {
  icon: ReactNode;
  title: ReactNode;
  assets: Array<{
    id: string | number;
    name: ReactNode;
    description: ReactNode;
    priorityProps: StatusBadgeProps;
    priorityLabel: ReactNode;
  }>;
}) {
  return (
    <ReviewCallout tone="warning" className="resource-preview-missing-assets">
      <div className="resource-preview-missing-assets__header">
        <span className={toneTextClass("warning")}>{icon}</span>
        <span className="resource-preview-missing-assets__title">{title}</span>
      </div>
      <div className="resource-preview-missing-assets__grid">
        {assets.map((asset) => (
          <AppKeyValue
            key={asset.id}
            label={asset.name}
            valueClassName="resource-preview-missing-assets__value"
            value={(
              <span className="resource-preview-missing-assets__value-row">
                <span className="resource-preview-missing-assets__description">{asset.description}</span>
                <StatusBadge {...asset.priorityProps} className={cn("resource-preview-missing-assets__priority", asset.priorityProps.className)}>
                  {asset.priorityLabel}
                </StatusBadge>
              </span>
            )}
          />
        ))}
      </div>
    </ReviewCallout>
  );
}
