//go:build !runtime_overlay

package gateway

import (
	"context"
	"testing"

	domaingateway "github.com/movscript/movscript/internal/domain/gateway"
)

func TestPolicyServiceCommunitySkipsRuntimeKeyLimits(t *testing.T) {
	db := openModelGatewayPolicyTestDB(t)
	policy := NewPolicyService(db)
	key := &domaingateway.APIKey{}

	if err := policy.EnforceKeyLimits(context.Background(), key, 11); err != nil {
		t.Fatalf("community EnforceKeyLimits() error = %v, want nil", err)
	}
}
