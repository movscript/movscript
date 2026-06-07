export type IdentityKind = "agent" | "model";
export type IdentitySize = "xs" | "sm" | "md";
export type IdentityBadgeVariant = "compact" | "label" | "stack";

export type IdentityAsset = {
  id: string;
  label: string;
  shortLabel: string;
  description?: string;
  assetPath: string;
  color: string;
  background: string;
  border: string;
  aliases: string[];
};

const identityAssetBasePath = "/assets/identity";

export const agentIdentityRegistry = {
  codex: {
    id: "codex",
    label: "Codex",
    shortLabel: "CX",
    description: "Coding agent",
    assetPath: `${identityAssetBasePath}/agents/codex.svg`,
    color: "#2563eb",
    background: "#eff6ff",
    border: "#bfdbfe",
    aliases: ["codex", "openai-codex", "openai_codex"],
  },
  mova: {
    id: "mova",
    label: "Mova",
    shortLabel: "MV",
    description: "MovScript agent",
    assetPath: `${identityAssetBasePath}/agents/mova.svg`,
    color: "#0f766e",
    background: "#ecfdf5",
    border: "#99f6e4",
    aliases: ["mova", "movscript", "movscript-agent", "movscript_agent"],
  },
} as const satisfies Record<string, IdentityAsset>;

export const modelIdentityRegistry = {
  gpt: {
    id: "gpt",
    label: "GPT",
    shortLabel: "GPT",
    description: "OpenAI GPT model family",
    assetPath: `${identityAssetBasePath}/models/gpt.svg`,
    color: "#0f766e",
    background: "#ecfdf5",
    border: "#99f6e4",
    aliases: ["gpt", "openai", "chatgpt", "o1", "o3", "o4"],
  },
  claude: {
    id: "claude",
    label: "Claude",
    shortLabel: "CL",
    description: "Anthropic Claude model family",
    assetPath: `${identityAssetBasePath}/models/claude.svg`,
    color: "#c2410c",
    background: "#fff7ed",
    border: "#fed7aa",
    aliases: ["claude", "anthropic", "sonnet", "opus", "haiku"],
  },
} as const satisfies Record<string, IdentityAsset>;

export const fallbackIdentityAsset: Record<IdentityKind, IdentityAsset> = {
  agent: {
    id: "unknown-agent",
    label: "Agent",
    shortLabel: "AG",
    description: "Unregistered agent",
    assetPath: `${identityAssetBasePath}/agents/fallback.svg`,
    color: "#475569",
    background: "#f8fafc",
    border: "#cbd5e1",
    aliases: [],
  },
  model: {
    id: "unknown-model",
    label: "Model",
    shortLabel: "MD",
    description: "Unregistered model family",
    assetPath: `${identityAssetBasePath}/models/fallback.svg`,
    color: "#475569",
    background: "#f8fafc",
    border: "#cbd5e1",
    aliases: [],
  },
};

export function resolveIdentityAsset(kind: IdentityKind, value: string | undefined | null): IdentityAsset {
  const normalized = normalizeIdentityKey(value);
  const registry = kind === "agent" ? agentIdentityRegistry : modelIdentityRegistry;
  if (!normalized) return fallbackIdentityAsset[kind];

  for (const asset of Object.values(registry) as IdentityAsset[]) {
    if (asset.id === normalized || asset.aliases.some((alias: string) => matchesIdentityAlias(normalized, alias))) return asset;
  }
  return fallbackIdentityAsset[kind];
}

function matchesIdentityAlias(value: string, alias: string): boolean {
  const normalizedAlias = normalizeIdentityKey(alias);
  return value === normalizedAlias || value.startsWith(`${normalizedAlias}-`) || value.startsWith(`${normalizedAlias}_`);
}

function normalizeIdentityKey(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "-");
}
