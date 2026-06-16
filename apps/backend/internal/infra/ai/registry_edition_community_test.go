//go:build !runtime_overlay

package ai

import (
	"context"
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func TestCommunityRegistryEditionHooksAreNoop(t *testing.T) {
	if mode, ok := editionRegistryProviderMode("future"); ok || mode != "" {
		t.Fatalf("editionRegistryProviderMode() = %q, %v; want empty false", mode, ok)
	}
	r := &Registry{}
	if provider, handled, err := r.editionBuildProvider(persistencemodel.AICredential{}, nil); provider != nil || handled || err != nil {
		t.Fatalf("editionBuildProvider() = %T, %v, %v; want nil false nil", provider, handled, err)
	}
	if uploader, handled := r.editionFileUploader(context.Background(), 1, persistencemodel.AIModelConfig{}); uploader != nil || handled {
		t.Fatalf("editionFileUploader() = %T, %v; want nil false", uploader, handled)
	}
	if result, handled := r.editionDebugCall(context.Background(), 1, persistencemodel.AIModelConfig{}, persistencemodel.AICredential{}, nil, "model"); handled || result.Error != "" {
		t.Fatalf("editionDebugCall() = %+v, %v; want zero false", result, handled)
	}
}
