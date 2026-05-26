import type { ComponentType } from "react";

import type { SemanticTone } from "../../../semantic";

export type ReviewTone = SemanticTone;
export type ChangeAction = "create" | "update" | "delete";
export type ReviewDecision = "accepted" | "rejected";

export type IconComponent = ComponentType<{ size?: string | number; className?: string }>;
