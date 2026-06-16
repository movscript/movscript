//go:build !runtime_overlay

package assembly

import (
	"context"
	"testing"

	"github.com/movscript/movscript/internal/infra/config"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

func TestCommunityDoesNotOverrideStartupProviderInstanceTests(t *testing.T) {
	err, handled := editionStartupProviderInstanceTest(context.Background(), &config.Config{}, config.ProviderInstance{
		Type:    providercontract.TypeAIGateway,
		Adapter: "future",
	})
	if err != nil || handled {
		t.Fatalf("editionStartupProviderInstanceTest() = err %v handled %v, want nil false", err, handled)
	}
}
