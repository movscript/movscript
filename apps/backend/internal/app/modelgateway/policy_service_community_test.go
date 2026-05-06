//go:build !enterprise

package modelgateway

import (
	"context"
	"testing"

	"github.com/movscript/movscript/internal/domain/model"
)

func TestPolicyServiceCommunitySkipsCommercialKeyLimits(t *testing.T) {
	db := openModelGatewayPolicyTestDB(t)
	policy := NewPolicyService(db)
	key := &model.GatewayAPIKey{
		MonthlyBudget: 10,
	}

	if err := policy.EnforceKeyLimits(context.Background(), key, 11); err != nil {
		t.Fatalf("community EnforceKeyLimits() error = %v, want nil", err)
	}
}
