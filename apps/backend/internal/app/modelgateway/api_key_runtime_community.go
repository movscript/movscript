//go:build !runtime_overlay

package modelgateway

import (
	"context"

	domainmodelgateway "github.com/movscript/movscript/internal/domain/modelgateway"
)

type APIKeyCreateRuntimeInput struct{}

type APIKeyUpdateRuntimeInput struct{}

func applyAPIKeyRuntimeCreateFields(key *domainmodelgateway.APIKey, input APIKeyCreateRuntimeInput) {
}

func applyAPIKeyRuntimeUpdateFields(key *domainmodelgateway.APIKey, input APIKeyUpdateRuntimeInput) {}

func (p *PolicyService) enforceKeyRuntimeLimits(ctx context.Context, key *domainmodelgateway.APIKey, estimatedCost float64) error {
	return nil
}
