package externalresource

import (
	"context"
	"errors"
	"net/http"
	"strings"

	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

type httpProviderAdapter struct {
	providerKey string
	config      map[string]string
	httpClient  *http.Client
}

func NewProviderAdapter(providerKey string, config map[string]string, httpClient *http.Client) (providercontract.ExternalResourceProvider, bool) {
	return externalResourceProviderFor(providerKey, config, httpClient)
}

func externalResourceProviderFor(providerKey string, config map[string]string, httpClient *http.Client) (providercontract.ExternalResourceProvider, bool) {
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	switch providerKey {
	case ProviderPexels, ProviderPixabay:
		return httpProviderAdapter{providerKey: providerKey, config: config, httpClient: httpClient}, true
	default:
		return nil, false
	}
}

func (p httpProviderAdapter) Search(ctx context.Context, request providercontract.ExternalResourceSearchRequest) (providercontract.ExternalResourceSearchResult, error) {
	switch p.providerKey {
	case ProviderPexels:
		return p.searchPexels(ctx, request)
	case ProviderPixabay:
		return p.searchPixabay(ctx, request)
	default:
		return providercontract.ExternalResourceSearchResult{}, ErrInvalidConfig
	}
}

func (p httpProviderAdapter) Health(ctx context.Context) providercontract.ProviderHealth {
	health := providercontract.ProviderHealth{
		Type:     providercontract.TypeExternalResource,
		Adapter:  strings.TrimSpace(p.providerKey),
		Assembly: providercontract.AssemblyStartup,
		Status:   providercontract.HealthStatusOK,
		Message:  "external resource provider probe succeeded",
		Capabilities: []string{
			"resource.search",
			"health.probe",
		},
	}
	_, err := p.Search(ctx, providercontract.ExternalResourceSearchRequest{
		Query:     "movscript",
		MediaType: "image",
		Page:      1,
		PageSize:  1,
	})
	if err == nil {
		return health
	}
	if errors.Is(err, ErrInvalidConfig) {
		health.Status = providercontract.HealthStatusMissingConfig
		health.Message = "external resource api key is required"
		return health
	}
	health.Status = providercontract.HealthStatusError
	health.Message = err.Error()
	return health
}

func externalResourceItemsToProviderContract(items []ExternalResourceItem) []providercontract.ExternalResourceItem {
	out := make([]providercontract.ExternalResourceItem, 0, len(items))
	for _, item := range items {
		out = append(out, providercontract.ExternalResourceItem{
			ProviderKey:     item.ProviderKey,
			ExternalID:      item.ExternalID,
			MediaType:       item.MediaType,
			Title:           item.Title,
			Description:     item.Description,
			ThumbnailURL:    item.ThumbnailURL,
			PreviewURL:      item.PreviewURL,
			SourceURL:       item.SourceURL,
			Width:           item.Width,
			Height:          item.Height,
			DurationSeconds: item.DurationSeconds,
			AuthorName:      item.AuthorName,
			AuthorURL:       item.AuthorURL,
			AttributionText: item.AttributionText,
			LicenseLabel:    item.LicenseLabel,
		})
	}
	return out
}

func externalResourceItemsFromProviderContract(items []providercontract.ExternalResourceItem) []ExternalResourceItem {
	out := make([]ExternalResourceItem, 0, len(items))
	for _, item := range items {
		out = append(out, ExternalResourceItem{
			ProviderKey:     item.ProviderKey,
			ExternalID:      item.ExternalID,
			MediaType:       item.MediaType,
			Title:           item.Title,
			Description:     item.Description,
			ThumbnailURL:    item.ThumbnailURL,
			PreviewURL:      item.PreviewURL,
			SourceURL:       item.SourceURL,
			Width:           item.Width,
			Height:          item.Height,
			DurationSeconds: item.DurationSeconds,
			AuthorName:      item.AuthorName,
			AuthorURL:       item.AuthorURL,
			AttributionText: item.AttributionText,
			LicenseLabel:    item.LicenseLabel,
		})
	}
	return out
}
