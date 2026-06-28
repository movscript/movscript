package ai

import (
	"context"
	"strings"

	infraai "github.com/movscript/movscript/internal/infra/ai"
)

type ModelRouteDiagnoseInput struct {
	PublicModelID   string                             `json:"public_model_id"`
	ModelID         string                             `json:"model_id,omitempty"`
	CatalogEntryID  uint                               `json:"catalog_entry_id,omitempty"`
	RouteBindingID  uint                               `json:"route_binding_id,omitempty"`
	RouteGroup      string                             `json:"route_group,omitempty"`
	Capability      string                             `json:"capability"`
	Operation       string                             `json:"operation,omitempty"`
	Intent          ModelRouteDiagnoseIntent           `json:"intent,omitempty"`
	ReferenceAssets []ModelRouteDiagnoseReferenceAsset `json:"reference_assets,omitempty"`
	APIKind         string                             `json:"api_kind,omitempty"`
	APIKinds        []string                           `json:"api_kinds,omitempty"`
}

type ModelRouteDiagnoseIntent struct {
	Capability      string                             `json:"capability,omitempty"`
	Operation       string                             `json:"operation,omitempty"`
	ReferenceAssets []ModelRouteDiagnoseReferenceAsset `json:"reference_assets,omitempty"`
}

type ModelRouteDiagnoseReferenceAsset struct {
	Role      string `json:"role,omitempty"`
	MediaType string `json:"media_type,omitempty"`
}

func (s *Service) DiagnoseModelRoute(ctx context.Context, input ModelRouteDiagnoseInput) (infraai.ModelRouteDiagnosis, error) {
	modelID := strings.TrimSpace(input.ModelID)
	if modelID == "" {
		modelID = strings.TrimSpace(input.PublicModelID)
	}
	capability := strings.TrimSpace(input.Capability)
	if capability == "" {
		capability = strings.TrimSpace(input.Intent.Capability)
	}
	operation := strings.TrimSpace(input.Operation)
	if operation == "" {
		operation = strings.TrimSpace(input.Intent.Operation)
	}
	referenceAssets := input.ReferenceAssets
	if len(referenceAssets) == 0 {
		referenceAssets = input.Intent.ReferenceAssets
	}
	service := infraai.NewAIService(s.db, s.registry)
	return service.DiagnoseModelRoute(ctx, infraai.ModelRouteRequest{
		ModelID:         modelID,
		CatalogEntryID:  input.CatalogEntryID,
		RouteBindingID:  input.RouteBindingID,
		Capability:      capability,
		Operation:       operation,
		ReferenceAssets: modelRouteDiagnoseReferenceAssetsToInfra(referenceAssets),
		APIKind:         input.APIKind,
		APIKinds:        input.APIKinds,
		RouteGroup:      input.RouteGroup,
	})
}

func modelRouteDiagnoseReferenceAssetsToInfra(values []ModelRouteDiagnoseReferenceAsset) []infraai.RouteReferenceAssetIntent {
	if len(values) == 0 {
		return nil
	}
	out := make([]infraai.RouteReferenceAssetIntent, 0, len(values))
	for _, value := range values {
		out = append(out, infraai.RouteReferenceAssetIntent{
			Role:      value.Role,
			MediaType: value.MediaType,
		})
	}
	return out
}
