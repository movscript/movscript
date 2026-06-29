package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

func TestModelsHandlerListByCapabilityHidesRouteDetails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	catalog := &fakeGatewayModelCatalog{
		models: []providercontract.AIModelDescriptor{{
			ModelID:           "grok-video-public",
			CatalogEntryID:    42,
			ProviderID:        "yunwu-main",
			ProviderModelID:   "grok-video-3",
			ModelIDOverride:   "grok-video-3",
			DisplayName:       "Grok Video",
			ProviderName:      "Yunwu",
			AdapterType:       "yunwu_unified_video",
			Capabilities:      []string{"video_generation"},
			SupportedAPIKinds: []string{"video_i2v"},
			AcceptsImageInput: true,
			Priority:          10,
			CapacityWeight:    2,
			MaxConcurrency:    1,
		}},
	}
	h := NewModelsHandler(catalog)
	router := gin.New()
	router.GET("/models", h.ListByCapability)

	query := url.Values{}
	query.Set("capability", "video_generation")
	query.Set("operation", "first_last_frame_to_video")
	query.Set("reference_assets", `[{"role":"first_frame","media_type":"image"},{"role":"last_frame","media_type":"image"}]`)
	req := httptest.NewRequest(http.MethodGet, "/models?"+query.Encode(), nil)
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", res.Code, http.StatusOK, res.Body.String())
	}
	if len(catalog.filters) != 1 {
		t.Fatalf("filters = %d, want 1", len(catalog.filters))
	}
	filter := catalog.filters[0]
	if filter.Operation != "first_last_frame_to_video" || len(filter.ReferenceAssets) != 2 || filter.ReferenceAssets[1].Role != "last_frame" {
		t.Fatalf("filter = %#v, want operation and reference asset roles", filter)
	}
	payload := res.Body.String()
	if !strings.Contains(payload, `"model_id":"grok-video-public"`) {
		t.Fatalf("response = %s, want public model id", payload)
	}
	for _, forbidden := range []string{
		"provider_id",
		"provider_model_id",
		"adapter_type",
		"model_id_override",
		"route_binding_id",
		"route_bindings",
		"endpoint_base_url",
		"endpoint_path_prefix",
		"operation_profile",
		"credential_id",
	} {
		if strings.Contains(payload, forbidden) {
			t.Fatalf("/models response = %s, want no %s", payload, forbidden)
		}
	}
}

type fakeGatewayModelCatalog struct {
	models  []providercontract.AIModelDescriptor
	filters []providercontract.AIModelListFilter
}

func (f *fakeGatewayModelCatalog) ListModels(_ context.Context, filter providercontract.AIModelListFilter) ([]providercontract.AIModelDescriptor, error) {
	f.filters = append(f.filters, filter)
	return f.models, nil
}

func (f *fakeGatewayModelCatalog) ResolveModel(context.Context, providercontract.AIModelResolveRequest) (providercontract.AIModelBinding, error) {
	return providercontract.AIModelBinding{}, nil
}
