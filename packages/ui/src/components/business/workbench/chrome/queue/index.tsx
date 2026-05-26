import { toneTextClass } from "../../../../../semantic";
import { cn } from "../../../../../lib/cn";
import { Badge, ListChecksIcon, ScrollArea, StatusBadge } from "../../../../primitives";
import { WorkbenchKeyValue } from "../../data-display";
import { WorkbenchList, WorkbenchListItem } from "../../list";
import { WorkbenchPanel } from "../../panel";
import { WorkbenchSection } from "../../section";
import { WorkbenchStatusBadge } from "../../card";
import {
  workbenchPriorityLabel,
  workbenchPriorityIntent,
  workbenchStatusLabel,
  workbenchStatusIntent,
} from "../../status";
import type { WorkbenchQueueItem, WorkbenchPriority, WorkbenchStatus } from "../../types";

export function WorkbenchQueueList({
  items,
  selectedId,
  onSelect,
}: {
  items: WorkbenchQueueItem[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <WorkbenchSection title="下一步队列" action={<Badge>{items.length}</Badge>}>
      <WorkbenchList>
        {items.map((item) => (
          <WorkbenchListItem key={item.id} onClick={() => onSelect(item.id)} active={selectedId === item.id}>
            <WorkbenchQueueItemBody item={item} subtitle={item.subtitle} />
          </WorkbenchListItem>
        ))}
      </WorkbenchList>
    </WorkbenchSection>
  );
}

export function WorkbenchSpecializedQueue({
  title = "生产队列",
  items,
  selectedId,
  onSelect,
  className,
  bodyClassName,
}: {
  title?: string;
  items: Array<{
    id: string;
    title: string;
    scope: string;
    status: WorkbenchStatus;
    priority: WorkbenchPriority;
    need?: string;
  }>;
  selectedId: string;
  onSelect: (id: string) => void;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <WorkbenchPanel title={title} icon={ListChecksIcon} action={<Badge>{items.length}</Badge>} className={className} bodyClassName={bodyClassName}>
      <ScrollArea className="workbench-specialized-queue__scroll">
        <WorkbenchList className="workbench-specialized-queue__list">
          {items.map((item) => (
            <WorkbenchListItem key={item.id} onClick={() => onSelect(item.id)} active={selectedId === item.id}>
              <WorkbenchQueueItemBody item={item} subtitle={item.scope} description={item.need} />
            </WorkbenchListItem>
          ))}
        </WorkbenchList>
      </ScrollArea>
    </WorkbenchPanel>
  );
}

export function WorkbenchQueueMiniMetric({
  label,
  value,
  tone = "default",
  onClick,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warning";
  onClick?: () => void;
}) {
  const content = (
    <>
      <p className="workbench-queue-mini-metric__label">{label}</p>
      <p className={cn("workbench-queue-mini-metric__value", tone === "warning" && toneTextClass("warning"))}>{value}</p>
    </>
  );

  if (onClick) {
    return (
      <WorkbenchListItem type="button" onClick={onClick} density="compact" className="workbench-queue-mini-metric">
        {content}
      </WorkbenchListItem>
    );
  }

  return <WorkbenchKeyValue label={label} value={value} className="workbench-queue-mini-metric workbench-queue-mini-metric--static" />;
}

function WorkbenchQueueItemBody({
  item,
  subtitle,
  description,
}: {
  item: {
    title: string;
    status: WorkbenchStatus;
    priority: WorkbenchPriority;
  };
  subtitle: string;
  description?: string;
}) {
  return (
    <>
      <div className="workbench-queue-item__header">
        <span className="workbench-queue-item__title">{item.title}</span>
        <WorkbenchStatusBadge intent={workbenchStatusIntent(item.status)} label={workbenchStatusLabel(item.status)} />
      </div>
      <p className="workbench-queue-item__subtitle">{subtitle}</p>
      {description ? <p className="workbench-queue-item__description">{description}</p> : null}
      <div className="workbench-queue-item__meta">
        <StatusBadge intent={workbenchPriorityIntent(item.priority)} className="workbench-queue-item__priority">
          {workbenchPriorityLabel(item.priority)}
        </StatusBadge>
        <span className="workbench-queue-item__hint">制作条件检查</span>
      </div>
    </>
  );
}
