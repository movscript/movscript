//go:build !runtime_overlay

package gateway

import (
	"context"

	domaingateway "github.com/movscript/movscript/internal/domain/gateway"
	"github.com/movscript/movscript/internal/infra/ai"
)

type APIKeyCreateRuntimeInput struct{}

type APIKeyUpdateRuntimeInput struct{}

func applyAPIKeyRuntimeCreateFields(key *domaingateway.APIKey, input APIKeyCreateRuntimeInput) {
}

func applyAPIKeyRuntimeUpdateFields(key *domaingateway.APIKey, input APIKeyUpdateRuntimeInput) {}

func apiKeyUpdateColumns() []string {
	return []string{"name", "project_id", "allowed_model_ids", "allowed_scopes", "is_enabled"}
}

func (p *PolicyService) enforceKeyRuntimeLimits(ctx context.Context, key *domaingateway.APIKey, estimatedCost float64) error {
	return nil
}

func APIKeyProviderRouteGroup(key *domaingateway.APIKey) string {
	return ""
}

func (s *Service) providerRouteGroupForPrincipal(ctx context.Context, principal Principal) string {
	return APIKeyProviderRouteGroup(principal.Key)
}

func (s *Service) providerRouteContextForPrincipal(ctx context.Context, principal Principal) context.Context {
	return ai.WithProviderRouteGroup(ctx, s.providerRouteGroupForPrincipal(ctx, principal))
}
