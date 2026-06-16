import { accentSoftClass, accentTextClass } from "../../../../../semantic";
import { cn } from "../../../../../lib/cn";
import { AppIconFrame, AppInlineMeta } from "../../../app";
import { Button } from "../../../../primitives/button";
import { FrameActions, FrameBody, FrameHeader, FrameHeading } from "../../../../primitives/frame";
import { Input } from "../../../../primitives/input";
import { CheckIcon, CircleIcon, LoaderIcon, MoreHorizontalIcon, PlayIcon } from "../../../../primitives/icons";
import { NativeSelect } from "../../../../primitives/select";
import { CanvasCardShell } from "../../card";
import { CanvasIOBodyBlock } from "../body";
import { CanvasIOPortKindBadge } from "../badge";
import { CanvasIOEmptyRow, CanvasIOMetaPill } from "../meta";
import { CanvasIOPortRow } from "../port";
import { CanvasIOSectionTitle } from "../section";
import { CanvasIOStateTile } from "../state";
import type { CanvasIOActionCardProps } from "../types";

export function CanvasIOActionCard({
  tone,
  icon: Icon,
  title,
  subtitle,
  status,
  selected,
  port,
  metaItems = [],
  state,
  stateLabel,
  bodyLabel,
  bodyValue,
  emptyLabel,
  editableFields,
  primaryAction,
  footer,
  className,
  renderPortHandle,
}: CanvasIOActionCardProps) {
  const PrimaryIcon = primaryAction?.icon ?? PlayIcon;
  const isPending = state === "pending";

  return (
    <CanvasCardShell selected={selected} className={cn("ms-type-label canvas-io-action-card", className)}>
      <FrameHeader as="header" className={cn("canvas-io-action-card__header", accentSoftClass(tone))}>
        <FrameHeading className="canvas-io-action-card__heading">
          <AppIconFrame>
            <Icon size={14} className={accentTextClass(tone)} />
          </AppIconFrame>
          <div className="canvas-io-action-card__title-block">
            <div className="ms-action-row canvas-io-action-card__title-row">
              <CanvasIOPortKindBadge portType={port.type} tone={tone} />
              <p className="ms-frame__title ms-text-truncate ms-type-body canvas-io-action-card__title">{title}</p>
              {status ? <AppInlineMeta className="canvas-io-action-card__status">{status}</AppInlineMeta> : null}
            </div>
            {subtitle ? <p className="ms-frame__description ms-text-truncate ms-type-caption canvas-io-action-card__subtitle">{subtitle}</p> : null}
          </div>
          <Button size="icon-xs" variant="ghost" className="canvas-io-action-card__menu-button" aria-label="More">
            <MoreHorizontalIcon size={14} />
          </Button>
        </FrameHeading>
      </FrameHeader>

      <FrameBody className="ms-grid-stack canvas-io-action-card__body">
        <div>
          <CanvasIOSectionTitle icon={<Icon size={12} />} label={bodyLabel} />
          <CanvasIOPortRow port={port} state={state} renderPortHandle={renderPortHandle} />
        </div>

        {editableFields ? (
          <div className="canvas-io-action-card__editable-fields nodrag nopan">
            <label className="ms-grid-stack ms-type-tiny canvas-io-action-card__editable-field">
              <span className="ms-text-truncate">{editableFields.nameLabel}</span>
              <Input
                controlSize="sm"
                variant="subtle"
                className="ms-type-tiny"
                value={editableFields.nameValue}
                placeholder={editableFields.namePlaceholder}
                onChange={editableFields.onNameChange}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              />
            </label>
            <label className="ms-grid-stack ms-type-tiny canvas-io-action-card__editable-field canvas-io-action-card__editable-field--order">
              <span className="ms-text-truncate">{editableFields.orderLabel}</span>
              <Input
                controlSize="sm"
                variant="subtle"
                className="ms-type-tiny"
                type="number"
                min={1}
                step={1}
                value={editableFields.orderValue ?? ""}
                onChange={editableFields.onOrderChange}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              />
            </label>
            {editableFields.typeOptions?.length ? (
              <label className="ms-grid-stack ms-type-tiny canvas-io-action-card__editable-field canvas-io-action-card__editable-field--type">
                <span className="ms-text-truncate">{editableFields.typeLabel}</span>
                <NativeSelect
                  controlSize="sm"
                  variant="subtle"
                  className="ms-type-tiny"
                  value={editableFields.typeValue}
                  onChange={editableFields.onTypeChange}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  {editableFields.typeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </NativeSelect>
              </label>
            ) : null}
          </div>
        ) : null}

        <div className="canvas-io-action-card__metrics">
          <div className="ms-grid-stack canvas-io-action-card__meta-list">
            {metaItems.length > 0 ? (
              metaItems.slice(0, 2).map((item) => <CanvasIOMetaPill key={item.id} item={item} />)
            ) : (
              <CanvasIOEmptyRow label={emptyLabel ?? stateLabel} />
            )}
          </div>
          <CanvasIOStateTile
            state={state}
            label={stateLabel}
            pendingIcon={<LoaderIcon size={14} className="canvas-io-action-card__spin-icon" />}
            readyIcon={<CheckIcon size={14} />}
            emptyIcon={<CircleIcon size={14} />}
          />
        </div>

        <CanvasIOBodyBlock state={state} value={bodyValue} emptyLabel={emptyLabel ?? stateLabel} />
      </FrameBody>

      {primaryAction || footer ? (
        <FrameActions className="canvas-io-action-card__footer">
          {primaryAction ? (
            <Button
              size="sm"
              className="canvas-io-action-card__primary-action"
              disabled={primaryAction.disabled}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                primaryAction.onClick?.();
              }}
            >
              <PrimaryIcon size={12} className={cn(isPending && "canvas-io-action-card__spin-icon")} />
              {primaryAction.label}
            </Button>
          ) : null}
          {footer ? <div className={primaryAction ? "canvas-io-action-card__footer-extra" : undefined}>{footer}</div> : null}
        </FrameActions>
      ) : null}
    </CanvasCardShell>
  );
}
