import { accentDotClass, accentSoftClass, accentTextClass } from "../../../../../semantic";
import { cn } from "../../../../../lib/cn";
import { Progress, StatusBadge } from "../../../../primitives";
import { settingKindMeta, settingStatusMeta } from "../meta";
import type { SettingCardData } from "../types";

export function SettingCard({
  reference,
  selected = false,
  onSelect,
  className,
}: {
  reference: SettingCardData;
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
}) {
  const meta = settingKindMeta[reference.kind];
  const status = settingStatusMeta[reference.status] ?? settingStatusMeta.workspace;
  const Icon = meta.icon;
  const Component = onSelect ? "button" : "div";

  return (
    <Component
      type={onSelect ? "button" : undefined}
      onClick={onSelect}
      className={cn("setting-card", selected && "setting-card--selected", className)}
    >
      <div className={cn("setting-card__visual", reference.accent)}>
        <div className="setting-card__visual-inner">
          <span className={cn("setting-card__icon", accentSoftClass(meta.tone))}>
            <Icon className={accentTextClass(meta.tone)} />
          </span>
          <div className="setting-card__usage">
            <p className="setting-card__version">{reference.version}</p>
            <p className="setting-card__usage-count">引用 {reference.usage}</p>
          </div>
        </div>
      </div>
      <div className="setting-card__body">
        <div className="setting-card__heading-row">
          <div className="setting-card__heading">
            <div className="setting-card__title-row">
              <span className={cn("setting-card__dot", accentDotClass(meta.tone))} />
              <p className="setting-card__title">{reference.title}</p>
            </div>
            <p className="setting-card__subtitle">{reference.subtitle}</p>
          </div>
          <StatusBadge intent={status.intent} className="setting-card__status">{status.label}</StatusBadge>
        </div>
        <p className="setting-card__summary">{reference.summary}</p>
        <div className="setting-card__coverage">
          <div className="setting-card__coverage-meta">
            <span>完整度</span>
            <span className="setting-card__coverage-value">{reference.coverage}%</span>
          </div>
          <Progress value={reference.coverage} className="setting-card__progress" />
        </div>
      </div>
    </Component>
  );
}
