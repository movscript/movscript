//go:build !runtime_overlay

package ai

import (
	"context"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func distributionProfileRegistryProviderMode(_ string) (string, bool) {
	return "", false
}

func (r *Registry) distributionProfileBuildProvider(_ persistencemodel.AICredential, _ *ModelDef) (Provider, bool, error) {
	return nil, false, nil
}

func (r *Registry) distributionProfileBuildGatewayProvider() (Provider, bool, error) {
	return nil, false, nil
}

func (r *Registry) distributionProfileFileUploader(_ context.Context, _ uint) (FileUploader, bool) {
	return nil, false
}
