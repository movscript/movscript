import { accentDotClass, accentSoftClass, accentTextClass } from "../../../../../semantic";
import { cn } from "../../../../../lib/cn";
import { Progress, StatusBadge } from "../../../../primitives";
import { creativeReferenceKindMeta, creativeReferenceStatusMeta } from "../meta";
import type { CreativeReferenceCardData } from "../types";

export function CreativeReferenceCard({
  reference,
  selected = false,
  onSelect,
  className,
}: {
  reference: CreativeReferenceCardData;
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
}) {
  const meta = creativeReferenceKindMeta[reference.kind];
  const status = creativeReferenceStatusMeta[reference.status] ?? creativeReferenceStatusMeta.workspace;
  const Icon = meta.icon;
  const Component = onSelect ? "button" : "div";

  return (
    <Component
      type={onSelect ? "button" : undefined}
      onClick={onSelect}
      className={cn("creative-reference-card", selected && "creative-reference-card--selected", className)}
    >
      <div className={cn("creative-reference-card__visual", reference.accent)}>
        <div className="creative-reference-card__visual-inner">
          <span className={cn("creative-reference-card__icon", accentSoftClass(meta.tone))}>
            <Icon className={accentTextClass(meta.tone)} />
          </span>
          <div className="creative-reference-card__usage">
            <p className="creative-reference-card__version">{reference.version}</p>
            <p className="creative-reference-card__usage-count">引用 {reference.usage}</p>
          </div>
        </div>
      </div>
      <div className="creative-reference-card__body">
        <div className="creative-reference-card__heading-row">
          <div className="creative-reference-card__heading">
            <div className="creative-reference-card__title-row">
              <span className={cn("creative-reference-card__dot", accentDotClass(meta.tone))} />
              <p className="creative-reference-card__title">{reference.title}</p>
            </div>
            <p className="creative-reference-card__subtitle">{reference.subtitle}</p>
          </div>
          <StatusBadge intent={status.intent} className="creative-reference-card__status">{status.label}</StatusBadge>
        </div>
        <p className="creative-reference-card__summary">{reference.summary}</p>
        <div className="creative-reference-card__coverage">
          <div className="creative-reference-card__coverage-meta">
            <span>完整度</span>
            <span className="creative-reference-card__coverage-value">{reference.coverage}%</span>
          </div>
          <Progress value={reference.coverage} className="creative-reference-card__progress" />
        </div>
      </div>
    </Component>
  );
}
