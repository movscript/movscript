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

func (p *PolicyService) enforceKeyRuntimeLimits(ctx context.Context, key *domaingateway.APIKey, estimatedCost float64) error {
	return nil
}
