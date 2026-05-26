import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { toneSurfaceClass, toneTextClass } from "../../../semantic";
import { cn } from "../../../lib/cn";
import { Button, type ButtonProps } from "../../primitives";
import { AppChoiceTile, AppControlGroup, AppDataTable, AppDataTableHeader, AppDataTableRow, AppEmptyState, AppIconFrame, AppMetricCard, AppStateMessage, AppSurfaceItem } from "../app";

export function OrganizationStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("organization-stack", className)} {...props} />;
}

export function OrganizationToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("organization-toolbar", className)} {...props} />;
}

export function OrganizationSurface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem className={cn("organization-surface", className)} {...props} />;
}

export function OrganizationSelectCurrentCard({
  icon,
  eyebrow,
  title,
  role,
  action,
  className,
}: HTMLAttributes<HTMLElement> & {
  icon: ReactNode;
  eyebrow: ReactNode;
  title: ReactNode;
  role: ReactNode;
  action?: ReactNode;
}) {
  return (
    <AppSurfaceItem asChild className={cn("organization-select-current-card", className)}>
      <section>
        <div className="organization-select-current-card__content">
          <div className="organization-select-current-card__identity">
            <AppIconFrame className="organization-select-current-card__icon">
              {icon}
            </AppIconFrame>
            <div className="organization-select-current-card__copy">
              <p className="organization-select-current-card__eyebrow">{eyebrow}</p>
              <p className="organization-select-current-card__title">{title}</p>
              <p className="organization-select-current-card__role">{role}</p>
            </div>
          </div>
          {action ? <div className="organization-select-current-card__action">{action}</div> : null}
        </div>
      </section>
    </AppSurfaceItem>
  );
}

export function OrganizationSelectActionTile({
  icon,
  title,
  description,
  className,
  ...props
}: ButtonProps & {
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <AppChoiceTile variant="ghost" className={cn("organization-select-action-tile", className)} {...props}>
      <span className="organization-select-action-tile__header">
        <AppIconFrame size="sm" className="organization-select-action-tile__icon">
          {icon}
        </AppIconFrame>
        <span className="organization-select-action-tile__title">{title}</span>
      </span>
      <span className="organization-select-action-tile__description">{description}</span>
    </AppChoiceTile>
  );
}

export function OrganizationSelectMembershipList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("organization-select-membership-list", className)} {...props} />;
}

export function OrganizationSelectMembershipButton({
  icon,
  title,
  role,
  trailingIcon,
  className,
  ...props
}: ButtonProps & {
  icon: ReactNode;
  title: ReactNode;
  role: ReactNode;
  trailingIcon?: ReactNode;
}) {
  return (
    <AppSurfaceItem asChild className="organization-select-membership-item">
      <Button variant="ghost" className={cn("organization-select-membership-button", className)} {...props}>
        <AppIconFrame size="sm" className="organization-select-membership-button__icon">
          {icon}
        </AppIconFrame>
        <span className="organization-select-membership-button__copy">
          <span className="organization-select-membership-button__title">{title}</span>
          <span className="organization-select-membership-button__role">{role}</span>
        </span>
        {trailingIcon ? <span className="organization-select-membership-button__trailing">{trailingIcon}</span> : null}
      </Button>
    </AppSurfaceItem>
  );
}

export function OrganizationListSurface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem className={cn("organization-list-surface", className)} {...props} />;
}

export function OrganizationListRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("organization-list-row", className)} {...props} />;
}

export function OrganizationJoinCodeCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem className={cn("organization-join-code-card", className)} {...props} />;
}

export function OrganizationUsageMetricGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("organization-usage-metric-grid", className)} {...props} />;
}

export function OrganizationUsageMetricCard({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return <AppMetricCard label={label} value={value} compact />;
}

export function OrganizationUsageCostCard({
  label,
  value,
  detail,
  icon,
}: {
  label: ReactNode;
  value: ReactNode;
  detail: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <AppSurfaceItem className="organization-usage-cost-card">
      <div className="organization-usage-cost-card__label">
        {icon}
        <span>{label}</span>
      </div>
      <div className="organization-usage-cost-card__value">{value}</div>
      <div className="organization-usage-cost-card__detail">{detail}</div>
    </AppSurfaceItem>
  );
}

export function OrganizationTableSurface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem className={cn("organization-table-surface", className)} {...props} />;
}

export function OrganizationDataTable({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <AppDataTable className={cn("organization-data-table", className)} {...props} />;
}

export function OrganizationDataTableHeader(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <AppDataTableHeader {...props} />;
}

export function OrganizationDataTableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("organization-data-table__body", className)} {...props} />;
}

export function OrganizationDataTableRow(props: HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return <AppDataTableRow {...props} />;
}

export function OrganizationDataTableHeadCell({
  align = "left",
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "right" | "center";
}) {
  return <th className={cn("organization-data-table__head-cell", `organization-data-table__cell--${align}`, className)} {...props} />;
}

export function OrganizationDataTableCell({
  align = "left",
  emphasis,
  numeric,
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "right" | "center";
  emphasis?: "normal" | "strong";
  numeric?: boolean;
}) {
  return (
    <td
      className={cn(
        "organization-data-table__cell",
        `organization-data-table__cell--${align}`,
        emphasis === "strong" && "organization-data-table__cell--strong",
        numeric && "organization-data-table__cell--numeric",
        className,
      )}
      {...props}
    />
  );
}

export function OrganizationDataTableEmptyRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="organization-data-table__empty-cell">
        {children}
      </td>
    </tr>
  );
}

export function OrganizationGenerationToolsHeaderCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem className={cn("organization-generation-tools-header-card", className)} {...props} />;
}

export function OrganizationGenerationToolServerSurface({
  invalid,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  invalid?: boolean;
}) {
  return (
    <AppSurfaceItem
      className={cn("organization-generation-tool-server-card", invalid && toneSurfaceClass("danger"), className)}
      {...props}
    />
  );
}

export function OrganizationStatusMessage(props: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  tone?: "neutral" | "info" | "success" | "danger";
}) {
  return <AppStateMessage className="organization-status-message" {...props} />;
}

export function OrganizationEmptyState({
  title,
  compact = true,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  detail?: ReactNode;
  compact?: boolean;
}) {
  return <AppEmptyState title={title} compact={compact} {...props} />;
}

export function OrganizationTabs({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AppControlGroup className={cn("organization-tabs", className)} {...props} />;
}

export function OrganizationTabButton({ className, ...props }: ButtonProps) {
  return <Button size="sm" className={cn("organization-tab-button", className)} {...props} />;
}

export function OrganizationInlineError({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("organization-inline-error", toneTextClass("danger"), className)} {...props} />;
}

export function OrganizationConnectionStatus({
  success,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  success: boolean;
}) {
  return (
    <span
      className={cn("organization-connection-status", success ? toneTextClass("success") : toneTextClass("danger"), className)}
      {...props}
    />
  );
}
