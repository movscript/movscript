import { Button } from "../../../../../primitives";
import { PlayIcon } from "../../../../../primitives/icons";
import { CanvasSurfaceItem } from "../../../card";
import type { CanvasToolActionCardProps } from "../../types";

export function CanvasToolActionCardFooter({
  primaryAction,
  secondaryAction,
  footer,
}: Pick<CanvasToolActionCardProps, "primaryAction" | "secondaryAction" | "footer">) {
  const PrimaryIcon = primaryAction?.icon ?? PlayIcon;
  const SecondaryIcon = secondaryAction?.icon;

  return (
    <CanvasSurfaceItem variant="muted" className="canvas-tool-action-card__footer-surface">
      <footer>
        <div className="canvas-tool-action-card__actions">
          {primaryAction ? (
            <Button
              size="sm"
              className="canvas-tool-action-card__primary-action"
              disabled={primaryAction.disabled}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                primaryAction.onClick?.();
              }}
            >
              <PrimaryIcon size={12} />
              {primaryAction.label}
            </Button>
          ) : null}
          {secondaryAction ? (
            <Button
              size="sm"
              variant="outline"
              className="canvas-tool-action-card__secondary-action"
              disabled={secondaryAction.disabled}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                secondaryAction.onClick?.();
              }}
            >
              {SecondaryIcon ? <SecondaryIcon size={12} /> : null}
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
        {footer ? <div className="canvas-tool-action-card__footer-extra">{footer}</div> : null}
      </footer>
    </CanvasSurfaceItem>
  );
}
