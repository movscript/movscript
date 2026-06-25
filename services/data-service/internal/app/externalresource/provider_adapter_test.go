package externalresource

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

var _ providercontract.ExternalResourceProvider = httpProviderAdapter{}
var _ providercontract.HealthChecker = httpProviderAdapter{}

func TestPexelsAdapterImplementsExternalResourceProvider(t *testing.T) {
	var gotAuthorization string
	client := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		gotAuthorization = req.Header.Get("Authorization")
		if req.URL.Host != "api.pexels.com" || req.URL.Path != "/v1/search" {
			t.Fatalf("request URL = %s, want Pexels image search", req.URL.String())
		}
		body := `{
			"total_results": 1,
			"next_page": "https://api.pexels.com/v1/search?page=2",
			"photos": [{
				"id": 7,
				"url": "https://www.pexels.com/photo/7",
				"width": 1920,
				"height": 1080,
				"photographer": "Ada",
				"photographer_url": "https://www.pexels.com/@ada",
				"alt": "Delayed reveal",
				"src": {"large": "https://images.pexels.com/large.jpg", "medium": "https://images.pexels.com/medium.jpg"}
			}]
		}`
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(body)),
		}, nil
	})}
	provider, ok := externalResourceProviderFor(ProviderPexels, map[string]string{"api_key": "pexels-secret"}, client)
	if !ok {
		t.Fatal("expected Pexels provider adapter")
	}

	result, err := provider.Search(context.Background(), providercontract.ExternalResourceSearchRequest{
		Query:    "reveal",
		Page:     2,
		PageSize: 15,
	})
	if err != nil {
		t.Fatalf("provider search: %v", err)
	}
	if gotAuthorization != "pexels-secret" {
		t.Fatalf("Authorization header = %q, want configured API key", gotAuthorization)
	}
	if result.Total != 1 || result.NextPage == "" || len(result.Items) != 1 {
		t.Fatalf("provider result = %+v, want one item and next page", result)
	}
	item := result.Items[0]
	if item.ProviderKey != ProviderPexels || item.ExternalID != "7" || item.MediaType != "image" || item.Title != "Delayed reveal" {
		t.Fatalf("provider item = %+v, want normalized Pexels photo", item)
	}
}

func TestExternalResourceProviderHealthProbesProvider(t *testing.T) {
	var sawProbe bool
	client := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		sawProbe = req.URL.Host == "api.pexels.com" && req.URL.Query().Get("query") == "movscript" && req.URL.Query().Get("per_page") == "1"
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"total_results":0,"photos":[]}`)),
		}, nil
	})}
	provider, ok := externalResourceProviderFor(ProviderPexels, map[string]string{"api_key": "pexels-secret"}, client)
	if !ok {
		t.Fatal("expected Pexels provider adapter")
	}
	healthChecker, ok := provider.(providercontract.HealthChecker)
	if !ok {
		t.Fatal("expected provider health checker")
	}

	health := healthChecker.Health(context.Background())

	if !sawProbe {
		t.Fatal("expected health probe search request")
	}
	if health.Status != providercontract.HealthStatusOK || health.Adapter != ProviderPexels {
		t.Fatalf("health = %+v, want pexels ok", health)
	}
}

func TestExternalResourceProviderHealthReportsMissingConfig(t *testing.T) {
	provider, ok := externalResourceProviderFor(ProviderPixabay, map[string]string{}, nil)
	if !ok {
		t.Fatal("expected Pixabay provider adapter")
	}
	healthChecker, ok := provider.(providercontract.HealthChecker)
	if !ok {
		t.Fatal("expected provider health checker")
	}

	health := healthChecker.Health(context.Background())

	if health.Status != providercontract.HealthStatusMissingConfig || health.Adapter != ProviderPixabay {
		t.Fatalf("health = %+v, want pixabay missing config", health)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
