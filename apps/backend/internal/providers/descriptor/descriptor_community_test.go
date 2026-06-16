//go:build !runtime_overlay

package descriptor

import (
	"testing"

	"github.com/movscript/movscript/internal/providers/contract"
)

func TestCommunityDoesNotContributeEditionDescriptors(t *testing.T) {
	if got := editionBuiltInProviders(); len(got) != 0 {
		t.Fatalf("editionBuiltInProviders() length = %d, want 0", len(got))
	}
	if desc, ok := editionBuiltIn(contract.TypeAIGateway, "future-adapter"); ok {
		t.Fatalf("editionBuiltIn() = %+v, true; want false", desc)
	}
}
