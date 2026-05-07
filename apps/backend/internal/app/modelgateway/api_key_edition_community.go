//go:build !enterprise

package modelgateway

import (
	"context"

	domainmodelgateway "github.com/movscript/movscript/internal/domain/modelgateway"
)

type APIKeyCreateEditionInput struct{}

type APIKeyUpdateEditionInput struct{}

func applyAPIKeyEditionCreateFields(key *domainmodelgateway.APIKey, input APIKeyCreateEditionInput) {
}

func applyAPIKeyEditionUpdateFields(updates map[string]any, input APIKeyUpdateEditionInput) {}

func (p *PolicyService) enforceKeyEditionLimits(ctx context.Context, key *domainmodelgateway.APIKey, estimatedCost float64) error {
	return nil
}
