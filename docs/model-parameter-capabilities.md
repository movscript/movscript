# Model Parameter Capabilities

This document defines how MovScript should model provider/API parameters and
model-specific parameter differences.

## Problem

An adapter type determines the upstream API shape. For example, an
OpenAI-compatible image endpoint, Gemini video endpoint, or Volcengine Ark video
endpoint has a known set of parameters.

The API shape is not enough to describe runtime support. Specific models behind
the same adapter can reject, ignore, narrow, or rename parameters. Treating the
adapter's full parameter list as the model's parameter list makes admin
configuration fragile and lets unsupported parameters leak into provider calls.

## Current State

The current implementation already has a partial model-level override:

- `AdapterDef.ParamSets` declares adapter-level default controls by capability.
- `AIModelConfig.CustomSupportedParams` stores a model-level override.
- Empty `CustomSupportedParams` means inherit adapter defaults.
- `"[]"` means the model explicitly exposes no user-configurable params.
- `ResolveModelDef` merges model config and adapter defaults into
  `ModelDef.SupportedParams`.
- `ValidateGenerationParams` checks generated-job params against
  `ModelDef.SupportedParams`.

The gaps are:

- `ParamDef` mixes UI controls, validation, and provider semantics.
- Model overrides usually copy a complete parameter list, which drifts from
  adapter defaults.
- Not every model invocation path is forced through the same validation and
  normalization layer.
- Presets are templates only; they should not be treated as runtime truth.

## Target Model

Parameter support has three layers.

### 1. Adapter Parameter Schema

The adapter schema describes what the upstream interface can accept for a
capability. It is owned by the adapter implementation.

Examples:

- Volcengine video supports `duration`, `frames`, `aspect_ratio`,
  `resolution`, `seed`, `watermark`, `audio`, `service_tier`.
- Gemini video supports a narrower subset such as `duration` and
  `aspect_ratio`.

Adapter schemas should use MovScript's canonical parameter keys. Provider-native
aliases are handled by normalization and adapter mapping.

### 2. Model Parameter Profile

The model profile describes how a concrete model differs from its adapter
schema. It should be a delta, not a full copied list.

Supported shape:

```json
{
  "allow": ["duration", "aspect_ratio", "resolution"],
  "deny": ["frames", "service_tier"],
  "override": {
    "duration": { "options": ["5", "10"], "default": "5" },
    "resolution": { "options": ["720p"], "default": "720p" }
  },
  "add": [
    { "key": "web_search", "label": "Web Search", "type": "boolean", "default": false }
  ]
}
```

Meaning:

- `allow`: optional allow-list after adapter defaults are loaded.
- `deny`: removes keys from the effective schema.
- `override`: patches existing params by key, or adds the param if it does not
  exist.
- `add`: appends extra model-specific params.

The legacy `[]ParamDef` format remains supported as a full explicit override.

### 3. Effective Parameter Schema

Runtime code must resolve one effective schema before validating or dispatching:

```text
adapter schema + model profile + feature constraints = effective schema
```

The effective schema is the only source used by:

- UI model selectors and generation forms.
- generation job creation validation.
- canvas/plugin AI execution.
- model gateway request validation.
- provider request construction.

## Runtime Rules

1. All incoming user parameters are normalized to canonical keys.
2. Parameters not present in the effective schema are rejected.
3. Values are validated by type, option list, min/max, and cross-parameter rules.
4. Provider adapters receive only normalized and validated request fields.
5. Provider-native aliases are accepted only for backward compatibility and
   should not be exposed in new UI.

## Migration Plan

### Phase 1: No Database Change

- Keep `AIModelConfig.CustomSupportedParams`.
- Add an effective parameter resolver.
- Support both legacy `[]ParamDef` and new profile object JSON.
- Route generated-job validation through the resolver.
- Add tests for adapter defaults, legacy full overrides, explicit empty
  overrides, and profile deltas.

### Phase 2: Centralize Invocation

- Move validation into `AIService` entry points or a shared preflight layer.
- Make GenJob, Canvas, Plugin execution, and Model Gateway use the same
  validation path.
- Return normalized params from validation and pass those into request builders.

### Phase 3: Separate Persistence

Optionally replace `CustomSupportedParams` with clearer fields:

- `adapter_param_schema_version`
- `model_param_profile`
- `effective_param_snapshot` for jobs

Existing `CustomSupportedParams` can be migrated into `model_param_profile`:

- empty string -> inherit adapter schema.
- `[]` -> profile with explicit empty support.
- array -> legacy full override profile.

## Ownership

- Adapter authors own adapter schemas and provider-native mapping.
- Admin/model configuration owns model profiles.
- Feature configuration may narrow exposed defaults but must not expand beyond
  the effective model schema.
- Runtime validation owns enforcement.
