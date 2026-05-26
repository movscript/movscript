import { accentBadgeClass, accentSoftClass, accentTextClass } from "../../../../../../semantic";
import { cn } from "../../../../../../lib/cn";
import { PuzzleIcon, SparklesIcon } from "../../../../../primitives/icons";
import { CanvasToolSourceBadge, CanvasToolStatusBadge } from "../../badge";
import type { CanvasToolActionCardProps } from "../../types";

export function CanvasToolActionCardHeader({
  source,
  tone,
  icon,
  title,
  subtitle,
  status,
}: Pick<CanvasToolActionCardProps, "source" | "tone" | "icon" | "title" | "subtitle" | "status">) {
  const resolvedTone = tone ?? (source === "ai" ? "violet" : "cyan");
  const Icon = icon ?? (source === "ai" ? SparklesIcon : PuzzleIcon);

  return (
    <header className="canvas-tool-action-card__header">
      <div className="canvas-tool-action-card__heading">
        <span className={cn("canvas-tool-action-card__icon-frame", accentSoftClass(resolvedTone))}>
          <Icon size={14} className={accentTextClass(resolvedTone)} />
        </span>
        <div className="canvas-tool-action-card__title-block">
          <div className="canvas-tool-action-card__title-row">
            <CanvasToolSourceBadge source={source} className={accentBadgeClass(resolvedTone)} />
            <p className="canvas-tool-action-card__title">{title}</p>
            {status ? <CanvasToolStatusBadge status={status} /> : null}
          </div>
          {subtitle ? <p className="canvas-tool-action-card__subtitle">{subtitle}</p> : null}
        </div>
      </div>
    </header>
  );
}
