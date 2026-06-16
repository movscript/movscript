import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { CheckboxField, type CheckboxFieldProps } from "../../../primitives";

export function ResourceAssetCard({
  preview,
  selectControl,
  actionControl,
  sharedBadge,
  typeIcon,
  name,
  size,
  owner,
  selected,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  preview: ReactNode;
  selectControl?: ReactNode;
  actionControl?: ReactNode;
  sharedBadge?: ReactNode;
  typeIcon?: ReactNode;
  name: ReactNode;
  size?: ReactNode;
  owner?: ReactNode;
  selected?: boolean;
}) {
  return (
    <div className={cn("ms-stack resource-asset-card", className)} data-selected={selected ? "true" : undefined} {...props}>
      <div className="resource-asset-card__preview">
        {preview}
        {selectControl ? <div className="resource-asset-card__select">{selectControl}</div> : null}
        {actionControl ? <div className="resource-asset-card__action">{actionControl}</div> : null}
        {sharedBadge ? <div className="resource-asset-card__shared">{sharedBadge}</div> : null}
      </div>
      <div className="ms-action-row resource-asset-card__name-row">
        {typeIcon ? <span className="ms-inline-center resource-asset-card__type-icon">{typeIcon}</span> : null}
        <span className="ms-text-truncate ms-type-label resource-asset-card__name">{name}</span>
      </div>
      {(size || owner || children) ? (
        <div className="ms-action-row resource-asset-card__meta-row">
          {size ? <span className="ms-type-label resource-asset-card__size">{size}</span> : null}
          {owner ? <span className="ms-text-truncate ms-type-label resource-asset-card__owner">{owner}</span> : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function ResourceAssetSelectCheckbox({
  className,
  ...props
}: CheckboxFieldProps) {
  return (
    <CheckboxField
      className={cn("ms-center resource-asset-card__select-control", className)}
      {...props}
    />
  );
}
