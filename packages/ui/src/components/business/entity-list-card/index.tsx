import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../lib/cn";
import { Badge, Button, StatusBadge, type StatusBadgeProps } from "../../primitives";
import { AppIconFrame } from "../app/display";

export interface EntityListCardChildItem {
  key?: string | number;
  icon?: ReactNode;
  label: ReactNode;
  meta?: ReactNode;
}

export interface EntityListCardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "onSelect"> {
  active?: boolean;
  expanded?: boolean;
  icon?: ReactNode;
  thumbnail?: ReactNode;
  title: ReactNode;
  summary?: ReactNode;
  meta?: ReactNode;
  breadcrumb?: ReactNode;
  childrenLabel?: ReactNode;
  childItems?: EntityListCardChildItem[];
  childOverflowLabel?: ReactNode;
  editState?: ReactNode;
  statusProps?: StatusBadgeProps;
  action?: ReactNode;
  footer?: ReactNode;
  onSelect?: () => void;
}

export function EntityListCard({
  active = false,
  expanded = false,
  icon,
  thumbnail,
  title,
  summary,
  meta,
  breadcrumb,
  childrenLabel,
  childItems,
  childOverflowLabel,
  editState,
  statusProps,
  action,
  footer,
  onSelect,
  className,
  ...props
}: EntityListCardProps) {
  const hasChildren = Boolean(childItems?.length);
  const statusNode = statusProps ? (
    <StatusBadge className="entity-list-card__status" {...statusProps} />
  ) : editState ? (
    <span className="entity-list-card__edit-state">{editState}</span>
  ) : null;
  const cardBody = (
    <>
      <div className="entity-list-card__visual">
        {thumbnail ? (
          <span className="entity-list-card__thumbnail">{thumbnail}</span>
        ) : (
          <AppIconFrame size="sm" tone="neutral" className="entity-list-card__icon">
            {icon}
          </AppIconFrame>
        )}
      </div>
      <div className="entity-list-card__content">
        <div className="entity-list-card__header">
          <span className="entity-list-card__title">{title}</span>
        </div>
        {summary ? <p className="entity-list-card__summary">{summary}</p> : null}
        {(breadcrumb || meta || statusNode) ? (
          <div className="entity-list-card__meta-row">
            {breadcrumb ? <span className="entity-list-card__breadcrumb">{breadcrumb}</span> : null}
            {meta ? <span className="entity-list-card__meta">{meta}</span> : null}
            {statusNode}
          </div>
        ) : null}
        {hasChildren ? (
          <div className="entity-list-card__children" aria-label={typeof childrenLabel === "string" ? childrenLabel : undefined}>
            {childrenLabel ? <span className="entity-list-card__children-label">{childrenLabel}</span> : null}
            <div className="entity-list-card__child-list">
              {childItems?.map((item, index) => (
                <span className="entity-list-card__child-item" key={item.key ?? index}>
                  {item.icon ? <span className="entity-list-card__child-icon">{item.icon}</span> : null}
                  <span className="entity-list-card__child-label">{item.label}</span>
                  {item.meta ? <span className="entity-list-card__child-meta">{item.meta}</span> : null}
                </span>
              ))}
              {childOverflowLabel ? <Badge className="entity-list-card__child-overflow" variant="outline">{childOverflowLabel}</Badge> : null}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <div
      data-active={active ? "true" : undefined}
      data-expanded={expanded ? "true" : undefined}
      className={cn("entity-list-card", className)}
      {...props}
    >
      <div className="entity-list-card__main">
        <Button
          type="button"
          variant="ghost"
          onClick={onSelect}
          className="entity-list-card__select"
        >
          {cardBody}
        </Button>
        {action ? <div className="entity-list-card__action">{action}</div> : null}
      </div>
      {footer ? <div className="entity-list-card__footer">{footer}</div> : null}
    </div>
  );
}
