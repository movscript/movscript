//go:build !runtime_overlay

package ai

import (
	"context"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func editionRegistryProviderMode(_ string) (string, bool) {
	return "", false
}

func (r *Registry) editionBuildProvider(_ persistencemodel.AICredential, _ *ModelDef) (Provider, bool, error) {
	return nil, false, nil
}

func (r *Registry) editionBuildGatewayProvider() (Provider, bool, error) {
	return nil, false, nil
}

func (r *Registry) editionFileUploader(_ context.Context, _ uint, _ persistencemodel.AIModelConfig) (FileUploader, bool) {
	return nil, false
}

func (r *Registry) editionDebugCall(_ context.Context, _ uint, _ persistencemodel.AIModelConfig, _ persistencemodel.AICredential, _ *ModelDef, _ string) (DebugCallResult, bool) {
	return DebugCallResult{}, false
}
