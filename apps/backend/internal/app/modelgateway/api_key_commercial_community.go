//go:build !enterprise

package modelgateway

import (
	"context"

	domainmodelgateway "github.com/movscript/movscript/internal/domain/modelgateway"
)

type CommercialAPIKeyCreateInput struct{}

type CommercialAPIKeyUpdateInput struct{}

func applyAPIKeyCommercialCreateFields(key *domainmodelgateway.APIKey, input CommercialAPIKeyCreateInput) {
}

func applyAPIKeyCommercialUpdateFields(updates map[string]any, input CommercialAPIKeyUpdateInput) {}

func (p *PolicyService) enforceKeyCommercialLimits(ctx context.Context, key *domainmodelgateway.APIKey, estimatedCost float64) error {
	return nil
}
