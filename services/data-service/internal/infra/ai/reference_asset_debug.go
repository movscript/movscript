package ai

import (
	"fmt"
	"strings"
)

func referenceAssetDebugBindings(refs []ReferenceAsset, providerField func(ReferenceAsset, int) string) []map[string]any {
	if len(refs) == 0 {
		return nil
	}
	out := make([]map[string]any, 0, len(refs))
	for index, ref := range refs {
		role := strings.TrimSpace(ref.Role)
		mediaType := strings.TrimSpace(ref.MediaType)
		if role == "" && mediaType == "" && ref.ResourceID == 0 {
			continue
		}
		item := map[string]any{"index": index}
		if role != "" {
			item["role"] = role
		}
		if mediaType != "" {
			item["media_type"] = mediaType
		}
		if ref.ResourceID != 0 {
			item["resource_id"] = ref.ResourceID
		}
		if providerField != nil {
			if field := strings.TrimSpace(providerField(ref, index)); field != "" {
				item["provider_field"] = field
			}
		}
		out = append(out, item)
	}
	return out
}

func attachReferenceAssetDebugBindings(body map[string]any, refs []ReferenceAsset, providerField func(ReferenceAsset, int) string) {
	if bindings := referenceAssetDebugBindings(refs, providerField); len(bindings) > 0 {
		body["reference_asset_bindings"] = bindings
	}
}

func cloneDebugMap(body map[string]any) map[string]any {
	if body == nil {
		return map[string]any{}
	}
	out := make(map[string]any, len(body)+1)
	for key, value := range body {
		out[key] = value
	}
	return out
}

func staticReferenceAssetProviderField(field string) func(ReferenceAsset, int) string {
	return func(ReferenceAsset, int) string { return field }
}

func indexedReferenceAssetProviderField(pattern string) func(ReferenceAsset, int) string {
	return func(_ ReferenceAsset, index int) string {
		return fmt.Sprintf(pattern, index)
	}
}
