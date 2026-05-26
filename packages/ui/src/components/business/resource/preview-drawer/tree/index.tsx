import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Badge, Button, StatusDot } from "../../../../primitives";
import type { StatusDotProps } from "../../../../primitives";
import { AppInlineMeta } from "../../../app";
import { WorkbenchList, WorkbenchListItem, WorkbenchSurfaceItem } from "../../../workbench";

export function ResourcePreviewTreeList({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <WorkbenchList className={className} {...props}>{children}</WorkbenchList>;
}

export function ResourcePreviewRootTreeItem({
  icon,
  title,
  description,
  active,
  onClick,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <WorkbenchListItem onClick={onClick} active={active}>
      <div className="resource-preview-root-tree-item__title">
        {icon}
        <span>{title}</span>
      </div>
      {description ? <p className="resource-preview-root-tree-item__description">{description}</p> : null}
    </WorkbenchListItem>
  );
}

export function ResourcePreviewTreeNode({
  active,
  expanded,
  toggleIcon,
  toggleLabel,
  onToggle,
  onSelect,
  indexLabel,
  identifier,
  title,
  description,
  metaItems,
  children,
}: {
  active?: boolean;
  expanded?: boolean;
  toggleIcon: ReactNode;
  toggleLabel: string;
  onToggle: () => void;
  onSelect: () => void;
  indexLabel: ReactNode;
  identifier?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  metaItems?: ReactNode[];
  children?: ReactNode;
}) {
  return (
    <WorkbenchSurfaceItem active={active} className="resource-preview-tree-node">
      <div className="resource-preview-tree-node__row">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onToggle}
          className="resource-preview-tree-node__toggle"
          aria-label={toggleLabel}
        >
          {toggleIcon}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onSelect}
          className="resource-preview-tree-node__select"
        >
          <div className="resource-preview-tree-node__title-row">
            <AppInlineMeta className="resource-preview-tree-node__index">{indexLabel}</AppInlineMeta>
            {identifier ? <Badge variant="outline" className="resource-preview-tree-node__identifier">{identifier}</Badge> : null}
            <p className="resource-preview-tree-node__title">{title}</p>
          </div>
          {description ? <p className="resource-preview-tree-node__description">{description}</p> : null}
          {metaItems && metaItems.length > 0 ? (
            <div className="resource-preview-tree-node__meta">
              {metaItems.map((item, index) => (
                <span key={index} className="resource-preview-tree-node__meta-item">{item}</span>
              ))}
            </div>
          ) : null}
        </Button>
      </div>
      {expanded ? <div className="resource-preview-tree-node__children">{children}</div> : null}
    </WorkbenchSurfaceItem>
  );
}

export function ResourcePreviewTreeFrameRow({
  statusProps,
  role,
  title,
}: {
  statusProps: StatusDotProps;
  role: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="resource-preview-tree-frame-row">
      <StatusDot {...statusProps} className={cn("resource-preview-tree-frame-row__dot", statusProps.className)} />
      <span className="resource-preview-tree-frame-row__role">{role}</span>
      <span className="resource-preview-tree-frame-row__title">{title}</span>
    </div>
  );
}

export function ResourcePreviewTreeEmpty({ children }: { children: ReactNode }) {
  return <p className="resource-preview-tree-empty">{children}</p>;
}
