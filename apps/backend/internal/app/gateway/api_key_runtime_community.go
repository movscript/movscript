//go:build !runtime_overlay

package gateway

import (
	"context"

	domaingateway "github.com/movscript/movscript/internal/domain/gateway"
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

func APIKeyNewAPIGroup(key *domaingateway.APIKey) string {
	return ""
}

func (s *Service) newAPIGroupForPrincipal(ctx context.Context, principal Principal) string {
	return APIKeyNewAPIGroup(principal.Key)
}
