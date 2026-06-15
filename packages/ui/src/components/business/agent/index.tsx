import type * as React from "react";

import {
  AgentConversationItem as AgentConversationItemComponent,
  AgentNavItem as AgentNavItemComponent,
  type AgentConversationItemProps,
  type AgentNavItemProps,
} from "./shell/sidebar";

export { AgentPanelShell, type AgentPanelShellProps } from "./panel";
export { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "./surface-block";
export type { AgentDensity, AgentMessageRole, AgentRunState, AgentStepState, AgentSurfaceTone } from "./types";
export type { AgentConversationItemProps, AgentNavItemProps };

export type AgentConversationIconSlot = { icon?: React.ReactNode };
export const AgentNavItem = AgentNavItemComponent;
export const AgentConversationItem = AgentConversationItemComponent;

export * from "./shell/layout";
export * from "./shell/sidebar";
export * from "./shell/primitives";
export * from "./page";
export * from "./chat";
export * from "./activity-feed";
export * from "./diagnostic";
export * from "./plan-overview";
export * from "./run-activity";
export * from "./run";
export * from "./composer";
export * from "./message";
export * from "./run-interaction";
export * from "./settings";
