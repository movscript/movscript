import type { ComponentType } from "react";

import type { SemanticTone } from "../../../semantic";

export type ReviewTone = SemanticTone;

export type IconComponent = ComponentType<{ size?: string | number; className?: string }>;
