import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { Button, StatusBadge, type ButtonProps, type StatusBadgeProps } from "../../../primitives";
import { WorkbenchSurfaceItem } from "../../workbench";

export function ResourceAssetCandidateList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-asset-candidate-list", className)} {...props} />;
}

export function ResourceAssetCandidateCard({
  active,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
}) {
  return (
    <WorkbenchSurfaceItem
      active={active}
      className={cn("resource-asset-candidate-card", className)}
      {...props}
    />
  );
}

export function ResourceAssetCandidateContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-asset-candidate-card__content", className)} {...props} />;
}

export function ResourceAssetCandidateThumb({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-asset-candidate-card__thumb", className)} {...props} />;
}

export function ResourceAssetCandidateBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-asset-candidate-card__body", className)} {...props} />;
}

export function ResourceAssetCandidateTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("resource-asset-candidate-card__title", className)} {...props} />;
}

export function ResourceAssetCandidateMeta({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("resource-asset-candidate-card__meta", className)} {...props} />;
}

export function ResourceAssetCandidateStatus({
  label,
  className,
  ...statusProps
}: Omit<StatusBadgeProps, "children"> & {
  label: ReactNode;
}) {
  return (
    <div className="resource-asset-candidate-card__status">
      <StatusBadge {...statusProps} className={cn("resource-asset-candidate-card__status-badge", className)}>
        {label}
      </StatusBadge>
    </div>
  );
}

export function ResourceAssetCandidateActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-asset-candidate-card__actions", className)} {...props} />;
}

export function ResourceAssetCandidateActionButton({ className, ...props }: ButtonProps) {
  return <Button size="sm" className={cn("resource-asset-candidate-card__action", className)} {...props} />;
}

export function ResourceAssetDetailRoot({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("resource-asset-detail", className)} {...props} />;
}

export function ResourceAssetDetailEmptySlot({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("resource-asset-detail__empty-slot", className)} {...props} />;
}

export function ResourceAssetDetailHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-asset-detail__header", className)} {...props} />;
}

export function ResourceAssetDetailCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-asset-detail__copy", className)} {...props} />;
}

export function ResourceAssetDetailTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("resource-asset-detail__title", className)} {...props} />;
}

export function ResourceAssetDetailSubtitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("resource-asset-detail__subtitle", className)} {...props} />;
}

export function ResourceAssetDetailMetricGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-asset-detail__metric-grid", className)} {...props} />;
}

export function ResourceAssetCandidateSection({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("resource-asset-detail__candidate-section", className)} {...props} />;
}

export function ResourceAssetCandidateToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-asset-detail__candidate-toolbar", className)} {...props} />;
}

export function ResourceAssetCandidateToolbarActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("resource-asset-detail__candidate-actions", className)} {...props} />;
}

export function ResourceAssetCandidateToolbarButton({ className, ...props }: ButtonProps) {
  return <Button size="sm" className={cn("resource-asset-detail__candidate-button", className)} {...props} />;
}
