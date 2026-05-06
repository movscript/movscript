package workflowschema

import (
	"context"

	"github.com/movscript/movscript/internal/app/workflowio"
	"gorm.io/gorm"
)

type Service struct {
	entityIO *workflowio.EntityIOService
}

func NewService(db *gorm.DB) *Service {
	return &Service{entityIO: workflowio.NewEntityIOService(db)}
}

func (s *Service) ListEntitySchemas() []workflowio.EntitySchema {
	return workflowio.EntitySchemas()
}

func (s *Service) EntitySchemaForKind(kind string) (workflowio.EntitySchema, bool) {
	return workflowio.EntitySchemaForKind(kind)
}

func (s *Service) ListEntitySemanticSchemas() []workflowio.EntitySemanticSchema {
	return workflowio.EntitySemanticSchemas()
}

func (s *Service) EntitySemanticSchemaForKind(kind string) (workflowio.EntitySemanticSchema, bool) {
	return workflowio.EntitySemanticSchemaForKind(kind)
}

func (s *Service) EntitySchemaMigrationReportForKind(kind string) (workflowio.EntitySchemaMigrationReport, error) {
	return workflowio.EntitySchemaMigrationReportForKind(kind)
}

func (s *Service) ReadEntitySemanticValues(ctx context.Context, kind string, id uint, fieldIDs []string) (workflowio.EntitySemanticValues, error) {
	if len(fieldIDs) > 0 {
		return s.entityIO.ReadDetailValuesByFields(ctx, kind, id, fieldIDs)
	}
	return s.entityIO.ReadDetailValues(ctx, kind, id)
}
