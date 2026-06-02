export const uiSemanticRecipeAxes = {
  surface: ["page", "panel", "card", "muted", "overlay"],
  intent: ["neutral", "info", "success", "warning", "danger"],
  emphasis: ["plain", "soft", "solid"],
  state: ["rest", "hover", "selected", "disabled"]
} as const;

export type UiSemanticSurface = (typeof uiSemanticRecipeAxes.surface)[number];
export type UiSemanticIntent = (typeof uiSemanticRecipeAxes.intent)[number];
export type UiSemanticEmphasis = (typeof uiSemanticRecipeAxes.emphasis)[number];
export type UiSemanticState = (typeof uiSemanticRecipeAxes.state)[number];

export type UiSemanticRecipe<Emphasis extends UiSemanticEmphasis = UiSemanticEmphasis> = {
  intent: UiSemanticIntent;
  emphasis: Emphasis;
};

export type UiStatusRecipe = UiSemanticRecipe<Extract<UiSemanticEmphasis, "soft">>;

export type UiStatusRecipeIntentMap = Record<string, UiSemanticIntent> & {
  default: UiSemanticIntent;
};

export type UiStatusRecipeGroup<
  Namespace extends string = string,
  IntentMap extends UiStatusRecipeIntentMap = UiStatusRecipeIntentMap
> = {
  namespace: Namespace;
  intents: IntentMap;
  recipe: (status?: keyof IntentMap | string | null) => UiStatusRecipe;
};

function createStatusRecipe(intent: UiSemanticIntent): UiStatusRecipe {
  return { intent, emphasis: "soft" };
}

export function defineStatusRecipeGroup<
  const Namespace extends string,
  const IntentMap extends UiStatusRecipeIntentMap
>(namespace: Namespace, intents: IntentMap): UiStatusRecipeGroup<Namespace, IntentMap> {
  return {
    namespace,
    intents,
    recipe(status) {
      const key = String(status ?? "default");
      return createStatusRecipe(intents[key] ?? intents.default);
    }
  };
}

export default defineStatusRecipeGroup;

export const uiSemanticRecipeContracts = {
  surface: {
    owner: "Surface",
    use: "Container role, elevation, density, selection, and disabled state.",
    props: ["surface", "intent", "emphasis", "state"],
    legacyProps: ["kind", "tone", "interaction"]
  },
  status: {
    owner: "StatusBadge",
    use: "Status and health labels. Product code maps domain state to intent.",
    props: ["intent", "emphasis"],
    legacyProps: ["tone"]
  },
  action: {
    owner: "Button",
    use: "Command importance and destructive intent.",
    props: ["intent", "emphasis", "size"],
    legacyProps: ["variant", "tone"]
  },
  accent: {
    owner: "accent*Class helpers",
    use: "Entity identity color only, not status or priority.",
    props: ["tone"]
  }
} as const;

export const uiBusinessSemanticExamples = {
  agentRun: defineStatusRecipeGroup("agent.run.status", {
    completed: "success",
    completed_with_warnings: "warning",
    requires_action: "warning",
    failed: "danger",
    default: "neutral"
  }),
  generation: defineStatusRecipeGroup("generation.status", {
    queued: "neutral",
    generating: "info",
    ready: "success",
    rejected: "warning",
    failed: "danger",
    default: "neutral"
  }),
  reviewWorkspace: defineStatusRecipeGroup("review.workspace.status", {
    workspace: "warning",
    changed: "info",
    accepted: "success",
    blocked: "warning",
    applied: "success",
    rejected: "danger",
    default: "neutral"
  })
} as const;
