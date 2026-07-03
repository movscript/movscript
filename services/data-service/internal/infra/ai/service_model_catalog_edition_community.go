//go:build !runtime_overlay

package ai

import (
	"context"

	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

func (s *AIService) distributionProfileFilterModelCatalog(ctx context.Context, filter providercontract.AIModelListFilter, models []providercontract.AIModelDescriptor) ([]providercontract.AIModelDescriptor, error) {
	return models, nil
}

func (s *AIService) distributionProfileOpenAIProxyTargetForCatalogRoute(ctx context.Context, userID uint, route ModelRoute, requiredCap string) (OpenAIProxyTarget, bool, error) {
	return OpenAIProxyTarget{}, false, nil
}

func (s *AIService) distributionProfileProviderForCatalogRoute(ctx context.Context, userID uint, route ModelRoute, requiredCap string) (Provider, string, bool, error) {
	return nil, "", false, nil
}

func (s *AIService) distributionProfileModelCatalogOnly() bool {
	return false
}
