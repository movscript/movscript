package workflowschema

import (
	"context"

	"github.com/movscript/movscript/internal/workflow"
	"gorm.io/gorm"
)

type Service struct {
	entityIO *workflow.EntityIOService
}

func NewService(db *gorm.DB) *Service {
	return &Service{entityIO: workflow.NewEntityIOService(db)}
}

func (s *Service) ReadEntitySemanticValues(ctx context.Context, kind string, id uint, fieldIDs []string) (workflow.EntitySemanticValues, error) {
	if len(fieldIDs) > 0 {
		return s.entityIO.ReadDetailValuesByFields(ctx, kind, id, fieldIDs)
	}
	return s.entityIO.ReadDetailValues(ctx, kind, id)
}
