//go:build !enterprise

package modelgateway

import (
	"context"

	"github.com/movscript/movscript/internal/domain/model"
)

type CommercialAPIKeyCreateInput struct{}

type CommercialAPIKeyUpdateInput struct{}

func applyAPIKeyCommercialCreateFields(key *model.GatewayAPIKey, input CommercialAPIKeyCreateInput) {}

func applyAPIKeyCommercialUpdateFields(updates map[string]any, input CommercialAPIKeyUpdateInput) {}

func (p *PolicyService) enforceKeyCommercialLimits(ctx context.Context, key *model.GatewayAPIKey, estimatedCost float64) error {
	return nil
}
