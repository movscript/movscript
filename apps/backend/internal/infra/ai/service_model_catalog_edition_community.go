//go:build !runtime_overlay

package ai

import (
	"context"

	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

func (s *AIService) editionFilterModelCatalog(ctx context.Context, filter providercontract.AIModelListFilter, models []providercontract.AIModelDescriptor) ([]providercontract.AIModelDescriptor, error) {
	return models, nil
}
