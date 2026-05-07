//go:build !enterprise

package modelgateway

import (
	"context"
	"testing"

	domainmodelgateway "github.com/movscript/movscript/internal/domain/modelgateway"
)

func TestPolicyServiceCommunitySkipsCommercialKeyLimits(t *testing.T) {
	db := openModelGatewayPolicyTestDB(t)
	policy := NewPolicyService(db)
	key := &domainmodelgateway.APIKey{
		MonthlyBudget: 10,
	}

	if err := policy.EnforceKeyLimits(context.Background(), key, 11); err != nil {
		t.Fatalf("community EnforceKeyLimits() error = %v, want nil", err)
	}
}
