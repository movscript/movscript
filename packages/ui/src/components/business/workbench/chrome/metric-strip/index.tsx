import { WorkbenchMetric as WorkbenchPrimitiveMetric } from "../../data-display";
import { WorkbenchStatusBadge } from "../../card";
import { workbenchStatusIntent, workbenchStatusLabel } from "../../status";
import type { WorkbenchChromeMetric } from "../../types";

export function WorkbenchMetricStrip({ metrics }: { metrics: WorkbenchChromeMetric[] }) {
  return (
    <section className="workbench-metric-strip">
      {metrics.map((metric) => (
        <WorkbenchPrimitiveMetric
          key={metric.label}
          icon={metric.icon}
          label={(
            <span className="workbench-metric-strip__label">
              <span className="workbench-metric-strip__label-text">{metric.label}</span>
              <WorkbenchStatusBadge intent={workbenchStatusIntent(metric.status)} label={workbenchStatusLabel(metric.status)} />
            </span>
          )}
          value={metric.value}
          detail={metric.detail}
          tone={workbenchStatusIntent(metric.status)}
        />
      ))}
    </section>
  );
}
