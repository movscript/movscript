import type { ReactNode } from "react";

import { Badge } from "../../../../primitives";
import type { IconComponent } from "../../../../primitives/types";
import { AppInlineMeta, AppKeyValue, AppMetricCard, AppPanel } from "../../../app";

export function ResourcePreviewStats({
  metrics,
}: {
  metrics: Array<{ icon: IconComponent; label: ReactNode; value: ReactNode }>;
}) {
  return (
    <div className="resource-preview-stats">
      {metrics.map((metric, index) => (
        <AppMetricCard key={index} icon={metric.icon} label={metric.label} value={metric.value} compact />
      ))}
    </div>
  );
}

export function ResourcePreviewMobileTree({
  icon,
  title,
  stats,
  children,
}: {
  icon: IconComponent;
  title: ReactNode;
  stats?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppPanel icon={icon} title={title} action={stats} className="resource-preview-mobile-tree" bodyClassName="resource-preview-mobile-tree__body">
      {children}
    </AppPanel>
  );
}

export function ResourcePreviewMobileNode({
  indexLabel,
  identifier,
  title,
  frameCount,
  description,
}: {
  indexLabel: ReactNode;
  identifier?: ReactNode;
  title: ReactNode;
  frameCount: ReactNode;
  description?: ReactNode;
}) {
  return (
    <AppKeyValue
      label={(
        <span className="resource-preview-mobile-node__label">
          <AppInlineMeta className="resource-preview-mobile-node__index">{indexLabel}</AppInlineMeta>
          {identifier ? <Badge variant="outline" className="resource-preview-mobile-node__identifier">{identifier}</Badge> : null}
          <span className="resource-preview-mobile-node__title">{title}</span>
          <Badge variant="outline" className="resource-preview-mobile-node__count">{frameCount}</Badge>
        </span>
      )}
      value={description}
      valueClassName="resource-preview-mobile-node__description"
    />
  );
}
