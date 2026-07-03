//go:build !runtime_overlay

package descriptor

import (
	"testing"

	"github.com/movscript/movscript/internal/providers/contract"
)

func TestCommunityDoesNotContributeDistributionProfileDescriptors(t *testing.T) {
	if got := distributionProfileBuiltInProviders(); len(got) != 0 {
		t.Fatalf("distributionProfileBuiltInProviders() length = %d, want 0", len(got))
	}
	if desc, ok := distributionProfileBuiltIn(contract.TypeAIGateway, "future-adapter"); ok {
		t.Fatalf("distributionProfileBuiltIn() = %+v, true; want false", desc)
	}
}
