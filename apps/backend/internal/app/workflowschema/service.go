package workflowschema

import (
	"context"

	"github.com/movscript/movscript/internal/domain/workflow"
	"gorm.io/gorm"
)

type Service struct {
	entityIO *workflow.EntityIOService
}

func NewService(db *gorm.DB) *Service {
	return &Service{entityIO: workflow.NewEntityIOService(db)}
}

func (s *Service) ListEntitySchemas() []workflow.EntitySchema {
	return workflow.EntitySchemas()
}

func (s *Service) EntitySchemaForKind(kind string) (workflow.EntitySchema, bool) {
	return workflow.EntitySchemaForKind(kind)
}

func (s *Service) ListEntitySemanticSchemas() []workflow.EntitySemanticSchema {
	return workflow.EntitySemanticSchemas()
}

func (s *Service) EntitySemanticSchemaForKind(kind string) (workflow.EntitySemanticSchema, bool) {
	return workflow.EntitySemanticSchemaForKind(kind)
}

func (s *Service) EntitySchemaMigrationReportForKind(kind string) (workflow.EntitySchemaMigrationReport, error) {
	return workflow.EntitySchemaMigrationReportForKind(kind)
}

func (s *Service) ReadEntitySemanticValues(ctx context.Context, kind string, id uint, fieldIDs []string) (workflow.EntitySemanticValues, error) {
	if len(fieldIDs) > 0 {
		return s.entityIO.ReadDetailValuesByFields(ctx, kind, id, fieldIDs)
	}
	return s.entityIO.ReadDetailValues(ctx, kind, id)
}
