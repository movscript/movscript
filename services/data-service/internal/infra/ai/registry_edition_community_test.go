//go:build !runtime_overlay

package ai

import (
	"context"
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func TestCommunityRegistryDistributionProfileHooksAreNoop(t *testing.T) {
	if mode, ok := distributionProfileRegistryProviderMode("future"); ok || mode != "" {
		t.Fatalf("distributionProfileRegistryProviderMode() = %q, %v; want empty false", mode, ok)
	}
	r := &Registry{}
	if provider, handled, err := r.distributionProfileBuildProvider(persistencemodel.AICredential{}, nil); provider != nil || handled || err != nil {
		t.Fatalf("distributionProfileBuildProvider() = %T, %v, %v; want nil false nil", provider, handled, err)
	}
	if uploader, handled := r.distributionProfileFileUploader(context.Background(), 1); uploader != nil || handled {
		t.Fatalf("distributionProfileFileUploader() = %T, %v; want nil false", uploader, handled)
	}
}
